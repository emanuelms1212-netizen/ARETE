'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth';
import { clientToken, reviewWeekOf, type GoalVerdict, type Recurrence } from '@/domain';
import { withUser } from '@/persistence';
import type { AreteRepository, GoalInput, TaskInput } from '@/persistence/repository';
import { resolveCurrentDay } from '../current-day';

/**
 * Writes for goals, tasks and habits.
 *
 * Same shape as the day's actions, and for the same reasons: the user comes
 * from the session, the date from the account's own timezone, and nothing is
 * taken from the client that the client could lie about. Ids are accepted —
 * they have to be — but row-level security is what makes an id for someone
 * else's row useless rather than dangerous.
 */
async function withAccount<T>(
  work: (
    repository: AreteRepository,
    context: { userId: string; today: string; timeZone: string },
  ) => Promise<T>,
): Promise<T> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Signed out.');

  const result = await withUser(user.id, async (repository) => {
    // The same date the screen is showing — see `resolveCurrentDay`. A write
    // that lands on a different day from the one the user is looking at is the
    // bug this function exists to prevent.
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    return work(repository, { userId: user.id, today: localDate, timeZone });
  });

  revalidatePath('/plan');
  revalidatePath('/today');
  return result;
}

// --- Goals -----------------------------------------------------------------

export async function createGoalAction(input: GoalInput): Promise<void> {
  if (input.title.trim().length === 0) throw new Error('A goal needs a title.');
  await withAccount((repository, { userId }) =>
    repository.createGoal(userId, { ...input, title: input.title.trim() }),
  );
}

export async function recordMeasurementAction(input: {
  goalId: string;
  value: number;
}): Promise<void> {
  await withAccount((repository, { userId, today, timeZone }) =>
    repository.recordMeasurement(userId, {
      goalId: input.goalId,
      localDate: today,
      timeZone,
      value: input.value,
      // Derived from what the write is, not from when it was sent, so a retry
      // produces the same token and the database rejects the duplicate.
      clientToken: clientToken('measurement', input.goalId, today, input.value),
    }),
  );
}

export async function addMilestoneAction(input: { goalId: string; title: string }): Promise<void> {
  if (input.title.trim().length === 0) throw new Error('A milestone needs a title.');
  await withAccount((repository, { userId }) =>
    repository.addMilestone(userId, { goalId: input.goalId, title: input.title.trim() }),
  );
}

export async function toggleMilestoneAction(input: {
  milestoneId: string;
  done: boolean;
}): Promise<void> {
  await withAccount((repository, { userId }) =>
    repository.setMilestoneDone(userId, input.milestoneId, input.done ? new Date() : null),
  );
}

export async function saveGoalReviewAction(input: {
  goalId: string;
  progressNote: string | null;
  frictionNote: string | null;
  nextCommitment: string | null;
  verdict: GoalVerdict;
}): Promise<void> {
  await withAccount(async (repository, { userId, today, timeZone }) => {
    // The week is named by its first day in the user's own week start, so
    // "which week was this" does not change when they travel.
    const weekStart = reviewWeekOf(today, 1);
    return repository.saveGoalReview(userId, { ...input, weekStart, timeZone });
  });
}

export async function archiveGoalAction(goalId: string): Promise<void> {
  await withAccount((repository, { userId }) => repository.archiveGoal(userId, goalId, new Date()));
}

// --- Tasks -----------------------------------------------------------------

export async function createTaskAction(input: TaskInput): Promise<void> {
  if (input.title.trim().length === 0) throw new Error('A task needs a title.');
  await withAccount((repository, { userId }) =>
    repository.createTask(userId, { ...input, title: input.title.trim() }),
  );
}

export async function setTaskStatusAction(input: {
  taskId: string;
  status: 'open' | 'done' | 'dropped';
}): Promise<void> {
  await withAccount((repository, { userId, today }) =>
    repository.setTaskStatus(userId, {
      taskId: input.taskId,
      status: input.status,
      at: new Date(),
      today,
    }),
  );
}

export async function scheduleTaskAction(input: {
  taskId: string;
  scheduledDate: string | null;
}): Promise<void> {
  await withAccount((repository, { userId }) =>
    repository.updateTask(userId, input.taskId, { scheduledDate: input.scheduledDate }),
  );
}

export async function archiveTaskAction(taskId: string): Promise<void> {
  await withAccount((repository, { userId }) => repository.archiveTask(userId, taskId, new Date()));
}

// --- Habits ----------------------------------------------------------------

export async function createHabitAction(input: {
  title: string;
  kind: 'binary' | 'count' | 'duration' | 'limit';
  unit?: string | null;
  targetValue?: number | null;
  minimumTarget?: number | null;
  schedule?: Recurrence | null;
}): Promise<void> {
  if (input.title.trim().length === 0) throw new Error('A habit needs a title.');
  await withAccount((repository, { userId }) =>
    repository.createHabit(userId, { ...input, title: input.title.trim() }),
  );
}

export async function logHabitAction(input: {
  habitId: string;
  status: 'done' | 'partial' | 'skipped' | 'rest';
  value?: number | null;
  skipReason?: string | null;
}): Promise<void> {
  await withAccount((repository, { userId, today, timeZone }) =>
    repository.logHabit(userId, {
      habitId: input.habitId,
      localDate: today,
      timeZone,
      status: input.status,
      value: input.value ?? null,
      skipReason: input.skipReason ?? null,
      clientToken: clientToken('habit', input.habitId, today, input.status),
    }),
  );
}

export async function setHabitPausedAction(input: {
  habitId: string;
  paused: boolean;
}): Promise<void> {
  await withAccount((repository, { userId }) =>
    repository.setHabitPaused(userId, input.habitId, input.paused ? new Date() : null),
  );
}

export async function archiveHabitAction(habitId: string): Promise<void> {
  await withAccount((repository, { userId }) =>
    repository.archiveHabit(userId, habitId, new Date()),
  );
}
