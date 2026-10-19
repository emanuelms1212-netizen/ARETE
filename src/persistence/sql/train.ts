import {
  setLogSchema,
  trainingSetupSchema,
  type Block,
  type Readiness,
  type TrainingSetup,
  type WorkoutSession,
  type WorkoutSetLog,
  type WorkoutSnapshot,
  type WorkoutStatus,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type FinishWorkoutInput,
  type LogWorkoutSetInput,
  type StartWorkoutInput,
} from '../repository';
import type { SqlExecutor } from '../sql-executor';

/**
 * Train, in SQL.
 *
 * The plan itself is never stored: it is a pure function of the setup and
 * the history, so storing it would only create a second copy to fall out of
 * date. What is stored is what happened — the setup the person saved, each
 * workout with the prescription it started from, and each set.
 */
interface SetupRow {
  goal: TrainingSetup['goal'];
  experience: TrainingSetup['experience'];
  equipment: TrainingSetup['equipment'];
  training_weekdays: number[];
  session_minutes: number;
  activities: TrainingSetup['activities'];
  tennis_weekdays: number[];
  pain_flags: TrainingSetup['painFlags'];
  avoid_exercises: string[];
}

interface WorkoutRow {
  id: string;
  local_date: string;
  status: WorkoutStatus;
  started_at: string | Date;
  ended_at: string | Date | null;
  title_snapshot: string;
  session_key: string;
  readiness: Readiness;
  minimum_mode: boolean;
  snapshot: WorkoutSnapshot;
  notes: string | null;
}

interface SetRow {
  workout_session_id: string;
  exercise_slug: string;
  block: Block | null;
  set_index: number;
  reps: number | null;
  load_kg: string | number | null;
  hold_seconds: number | null;
  distance_m: string | number | null;
  rpe: string | number | null;
  pain: number | null;
  completed: boolean;
  form_ok: boolean | null;
  notes: string | null;
  substituted_from: string | null;
  performed_at: string | Date;
}

const WORKOUT_COLUMNS = `id, local_date::text, status, started_at, ended_at, title_snapshot,
  session_key, readiness, minimum_mode, snapshot, notes`;

const iso = (value: string | Date) => new Date(value).toISOString();
const num = (value: string | number | null) => (value === null ? null : Number(value));

function toSet(row: SetRow): WorkoutSetLog {
  return {
    exerciseSlug: row.exercise_slug,
    block: row.block ?? 'primary',
    setIndex: row.set_index,
    reps: row.reps,
    loadKg: num(row.load_kg),
    seconds: row.hold_seconds,
    distanceM: num(row.distance_m),
    rpe: num(row.rpe),
    pain: row.pain,
    completed: row.completed,
    formOk: row.form_ok,
    notes: row.notes,
    substitutedFrom: row.substituted_from,
    performedAt: iso(row.performed_at),
  };
}

function toWorkout(row: WorkoutRow, sets: readonly WorkoutSetLog[]): WorkoutSession {
  return {
    id: row.id,
    localDate: row.local_date,
    status: row.status,
    startedAt: iso(row.started_at),
    endedAt: row.ended_at === null ? null : iso(row.ended_at),
    title: row.title_snapshot,
    sessionKey: row.session_key,
    readiness: row.readiness,
    minimumMode: row.minimum_mode,
    snapshot: row.snapshot,
    notes: row.notes,
    sets,
  };
}

export function createSqlTrain(executor: SqlExecutor) {
  async function withSets(rows: readonly WorkoutRow[]): Promise<WorkoutSession[]> {
    if (rows.length === 0) return [];
    const result = await executor.query<SetRow>(
      `select workout_session_id, exercise_slug, block, set_index, reps, load_kg, hold_seconds,
              distance_m, rpe, pain, completed, form_ok, notes, substituted_from, performed_at
         from public.workout_logs
        where workout_session_id = any($1::uuid[])
        order by performed_at, set_index`,
      [rows.map((row) => row.id)],
    );
    return rows.map((row) =>
      toWorkout(row, result.rows.filter((set) => set.workout_session_id === row.id).map(toSet)),
    );
  }

  async function load(userId: string, workoutId: string): Promise<WorkoutSession | null> {
    const result = await executor.query<WorkoutRow>(
      `select ${WORKOUT_COLUMNS} from public.workout_sessions where user_id = $1 and id = $2`,
      [userId, workoutId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return (await withSets([row]))[0]!;
  }

  async function requireRunning(userId: string, workoutId: string): Promise<WorkoutSession> {
    const workout = await load(userId, workoutId);
    if (!workout) throw new RecordNotFoundError('No such workout for this account.');
    if (workout.status !== 'running')
      throw new InvalidWriteError('That workout has already finished.');
    return workout;
  }

  return {
    async getTrainingSetup(userId: string): Promise<TrainingSetup | null> {
      const result = await executor.query<SetupRow>(
        `select goal, experience, equipment, training_weekdays, session_minutes, activities,
                tennis_weekdays, pain_flags, avoid_exercises
           from public.training_profile
          where user_id = $1 and setup_confirmed_at is not null`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return trainingSetupSchema.parse({
        goal: row.goal,
        experience: row.experience,
        equipment: row.equipment,
        trainingWeekdays: row.training_weekdays.map(Number),
        sessionMinutes: Number(row.session_minutes),
        activities: row.activities,
        tennisWeekdays: row.tennis_weekdays.map(Number),
        painFlags: row.pain_flags,
        avoidExercises: row.avoid_exercises,
      });
    },

    async saveTrainingSetup(
      userId: string,
      setup: TrainingSetup,
      at: Date,
    ): Promise<TrainingSetup> {
      const parsed = trainingSetupSchema.parse(setup);
      // One row with onboarding's answers: experience, equipment and minutes
      // are the same facts whichever screen last changed them.
      await executor.query(
        `insert into public.training_profile
           (user_id, goal, experience, equipment, training_weekdays, session_minutes,
            activities, tennis_weekdays, pain_flags, avoid_exercises, setup_confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
         on conflict (user_id) do update set
           goal = excluded.goal, experience = excluded.experience, equipment = excluded.equipment,
           training_weekdays = excluded.training_weekdays,
           session_minutes = excluded.session_minutes, activities = excluded.activities,
           tennis_weekdays = excluded.tennis_weekdays, pain_flags = excluded.pain_flags,
           avoid_exercises = excluded.avoid_exercises,
           setup_confirmed_at = excluded.setup_confirmed_at`,
        [
          userId,
          parsed.goal,
          parsed.experience,
          parsed.equipment,
          parsed.trainingWeekdays,
          parsed.sessionMinutes,
          parsed.activities,
          parsed.tennisWeekdays,
          JSON.stringify(parsed.painFlags),
          parsed.avoidExercises,
          at.toISOString(),
        ],
      );
      // Onboarding reads its answers from their own table, so the same three
      // facts are merged into the stored training answer as well.
      await executor.query(
        `insert into public.onboarding_answers (user_id, step, answer)
         values ($1, 'training', $2::jsonb)
         on conflict (user_id, step) do update
           set answer = public.onboarding_answers.answer || excluded.answer, answered_at = now()`,
        [
          userId,
          JSON.stringify({
            experience: parsed.experience,
            equipment: parsed.equipment,
            sessionMinutes: parsed.sessionMinutes,
          }),
        ],
      );
      return parsed;
    },

    async startWorkout(userId: string, input: StartWorkoutInput): Promise<WorkoutSession> {
      const seen = await executor.query<WorkoutRow>(
        `select ${WORKOUT_COLUMNS} from public.workout_sessions where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );
      if (seen.rows[0]) return (await withSets(seen.rows))[0]!;

      const running = await executor.query<{ id: string }>(
        `select id from public.workout_sessions where user_id = $1 and status = 'running' limit 1`,
        [userId],
      );
      if (running.rows[0]) {
        throw new InvalidWriteError('A workout is already running. Finish it or stop it first.');
      }

      const inserted = await executor.query<WorkoutRow>(
        `insert into public.workout_sessions
           (user_id, local_date, timezone, session_key, title_snapshot, readiness, minimum_mode,
            snapshot, started_at, client_token, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'running')
         returning ${WORKOUT_COLUMNS}`,
        [
          userId,
          input.localDate,
          input.timeZone,
          input.snapshot.sessionKey,
          input.snapshot.title,
          input.snapshot.readiness,
          input.snapshot.minimumMode,
          JSON.stringify(input.snapshot),
          input.startedAt.toISOString(),
          input.clientToken,
        ],
      );
      return toWorkout(inserted.rows[0]!, []);
    },

    async getRunningWorkout(userId: string): Promise<WorkoutSession | null> {
      const result = await executor.query<WorkoutRow>(
        `select ${WORKOUT_COLUMNS} from public.workout_sessions
          where user_id = $1 and status = 'running' limit 1`,
        [userId],
      );
      return (await withSets(result.rows))[0] ?? null;
    },

    async updateWorkoutSnapshot(userId: string, workoutId: string, snapshot: WorkoutSnapshot) {
      await requireRunning(userId, workoutId);
      await executor.query(
        `update public.workout_sessions set snapshot = $3::jsonb, title_snapshot = $4
          where user_id = $1 and id = $2 and status = 'running'`,
        [userId, workoutId, JSON.stringify(snapshot), snapshot.title],
      );
      return (await load(userId, workoutId))!;
    },

    async logWorkoutSet(userId: string, input: LogWorkoutSetInput): Promise<WorkoutSession> {
      const workout = await requireRunning(userId, input.workoutId);
      const parsed = setLogSchema.parse(input);
      if (!workout.snapshot.items.some((item) => item.exerciseSlug === parsed.exerciseSlug)) {
        throw new InvalidWriteError('That exercise is not part of this workout.');
      }

      const exercise = await executor.query<{ id: string; name: string }>(
        `select id, name from public.exercises where slug = $1 and user_id is null`,
        [parsed.exerciseSlug],
      );
      const found = exercise.rows[0];
      if (!found) throw new InvalidWriteError(`Unknown exercise “${parsed.exerciseSlug}”.`);

      const timeZone = await executor.query<{ timezone: string }>(
        `select timezone from public.workout_sessions where id = $1`,
        [input.workoutId],
      );

      await executor.query(
        `insert into public.workout_logs
           (user_id, workout_session_id, exercise_id, exercise_slug, exercise_name_snapshot,
            local_date, timezone, block, set_index, reps, load_kg, hold_seconds, distance_m,
            rpe, pain, completed, form_ok, notes, substituted_from, performed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         on conflict (workout_session_id, exercise_slug, set_index) where workout_session_id is not null
         do update set
           reps = excluded.reps, load_kg = excluded.load_kg, hold_seconds = excluded.hold_seconds,
           distance_m = excluded.distance_m, rpe = excluded.rpe, pain = excluded.pain,
           completed = excluded.completed, form_ok = excluded.form_ok, notes = excluded.notes,
           substituted_from = excluded.substituted_from, performed_at = excluded.performed_at`,
        [
          userId,
          input.workoutId,
          found.id,
          parsed.exerciseSlug,
          found.name,
          workout.localDate,
          timeZone.rows[0]?.timezone ?? 'UTC',
          input.block,
          parsed.setIndex,
          parsed.reps,
          parsed.loadKg,
          parsed.seconds,
          parsed.distanceM,
          parsed.rpe,
          parsed.pain,
          parsed.completed,
          parsed.formOk,
          parsed.notes,
          input.substitutedFrom,
          input.at.toISOString(),
        ],
      );
      return (await load(userId, input.workoutId))!;
    },

    async finishWorkout(userId: string, input: FinishWorkoutInput): Promise<WorkoutSession> {
      const workout = await load(userId, input.workoutId);
      if (!workout) throw new RecordNotFoundError('No such workout for this account.');
      if (workout.status !== 'running') return workout;
      await executor.query(
        `update public.workout_sessions
            set status = $3, ended_at = $4, notes = $5
          where user_id = $1 and id = $2 and status = 'running'`,
        [userId, input.workoutId, input.status, input.at.toISOString(), input.notes],
      );
      return (await load(userId, input.workoutId))!;
    },

    async listWorkouts(userId: string, options: { readonly limit?: number } = {}) {
      const result = await executor.query<WorkoutRow>(
        `select ${WORKOUT_COLUMNS} from public.workout_sessions
          where user_id = $1
          order by local_date desc, started_at desc
          limit $2`,
        [userId, options.limit ?? 50],
      );
      return withSets(result.rows);
    },

    async getWorkout(userId: string, workoutId: string) {
      return load(userId, workoutId);
    },
  };
}
