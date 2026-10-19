import { addDays, daysBetween, formatLocalDate } from './local-day';
import type { IsoDate } from './types';

/**
 * Progress: patterns across modules, without a score.
 *
 * Every domain keeps its own numbers in its own units. Nothing here adds
 * focus minutes to protein grams to produce a "human score"; the summary is a
 * handful of plain sentences, each about one thing. Consistency is a rolling
 * rate beside any streak, so one missed day never hides the month around it.
 * Correlations are reported only with enough days on both sides, labelled as
 * observations, and phrased so that nothing is said to cause anything.
 */

export const PROGRESS_RANGES = [7, 28, 90] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];

/** One local day's facts, gathered from every module. Missing data is null, not zero. */
export interface DayRecord {
  readonly localDate: IsoDate;
  readonly commitmentsTotal: number;
  readonly commitmentsDone: number;
  readonly minimumDay: boolean;
  readonly focusMinutes: number;
  readonly workouts: number;
  readonly volumeKg: number;
  readonly cardioMinutes: number;
  readonly mobilitySessions: number;
  readonly meditationMinutes: number;
  readonly breathworkMinutes: number;
  readonly cognitiveSessions: number;
  readonly foodEntries: number;
  /** Null when nothing with that number was logged, or numbers are hidden. */
  readonly proteinG: number | null;
  readonly fiberG: number | null;
  readonly waterMl: number;
  readonly journal: boolean;
}

export const EMPTY_DAY = (localDate: IsoDate): DayRecord => ({
  localDate,
  commitmentsTotal: 0,
  commitmentsDone: 0,
  minimumDay: false,
  focusMinutes: 0,
  workouts: 0,
  volumeKg: 0,
  cardioMinutes: 0,
  mobilitySessions: 0,
  meditationMinutes: 0,
  breathworkMinutes: 0,
  cognitiveSessions: 0,
  foodEntries: 0,
  proteinG: null,
  fiberG: null,
  waterMl: 0,
  journal: false,
});

/** Every day from `from` to `to`, with the records that exist and empty days for the rest. */
export function fillDays(records: readonly DayRecord[], from: IsoDate, to: IsoDate): DayRecord[] {
  const byDate = new Map(records.map((record) => [record.localDate, record]));
  const length = daysBetween(from, to) + 1;
  return Array.from({ length }, (_, index) => {
    const date = addDays(from, index);
    return byDate.get(date) ?? EMPTY_DAY(date);
  });
}

// ---------------------------------------------------------------------------
// Buckets for charts
// ---------------------------------------------------------------------------

export interface Bucket {
  readonly label: string;
  /** For screen readers and the table: the full span in words. */
  readonly span: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly days: readonly DayRecord[];
}

/** Daily buckets for a week; weekly (Monday-start, clipped to the range) for longer ranges. */
export function buckets(days: readonly DayRecord[]): Bucket[] {
  if (days.length <= 7) {
    return days.map((day) => ({
      label: formatLocalDate(day.localDate, 'day'),
      span: formatLocalDate(day.localDate, 'long'),
      from: day.localDate,
      to: day.localDate,
      days: [day],
    }));
  }
  const result: Bucket[] = [];
  for (const day of days) {
    const weekday = new Date(`${day.localDate}T12:00:00Z`).getUTCDay();
    const last = result.at(-1);
    if (!last || weekday === 1) {
      result.push({ label: '', span: '', from: day.localDate, to: day.localDate, days: [day] });
    } else {
      result[result.length - 1] = { ...last, to: day.localDate, days: [...last.days, day] };
    }
  }
  return result.map((bucket) => ({
    ...bucket,
    label: formatLocalDate(bucket.from, 'short').split(' ').slice(1).join(' '),
    span: `${formatLocalDate(bucket.from, 'short')} to ${formatLocalDate(bucket.to, 'short')}`,
  }));
}

export function sumOf(days: readonly DayRecord[], key: NumericKey): number {
  return days.reduce((sum, day) => sum + (day[key] ?? 0), 0);
}

type NumericKey = {
  [K in keyof DayRecord]: DayRecord[K] extends number | null ? K : never;
}[keyof DayRecord];

// ---------------------------------------------------------------------------
// Domain summaries
// ---------------------------------------------------------------------------

export interface ConsistencySummary {
  readonly plannedDays: number;
  readonly done: number;
  readonly total: number;
  /** Done over asked, across planned days. Null with nothing planned. */
  readonly rate: number | null;
  readonly minimumDays: number;
  /** Consecutive planned days, ending at the last planned day, with at least one thing done. */
  readonly currentRun: number;
  readonly longestRun: number;
}

/**
 * Showing up, measured kindly: a day with anything done continues a run,
 * days with nothing planned are stepped over, and the rate is shown beside
 * the run so a single gap never erases the month.
 */
export function consistency(days: readonly DayRecord[]): ConsistencySummary {
  const planned = days.filter((day) => day.commitmentsTotal > 0);
  let run = 0;
  let longest = 0;
  for (const day of planned) {
    run = day.commitmentsDone > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const done = planned.reduce((sum, day) => sum + day.commitmentsDone, 0);
  const total = planned.reduce((sum, day) => sum + day.commitmentsTotal, 0);
  return {
    plannedDays: planned.length,
    done,
    total,
    rate: total === 0 ? null : done / total,
    minimumDays: days.filter((day) => day.minimumDay).length,
    currentRun: run,
    longestRun: longest,
  };
}

export interface NutritionSummary {
  readonly loggedDays: number;
  readonly averageProteinG: number | null;
  readonly averageFiberG: number | null;
  readonly averageWaterMl: number | null;
}

/** Averages over logged days only: a day not logged is not a day with nothing eaten. */
export function nutritionSummary(days: readonly DayRecord[]): NutritionSummary {
  const logged = days.filter((day) => day.foodEntries > 0);
  const average = (values: readonly (number | null)[]) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length === 0 ? null : Math.round(known.reduce((a, b) => a + b, 0) / known.length);
  };
  const watered = days.filter((day) => day.waterMl > 0);
  return {
    loggedDays: logged.length,
    averageProteinG: average(logged.map((day) => day.proteinG)),
    averageFiberG: average(logged.map((day) => day.fiberG)),
    averageWaterMl: average(watered.map((day) => day.waterMl)),
  };
}

// ---------------------------------------------------------------------------
// Observations (never causes)
// ---------------------------------------------------------------------------

/** Fewer than this many days on either side, and nothing is said. */
export const MIN_DAYS_PER_GROUP = 7;
/** Fewer than this many days in the range, and nothing is said. */
export const MIN_DAYS_TOTAL = 21;

export interface Observation {
  readonly id: string;
  readonly text: string;
  readonly withDays: number;
  readonly withoutDays: number;
}

interface Candidate {
  readonly id: string;
  readonly applies: (day: DayRecord) => boolean;
  readonly when: string;
  /** Only days where the outcome means something (planned days for completion). */
  readonly eligible: (day: DayRecord) => boolean;
  readonly outcome: (day: DayRecord) => number;
  readonly describe: (withValue: number, withoutValue: number) => string;
  /** Smallest absolute difference worth mentioning. */
  readonly minDifference: number;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** 12,345 — written out, so the server and every browser agree. */
export function thousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
const completion = (day: DayRecord) =>
  day.commitmentsTotal === 0 ? 0 : day.commitmentsDone / day.commitmentsTotal;

const CANDIDATES: readonly Candidate[] = [
  {
    id: 'workout-focus',
    applies: (day) => day.workouts > 0,
    when: 'a workout',
    eligible: () => true,
    outcome: (day) => day.focusMinutes,
    describe: (a, b) =>
      `about ${Math.round(a)} minutes of focus on average, against ${Math.round(b)} on days without`,
    minDifference: 10,
  },
  {
    id: 'mind-completion',
    applies: (day) => day.meditationMinutes + day.breathworkMinutes > 0,
    when: 'meditation or breathing',
    eligible: (day) => day.commitmentsTotal > 0,
    outcome: completion,
    describe: (a, b) =>
      `${percent(a)} of planned things done, against ${percent(b)} on days without`,
    minDifference: 0.15,
  },
  {
    id: 'journal-completion',
    applies: (day) => day.journal,
    when: 'a journal entry',
    eligible: (day) => day.commitmentsTotal > 0,
    outcome: completion,
    describe: (a, b) =>
      `${percent(a)} of planned things done, against ${percent(b)} on days without`,
    minDifference: 0.15,
  },
];

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Differences between days with and without something, when there are enough
 * days on both sides to say anything at all. Always worded as what was seen,
 * never as what one thing does to another.
 */
export function observations(days: readonly DayRecord[]): Observation[] {
  if (days.length < MIN_DAYS_TOTAL) return [];
  const found: Observation[] = [];
  for (const candidate of CANDIDATES) {
    const eligible = days.filter(candidate.eligible);
    const withIt = eligible.filter(candidate.applies);
    const without = eligible.filter((day) => !candidate.applies(day));
    if (withIt.length < MIN_DAYS_PER_GROUP || without.length < MIN_DAYS_PER_GROUP) continue;
    const a = mean(withIt.map(candidate.outcome));
    const b = mean(without.map(candidate.outcome));
    if (Math.abs(a - b) < candidate.minDifference) continue;
    found.push({
      id: candidate.id,
      text: `On days with ${candidate.when}, you had ${candidate.describe(a, b)} (${withIt.length} days with, ${without.length} without). An observation from your own records — it does not show that one causes the other.`,
      withDays: withIt.length,
      withoutDays: without.length,
    });
  }
  return found;
}

/** Why there is nothing to observe yet, in a sentence. */
export function observationsPending(days: readonly DayRecord[]): string {
  if (days.length < MIN_DAYS_TOTAL) {
    return `Patterns need at least ${MIN_DAYS_TOTAL} days to look at. Choose a longer range.`;
  }
  return `Nothing stands out yet. A pattern is only mentioned with at least ${MIN_DAYS_PER_GROUP} days on each side and a clear difference.`;
}

// ---------------------------------------------------------------------------
// The narrative
// ---------------------------------------------------------------------------

/**
 * The period in sentences: one per domain that has anything in it, counts
 * rather than verdicts, and a comparison with the previous period only where
 * both have enough to compare.
 */
export function narrative(
  days: readonly DayRecord[],
  previous: readonly DayRecord[],
  options: { readonly showNutritionNumbers: boolean },
): string[] {
  const lines: string[] = [];
  const plural = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;

  const now = consistency(days);
  if (now.plannedDays > 0) {
    lines.push(
      `${plural(now.done, 'thing')} done across ${plural(now.plannedDays, 'planned day')}.`,
    );
    if (now.minimumDays > 0) {
      lines.push(`${plural(now.minimumDays, 'day')} run at the minimum — each one counted.`);
    }
    const before = consistency(previous);
    if (
      before.rate !== null &&
      now.rate !== null &&
      before.plannedDays >= 5 &&
      now.plannedDays >= 5
    ) {
      const change = now.rate - before.rate;
      if (Math.abs(change) >= 0.1) {
        lines.push(
          `That is ${change > 0 ? 'a higher' : 'a lower'} share of planned things done than the period before (${percent(now.rate)} against ${percent(before.rate)}).`,
        );
      }
    }
  }

  const focus = sumOf(days, 'focusMinutes');
  if (focus > 0) lines.push(`${Math.round(focus)} minutes of focused work.`);

  const workouts = sumOf(days, 'workouts');
  if (workouts > 0) {
    const volume = sumOf(days, 'volumeKg');
    const cardio = sumOf(days, 'cardioMinutes');
    const parts = [plural(workouts, 'workout')];
    if (volume > 0) parts.push(`${thousands(Math.round(volume))} kg lifted in all`);
    if (cardio > 0) parts.push(`${Math.round(cardio)} minutes of cardio`);
    lines.push(`${parts.join(', ')}.`);
  }

  const mobility = sumOf(days, 'mobilitySessions');
  if (mobility > 0) lines.push(`${plural(mobility, 'flexibility session')}.`);

  const mind = sumOf(days, 'meditationMinutes') + sumOf(days, 'breathworkMinutes');
  if (mind > 0) lines.push(`${Math.round(mind)} minutes of meditation and breathing.`);

  const drills = sumOf(days, 'cognitiveSessions');
  if (drills > 0)
    lines.push(`${plural(drills, 'practice drill')} — practice, not a measure of ability.`);

  const food = nutritionSummary(days);
  if (food.loggedDays > 0) {
    lines.push(
      options.showNutritionNumbers && food.averageProteinG !== null
        ? `Food logged on ${plural(food.loggedDays, 'day')}, about ${food.averageProteinG} g of protein on those days.`
        : `Food logged on ${plural(food.loggedDays, 'day')}.`,
    );
  }

  if (lines.length === 0) {
    lines.push('Nothing recorded in this period yet. That is information, not a judgement.');
  }
  return lines;
}
