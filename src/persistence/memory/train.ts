import {
  setLogSchema,
  trainingSetupSchema,
  type TrainingSetup,
  type WorkoutSession,
  type WorkoutSetLog,
  type WorkoutSnapshot,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type FinishWorkoutInput,
  type LogWorkoutSetInput,
  type StartWorkoutInput,
} from '../repository';

/**
 * Train, in memory.
 *
 * Same rules as the SQL adapter, checked by the same contract suite: one
 * running workout per person, a repeated start is the same start, sets are
 * upserted by (workout, exercise, set number), and nothing can be logged to a
 * workout that has finished.
 */
export function createMemoryTrain(
  hooks: {
    /** Keeps onboarding's training answers in step with the Train setup. */
    readonly onSetupSaved?: (userId: string, setup: TrainingSetup) => void;
  } = {},
) {
  let sequence = 0;
  const setups = new Map<string, TrainingSetup>();
  const workouts = new Map<string, WorkoutSession[]>();
  const tokens = new Map<string, string>();

  function listFor(userId: string): WorkoutSession[] {
    let found = workouts.get(userId);
    if (!found) {
      found = [];
      workouts.set(userId, found);
    }
    return found;
  }

  function find(userId: string, workoutId: string): WorkoutSession {
    const found = listFor(userId).find((workout) => workout.id === workoutId);
    if (!found) throw new RecordNotFoundError('No such workout for this account.');
    return found;
  }

  function replace(userId: string, updated: WorkoutSession): WorkoutSession {
    const list = listFor(userId);
    const index = list.findIndex((workout) => workout.id === updated.id);
    list[index] = updated;
    return structuredClone(updated);
  }

  function requireRunning(userId: string, workoutId: string): WorkoutSession {
    const workout = find(userId, workoutId);
    if (workout.status !== 'running')
      throw new InvalidWriteError('That workout has already finished.');
    return workout;
  }

  return {
    async getTrainingSetup(userId: string) {
      const found = setups.get(userId);
      return found ? structuredClone(found) : null;
    },

    async saveTrainingSetup(userId: string, setup: TrainingSetup) {
      const parsed = trainingSetupSchema.parse(setup);
      setups.set(userId, parsed);
      hooks.onSetupSaved?.(userId, parsed);
      return structuredClone(parsed);
    },

    async startWorkout(userId: string, input: StartWorkoutInput) {
      const tokenKey = `${userId}::${input.clientToken}`;
      const existingId = tokens.get(tokenKey);
      if (existingId) return structuredClone(find(userId, existingId));

      if (listFor(userId).some((workout) => workout.status === 'running')) {
        throw new InvalidWriteError('A workout is already running. Finish it or stop it first.');
      }

      sequence += 1;
      const workout: WorkoutSession = {
        id: `workout-${sequence}`,
        localDate: input.localDate,
        status: 'running',
        startedAt: input.startedAt.toISOString(),
        endedAt: null,
        title: input.snapshot.title,
        sessionKey: input.snapshot.sessionKey,
        readiness: input.snapshot.readiness,
        minimumMode: input.snapshot.minimumMode,
        snapshot: structuredClone(input.snapshot),
        notes: null,
        sets: [],
      };
      listFor(userId).push(workout);
      tokens.set(tokenKey, workout.id);
      return structuredClone(workout);
    },

    async getRunningWorkout(userId: string) {
      const found = listFor(userId).find((workout) => workout.status === 'running');
      return found ? structuredClone(found) : null;
    },

    async updateWorkoutSnapshot(userId: string, workoutId: string, snapshot: WorkoutSnapshot) {
      const workout = requireRunning(userId, workoutId);
      return replace(userId, { ...workout, snapshot: structuredClone(snapshot) });
    },

    async logWorkoutSet(userId: string, input: LogWorkoutSetInput) {
      const workout = requireRunning(userId, input.workoutId);
      const parsed = setLogSchema.parse(input);
      if (!workout.snapshot.items.some((item) => item.exerciseSlug === parsed.exerciseSlug)) {
        throw new InvalidWriteError('That exercise is not part of this workout.');
      }
      const set: WorkoutSetLog = {
        ...parsed,
        block: input.block,
        substitutedFrom: input.substitutedFrom,
        performedAt: input.at.toISOString(),
      };
      const sets = workout.sets.filter(
        (existing) =>
          !(existing.exerciseSlug === set.exerciseSlug && existing.setIndex === set.setIndex),
      );
      sets.push(set);
      sets.sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.setIndex - b.setIndex);
      return replace(userId, { ...workout, sets });
    },

    async finishWorkout(userId: string, input: FinishWorkoutInput) {
      const workout = find(userId, input.workoutId);
      // Finishing twice is the same finish: a double-tap must not be an error.
      if (workout.status !== 'running') return structuredClone(workout);
      return replace(userId, {
        ...workout,
        status: input.status,
        endedAt: input.at.toISOString(),
        notes: input.notes,
      });
    },

    async listWorkouts(userId: string, options: { readonly limit?: number } = {}) {
      return [...listFor(userId)]
        .sort(
          (a, b) =>
            b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt),
        )
        .slice(0, options.limit ?? 50)
        .map((workout) => structuredClone(workout));
    },

    async getWorkout(userId: string, workoutId: string) {
      const found = listFor(userId).find((workout) => workout.id === workoutId);
      return found ? structuredClone(found) : null;
    },

    /** Demo seed: a setup and a short history, so progression has something to say. */
    seedTrain(userId: string, seed: { setup: TrainingSetup; workouts: readonly WorkoutSession[] }) {
      setups.set(userId, trainingSetupSchema.parse(seed.setup));
      for (const workout of seed.workouts) listFor(userId).push(structuredClone(workout));
    },

    exportTrain(userId: string) {
      return {
        training_setup: setups.get(userId)
          ? [structuredClone(setups.get(userId)!) as unknown as Record<string, unknown>]
          : [],
        workout_sessions: listFor(userId).map(
          (workout) => structuredClone(workout) as unknown as Record<string, unknown>,
        ),
      };
    },

    forgetWorkouts(userId: string) {
      workouts.delete(userId);
      for (const tokenKey of [...tokens.keys()])
        if (tokenKey.startsWith(`${userId}::`)) tokens.delete(tokenKey);
    },

    deleteTrain(userId: string) {
      setups.delete(userId);
      workouts.delete(userId);
      for (const tokenKey of [...tokens.keys()])
        if (tokenKey.startsWith(`${userId}::`)) tokens.delete(tokenKey);
    },
  };
}
