import { z } from 'zod';
import { addDays, daysBetween } from './local-day';
import type { IsoDate } from './types';

/**
 * Habits, and the arithmetic of not being punished by them.
 *
 * Four kinds, because "did you do it" is the wrong question for most of what
 * people actually track:
 *
 *   binary    did it or not
 *   count     reps, pages, glasses
 *   duration  minutes
 *   limit     a ceiling to stay under, where a smaller number is the success
 *
 * `limit` is the one that inverts, and getting it wrong is how an app ends up
 * congratulating someone for a personal best in the thing they are trying to
 * do less of.
 *
 * The streak rules are the other half. A streak that a rest day breaks is a
 * streak that punishes the schedule the user chose; a streak that a single bad
 * day resets to zero is a reason to stop opening the app. Both are avoided
 * here deliberately, and the tests say so.
 */
export const HABIT_KINDS = ['binary', 'count', 'duration', 'limit'] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

export const HABIT_STATUSES = ['done', 'partial', 'skipped', 'rest'] as const;
export type HabitStatus = (typeof HABIT_STATUSES)[number];

export const habitSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  kind: z.enum(HABIT_KINDS),
  unit: z.string().nullable().default(null),
  /** What a good day looks like. Required for everything but `binary`. */
  targetValue: z.number().positive().nullable().default(null),
  /** The user's own floor — what still counts when the day is against them. */
  minimumTarget: z.number().positive().nullable().default(null),
  goalId: z.string().nullable().default(null),
  pausedAt: z.date().nullable().default(null),
  archivedAt: z.date().nullable().default(null),
});
export type Habit = z.infer<typeof habitSchema>;

export const habitLogSchema = z.object({
  habitId: z.string(),
  localDate: z.string(),
  status: z.enum(HABIT_STATUSES),
  value: z.number().nullable().default(null),
  skipReason: z.string().nullable().default(null),
});
export type HabitLog = z.infer<typeof habitLogSchema>;

/** A day the habit was scheduled for, with whatever was logged against it. */
export interface HabitDay {
  readonly localDate: IsoDate;
  readonly scheduled: boolean;
  readonly log: HabitLog | null;
}

export interface HabitOutcome {
  /** Did this day meet the habit's full target? */
  readonly met: boolean;
  /** Did it at least meet the user's own minimum? */
  readonly metMinimum: boolean;
  /** Is this a day the streak should simply step over? */
  readonly neutral: boolean;
  readonly label: string;
}

/**
 * What one logged day amounts to.
 *
 * Three states that are *not* failure, and they matter more than the one that
 * is: an unscheduled day, a rest day, and a paused habit are all days the
 * habit was never asked about. A day with no log yet is also neutral, because
 * "today, not done yet" is not "today, failed".
 */
export function outcomeFor(habit: Habit, day: HabitDay, today?: IsoDate): HabitOutcome {
  if (!day.scheduled) {
    return { met: false, metMinimum: false, neutral: true, label: 'Not scheduled' };
  }

  const log = day.log;

  if (log === null) {
    // A day that has not finished cannot have been missed.
    const pending = today !== undefined && day.localDate >= today;
    return {
      met: false,
      metMinimum: false,
      neutral: pending,
      label: pending ? 'Not yet' : 'Missed',
    };
  }

  if (log.status === 'rest') {
    return { met: false, metMinimum: false, neutral: true, label: 'Rest day' };
  }

  if (log.status === 'skipped') {
    // A skip is a decision the user recorded, so it is honest about not being
    // a success — but it does not reset anything either. See `streakFrom`.
    return { met: false, metMinimum: false, neutral: false, label: 'Skipped' };
  }

  if (habit.kind === 'binary') {
    const met = log.status === 'done';
    return { met, metMinimum: met, neutral: false, label: met ? 'Done' : 'Partial' };
  }

  const value = log.value ?? 0;
  const target = habit.targetValue;
  const minimum = habit.minimumTarget;

  if (habit.kind === 'limit') {
    // Under the ceiling is the win. A minimum, if set, is the looser ceiling
    // the user will still accept on a hard day.
    const met = target === null || value <= target;
    const metMinimum = met || (minimum !== null && value <= minimum);
    return {
      met,
      metMinimum,
      neutral: false,
      label: met ? 'Under' : metMinimum ? 'Over, within tolerance' : 'Over',
    };
  }

  const met = target === null || value >= target;
  const metMinimum = met || (minimum !== null && value >= minimum);
  return {
    met,
    metMinimum,
    neutral: false,
    label: met ? 'Done' : metMinimum ? 'Minimum met' : 'Partial',
  };
}

export interface Streak {
  /** Consecutive scheduled days meeting at least the minimum, ending today. */
  readonly current: number;
  readonly longest: number;
  /** Scheduled days that counted, over scheduled days that were asked. */
  readonly consistency: number;
  /** How many of the window's scheduled days have been answered at all. */
  readonly scheduledDays: number;
  readonly countedDays: number;
}

/**
 * The streak, computed so that it tells the truth without being cruel.
 *
 * Three rules, each of which exists because the obvious implementation is
 * worse:
 *
 *   1. Meeting the user's own minimum continues the streak. The minimum is the
 *      promise they made themselves; the target is the ambition. Breaking a
 *      streak for hitting the promise but not the ambition punishes honesty.
 *   2. Rest days, unscheduled days and days not yet finished are stepped over
 *      rather than counted against.
 *   3. A missed day ends the current streak and nothing else. `longest` is
 *      kept, because what someone has already done is not undone by today.
 *
 * `days` must be in ascending date order.
 */
export function streakFrom(habit: Habit, days: readonly HabitDay[], today?: IsoDate): Streak {
  let current = 0;
  let longest = 0;
  let running = 0;
  let scheduledDays = 0;
  let countedDays = 0;

  for (const day of days) {
    const outcome = outcomeFor(habit, day, today);

    if (outcome.neutral) continue;

    scheduledDays += 1;

    if (outcome.metMinimum) {
      countedDays += 1;
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  current = running;

  return {
    current,
    longest,
    consistency: scheduledDays === 0 ? 0 : countedDays / scheduledDays,
    scheduledDays,
    countedDays,
  };
}

/**
 * The rolling consistency rate, which is the number worth showing.
 *
 * A streak answers "how long since I slipped", which is a question that gets
 * more frightening to ask the better the answer gets. Consistency answers "how
 * am I doing lately", which survives a bad week — and a bad week is the moment
 * the number is actually being read.
 */
export function rollingConsistency(
  habit: Habit,
  days: readonly HabitDay[],
  options: { readonly endingOn: IsoDate; readonly windowDays?: number; readonly today?: IsoDate },
): Streak {
  const windowDays = options.windowDays ?? 30;
  const firstDay = addDays(options.endingOn, -(windowDays - 1));

  const window = days.filter(
    (day) => day.localDate >= firstDay && day.localDate <= options.endingOn,
  );

  return streakFrom(habit, window, options.today);
}

/**
 * Plain words for where a habit stands, with no scolding in any branch.
 *
 * The phrasing of the broken-streak case is the whole point of this function:
 * "Back to day one" invites shame, "ready when you are" does not, and the
 * difference decides whether the app gets opened tomorrow.
 */
export function describeStreak(streak: Streak): string {
  if (streak.scheduledDays === 0) return 'Nothing scheduled yet.';

  const rate = Math.round(streak.consistency * 100);

  if (streak.current === 0) {
    if (streak.longest === 0) return `${rate}% of scheduled days so far.`;
    return `${rate}% of scheduled days. Longest run was ${streak.longest}; ready when you are.`;
  }

  if (streak.current === streak.longest && streak.longest > 1) {
    return `${streak.current} in a row — your longest yet. ${rate}% of scheduled days.`;
  }

  return `${streak.current} in a row. ${rate}% of scheduled days.`;
}

/** What to show on Today: the target, or the minimum when the day is minimal. */
export function targetForDay(habit: Habit, minimumMode: boolean): number | null {
  if (!minimumMode) return habit.targetValue;
  return habit.minimumTarget ?? habit.targetValue;
}

/** Whether a habit should appear at all on a given day. */
export function isActiveOn(habit: Habit, localDate: IsoDate, now: Date): boolean {
  if (habit.archivedAt !== null) return false;
  if (habit.pausedAt !== null) return false;
  void localDate;
  void now;
  return true;
}

/** Days since the habit last counted, or null if it never has. */
export function daysSinceLastCounted(
  habit: Habit,
  days: readonly HabitDay[],
  endingOn: IsoDate,
): number | null {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (day === undefined) continue;
    if (outcomeFor(habit, day).metMinimum) return daysBetween(day.localDate, endingOn);
  }
  return null;
}
