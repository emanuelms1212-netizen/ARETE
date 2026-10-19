'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth';
import { EXERCISES } from '@/content/train/exercises';
import {
  READINESS,
  SubstitutionError,
  buildWorkout,
  clientToken,
  setLogSchema,
  substitute,
  trainingSetupSchema,
  type Readiness,
  type WorkoutSession,
} from '@/domain';
import { withUser } from '@/persistence';
import { InvalidWriteError } from '@/persistence/repository';
import { resolveCurrentDay } from '../current-day';
import { loadTrainContext } from './context';

/**
 * The Train module's writes.
 *
 * Each one re-reads the person from the session and re-derives the plan on
 * the server. The client says *which* session, *how it felt* and *what was
 * lifted*; it never says what the prescription is, which exercises are
 * allowed, or whose workout this is.
 *
 * Refusals the person can act on come back as `{ ok: false, message }` rather
 * than as thrown errors, because a thrown error from a server action reaches
 * the client as a generic failure and the message is lost.
 */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function account() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Signed out.');
  return user;
}

function refusal(error: unknown): { ok: false; message: string } {
  if (error instanceof InvalidWriteError || error instanceof SubstitutionError) {
    return { ok: false, message: error.message };
  }
  throw error;
}

export async function saveTrainingSetupAction(input: unknown): Promise<ActionResult<null>> {
  const user = await account();
  const parsed = trainingSetupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Some answers need another look.',
    };
  }
  await withUser(user.id, (repository) =>
    repository.saveTrainingSetup(user.id, parsed.data, new Date()),
  );
  revalidatePath('/train');
  return { ok: true, value: null };
}

export async function startWorkoutAction(input: {
  sessionKey: string;
  readiness: Readiness;
  minimumMode: boolean;
  attemptToken: string;
}): Promise<ActionResult<WorkoutSession>> {
  const user = await account();
  if (!READINESS.includes(input.readiness)) return { ok: false, message: 'Unknown readiness.' };

  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const context = await loadTrainContext(repository, user.id, localDate);
    if (!context.plan || !context.availability) {
      return { ok: false as const, message: 'Set up your training first.' };
    }
    // Only a session from this person's own plan can be started.
    const session = context.plan.sessions.find((candidate) => candidate.key === input.sessionKey);
    if (!session)
      return { ok: false as const, message: 'That session is not in your plan any more.' };

    const snapshot = buildWorkout({
      session,
      readiness: input.readiness,
      minimumMode: input.minimumMode,
      history: context.history,
      library: EXERCISES,
      availability: context.availability,
    });
    try {
      const workout = await repository.startWorkout(user.id, {
        localDate,
        timeZone,
        snapshot,
        startedAt: new Date(),
        clientToken: clientToken('workout-start', input.attemptToken),
      });
      return { ok: true as const, value: workout };
    } catch (error) {
      return refusal(error);
    }
  });

  revalidatePath('/train');
  return result;
}

export async function logSetAction(input: {
  workoutId: string;
  exerciseSlug: string;
  setIndex: number;
  reps?: number | null;
  loadKg?: number | null;
  seconds?: number | null;
  rpe?: number | null;
  pain?: number | null;
  formOk?: boolean | null;
  notes?: string | null;
  completed?: boolean;
}): Promise<ActionResult<WorkoutSession>> {
  const user = await account();
  const parsed = setLogSchema.safeParse({ distanceM: null, ...input });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'That set does not look right.',
    };
  }

  return withUser(user.id, async (repository) => {
    const running = await repository.getRunningWorkout(user.id);
    if (!running || running.id !== input.workoutId) {
      return { ok: false as const, message: 'That workout is no longer running.' };
    }
    // Block and substitution come from the prescription, not from the client.
    const item = running.snapshot.items.find(
      (candidate) => candidate.exerciseSlug === parsed.data.exerciseSlug,
    );
    if (!item) return { ok: false as const, message: 'That exercise is not part of this workout.' };
    try {
      const workout = await repository.logWorkoutSet(user.id, {
        ...parsed.data,
        workoutId: running.id,
        block: item.block,
        substitutedFrom: item.substitutedFrom,
        at: new Date(),
      });
      return { ok: true as const, value: workout };
    } catch (error) {
      return refusal(error);
    }
  });
}

export async function substituteAction(input: {
  workoutId: string;
  fromSlug: string;
  toSlug: string;
}): Promise<ActionResult<WorkoutSession>> {
  const user = await account();
  return withUser(user.id, async (repository) => {
    const running = await repository.getRunningWorkout(user.id);
    if (!running || running.id !== input.workoutId) {
      return { ok: false as const, message: 'That workout is no longer running.' };
    }
    if (running.sets.some((set) => set.exerciseSlug === input.fromSlug)) {
      return {
        ok: false as const,
        message: 'Sets are already logged for that exercise, so it stays.',
      };
    }
    const { localDate } = await resolveCurrentDay(repository, user);
    const context = await loadTrainContext(repository, user.id, localDate);
    if (!context.availability)
      return { ok: false as const, message: 'Set up your training first.' };
    try {
      const snapshot = substitute(
        running.snapshot,
        input.fromSlug,
        input.toSlug,
        EXERCISES,
        context.availability,
        context.history,
      );
      return {
        ok: true as const,
        value: await repository.updateWorkoutSnapshot(user.id, running.id, snapshot),
      };
    } catch (error) {
      return refusal(error);
    }
  });
}

export async function finishWorkoutAction(input: {
  workoutId: string;
  status: 'completed' | 'abandoned';
  notes?: string | null;
}): Promise<ActionResult<WorkoutSession>> {
  const user = await account();
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 1000) : null;
  if (input.status !== 'completed' && input.status !== 'abandoned') {
    return { ok: false, message: 'Unknown outcome.' };
  }

  const result = await withUser(user.id, async (repository) => {
    const workout = await repository.finishWorkout(user.id, {
      workoutId: input.workoutId,
      status: input.status,
      at: new Date(),
      notes,
    });

    // A finished workout is the day's training commitment done. It is the
    // same fact, and the person should not have to record it twice.
    if (workout.status === 'completed') {
      const { localDate } = await resolveCurrentDay(repository, user);
      const day = await repository.getDay(user.id, localDate);
      const commitment = day?.commitments.find(
        (item) => item.kind === 'workout' && item.status !== 'done',
      );
      if (day && commitment) {
        await repository.setCommitmentStatus(user.id, {
          localDate,
          commitmentId: commitment.id,
          status: 'done',
          at: new Date(),
        });
      }
    }
    return { ok: true as const, value: workout };
  });

  revalidatePath('/train');
  revalidatePath('/today');
  return result;
}
