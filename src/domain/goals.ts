import { z } from 'zod';
import { daysBetween, startOfWeek } from './local-day';
import type { IsoDate } from './types';

/**
 * Goals, and what "progress" is allowed to mean.
 *
 * The brief is specific about this: progress must come from meaningful
 * measures, not raw checkmark volume. That rules out the easy implementation —
 * counting completed tasks and calling the percentage progress — because it
 * rewards creating small tasks and says nothing about whether the goal is
 * nearer. A goal to run 10k is not 60% done because six of ten runs happened.
 *
 * So a goal is measured in one of exactly two ways, and the type makes the
 * second one honest rather than hiding it:
 *
 *   measured    a unit, a start value and a target value, moved by readings
 *   judged      no number; the user decides at review, and the app says so
 *
 * Milestones are shown either way, but they are never silently converted into
 * a percentage.
 */
export const GOAL_STATUSES = ['active', 'paused', 'done', 'abandoned'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_VERDICTS = ['continue', 'adjust', 'pause', 'drop', 'done'] as const;
export type GoalVerdict = (typeof GOAL_VERDICTS)[number];

export const goalSchema = z
  .object({
    id: z.string(),
    title: z.string().min(1),
    /** The motivation. Why this, and why now. */
    why: z.string().nullable().default(null),
    /** The test: how the user will know, without arguing with themselves. */
    successMeasure: z.string().nullable().default(null),
    measureUnit: z.string().nullable().default(null),
    startValue: z.number().nullable().default(null),
    targetValue: z.number().nullable().default(null),
    status: z.enum(GOAL_STATUSES).default('active'),
    targetDate: z.string().nullable().default(null),
    /** "And still true on" — for goals that are habits in disguise. */
    maintenanceDate: z.string().nullable().default(null),
    reviewDay: z.number().int().min(0).max(6).nullable().default(null),
    archivedAt: z.date().nullable().default(null),
  })
  .refine(
    (goal) =>
      (goal.targetValue === null && goal.startValue === null && goal.measureUnit === null) ||
      (goal.targetValue !== null && goal.measureUnit !== null),
    {
      message: 'A measured goal needs both a unit and a target value, or neither.',
      path: ['targetValue'],
    },
  );
export type Goal = z.infer<typeof goalSchema>;

export interface Measurement {
  readonly localDate: IsoDate;
  readonly value: number;
}

export interface Milestone {
  readonly id: string;
  readonly title: string;
  readonly dueDate: IsoDate | null;
  readonly completedAt: Date | null;
}

export type GoalProgress =
  | {
      readonly kind: 'measured';
      /** 0–1, clamped. Null before the first reading. */
      readonly ratio: number | null;
      readonly latest: number | null;
      readonly startValue: number;
      readonly targetValue: number;
      readonly unit: string;
      /** True when the target is below the start, so progress counts downward. */
      readonly descending: boolean;
      readonly summary: string;
    }
  | {
      readonly kind: 'judged';
      readonly milestonesDone: number;
      readonly milestonesTotal: number;
      readonly summary: string;
    };

/**
 * Where a goal actually stands.
 *
 * A descending goal — body weight, time to run a distance, hours on a phone —
 * is the case that catches naive implementations: without the `descending`
 * branch, moving from 90 toward a target of 80 reads as negative progress.
 */
export function goalProgress(
  goal: Goal,
  measurements: readonly Measurement[],
  milestones: readonly Milestone[] = [],
): GoalProgress {
  const milestonesDone = milestones.filter((m) => m.completedAt !== null).length;

  if (goal.targetValue === null || goal.measureUnit === null) {
    return {
      kind: 'judged',
      milestonesDone,
      milestonesTotal: milestones.length,
      summary:
        milestones.length === 0
          ? 'Judged at review, not by a number.'
          : `${milestonesDone} of ${milestones.length} milestones. Judged at review, not by a number.`,
    };
  }

  const ordered = [...measurements].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  const startValue = goal.startValue ?? first?.value ?? 0;
  const targetValue = goal.targetValue;
  const descending = targetValue < startValue;
  const latest = last?.value ?? null;

  if (latest === null) {
    return {
      kind: 'measured',
      ratio: null,
      latest: null,
      startValue,
      targetValue,
      unit: goal.measureUnit,
      descending,
      summary: `No readings yet. Target ${targetValue} ${goal.measureUnit}.`,
    };
  }

  const span = Math.abs(targetValue - startValue);
  const moved = descending ? startValue - latest : latest - startValue;
  // A goal whose start already equals its target is either finished or was
  // entered wrong; either way, dividing by zero is not the answer.
  const ratio = span === 0 ? 1 : Math.min(1, Math.max(0, moved / span));

  return {
    kind: 'measured',
    ratio,
    latest,
    startValue,
    targetValue,
    unit: goal.measureUnit,
    descending,
    summary: `${latest} ${goal.measureUnit} of ${targetValue}. ${Math.round(ratio * 100)}% of the way from ${startValue}.`,
  };
}

/**
 * Is this goal measured by a number, or judged by its owner?
 *
 * Exposed because the UI must not render a progress bar for a judged goal. A
 * bar implies a number exists, and inventing one is the failure this module is
 * built to avoid.
 */
export function isMeasured(goal: Goal): boolean {
  return goal.targetValue !== null && goal.measureUnit !== null;
}

/**
 * The week a review belongs to, as the local date of its first day.
 *
 * Stored rather than derived at read time, because "which week was this" must
 * not change when the user travels.
 */
export function reviewWeekOf(localDate: IsoDate, weekStartsOn: number): IsoDate {
  return startOfWeek(localDate, weekStartsOn);
}

/** Whether this goal's weekly review is due, and has not been done. */
export function reviewIsDue(
  goal: Goal,
  options: {
    readonly today: IsoDate;
    readonly weekStartsOn: number;
    readonly lastReviewedWeek: IsoDate | null;
  },
): boolean {
  if (goal.status !== 'active' || goal.archivedAt !== null) return false;

  const thisWeek = reviewWeekOf(options.today, options.weekStartsOn);
  if (options.lastReviewedWeek === thisWeek) return false;

  // Without a chosen day, the review is due from the week's start.
  if (goal.reviewDay === null) return true;

  const todayWeekday = new Date(`${options.today}T00:00:00Z`).getUTCDay();
  const dayIndex = (todayWeekday - options.weekStartsOn + 7) % 7;
  const reviewIndex = (goal.reviewDay - options.weekStartsOn + 7) % 7;
  return dayIndex >= reviewIndex;
}

/**
 * Days remaining, counting the maintenance date when there is one.
 *
 * A goal with a maintenance date does not end when it is reached; it ends when
 * it has held. Returning the later of the two keeps a reached goal on the
 * screen for as long as it still has to be true.
 */
export function daysRemaining(goal: Goal, today: IsoDate): number | null {
  const deadline = goal.maintenanceDate ?? goal.targetDate;
  if (deadline === null) return null;
  return daysBetween(today, deadline);
}

export function describeGoalTiming(goal: Goal, today: IsoDate): string {
  const remaining = daysRemaining(goal, today);
  if (remaining === null) return 'No date set.';

  const maintaining = goal.maintenanceDate !== null && goal.targetDate !== null;
  const noun = maintaining ? 'to hold it' : 'left';

  if (remaining < 0) return `${Math.abs(remaining)} days past the date.`;
  if (remaining === 0) return maintaining ? 'Last day to hold it.' : 'Today is the date.';
  return `${remaining} days ${noun}.`;
}
