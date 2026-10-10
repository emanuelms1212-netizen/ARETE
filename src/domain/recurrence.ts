import { z } from 'zod';
import { addDays, daysBetween, monthOf, startOfWeek, weekdayOf } from './local-day';
import type { IsoDate } from './types';

/**
 * Recurrence for tasks and habit schedules.
 *
 * Deliberately a small, closed set rather than RRULE. Everything the product
 * needs — "every day", "every other day", "weekdays", "Mondays and Thursdays",
 * "the 1st of the month" — fits here, and a small grammar is one that can be
 * exhaustively tested and rendered back to the user in plain English.
 *
 * Rules are stored as jsonb in Postgres and validated here, so the grammar and
 * its tests live in one language rather than being half in a check constraint.
 */
export const recurrenceSchema = z.discriminatedUnion('freq', [
  z.object({
    freq: z.literal('daily'),
    interval: z.int().min(1).max(365).default(1),
    until: z.iso.date().optional(),
  }),
  z.object({
    freq: z.literal('weekly'),
    interval: z.int().min(1).max(52).default(1),
    /** 0 = Sunday. At least one day, or the rule never fires. */
    weekdays: z.array(z.int().min(0).max(6)).min(1),
    until: z.iso.date().optional(),
  }),
  z.object({
    freq: z.literal('monthly'),
    interval: z.int().min(1).max(12).default(1),
    monthDay: z.int().min(1).max(31),
    until: z.iso.date().optional(),
  }),
]);

export type Recurrence = z.infer<typeof recurrenceSchema>;

export function parseRecurrence(value: unknown): Recurrence {
  return recurrenceSchema.parse(value);
}

/**
 * Does this rule fire on `date`?
 *
 * `startDate` anchors the interval: "every other day" from a Monday means
 * Monday, Wednesday, Friday — not every even-numbered day of the year.
 *
 * Monthly rules simply do not fire in months that lack the day. A rule for the
 * 31st skips February rather than silently landing on the 28th: moving it would
 * be the app inventing a commitment the user did not make.
 */
export function occursOn(
  rule: Recurrence,
  startDate: IsoDate,
  date: IsoDate,
  weekStartsOn = 1,
): boolean {
  if (daysBetween(startDate, date) < 0) return false;
  if (rule.until && daysBetween(rule.until, date) > 0) return false;

  switch (rule.freq) {
    case 'daily':
      return daysBetween(startDate, date) % rule.interval === 0;

    case 'weekly': {
      if (!rule.weekdays.includes(weekdayOf(date))) return false;
      const weeks =
        daysBetween(startOfWeek(startDate, weekStartsOn), startOfWeek(date, weekStartsOn)) / 7;
      return Number.isInteger(weeks) && weeks % rule.interval === 0;
    }

    case 'monthly': {
      const start = monthOf(startDate);
      const target = monthOf(date);
      if (target.day !== rule.monthDay) return false;
      const months = (target.year - start.year) * 12 + (target.month - start.month);
      return months >= 0 && months % rule.interval === 0;
    }
  }
}

/** Every date the rule fires on, within an inclusive range. */
export function expand(
  rule: Recurrence,
  startDate: IsoDate,
  from: IsoDate,
  to: IsoDate,
  weekStartsOn = 1,
): IsoDate[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  if (span > 1826) {
    throw new RangeError('Refusing to expand a recurrence over more than five years at once');
  }

  const dates: IsoDate[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(from, offset);
    if (occursOn(rule, startDate, date, weekStartsOn)) dates.push(date);
  }
  return dates;
}

/** The rule, in the same plain English the product uses elsewhere. */
export function describeRecurrence(rule: Recurrence): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  switch (rule.freq) {
    case 'daily':
      return rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`;

    case 'weekly': {
      const days = [...rule.weekdays]
        .sort((a, b) => a - b)
        .map((day) => dayNames[day] ?? '')
        .filter(Boolean);
      const list =
        days.length === 1
          ? days[0]
          : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
      return rule.interval === 1 ? `Every ${list}` : `Every ${rule.interval} weeks on ${list}`;
    }

    case 'monthly': {
      const suffix =
        rule.monthDay % 10 === 1 && rule.monthDay !== 11
          ? 'st'
          : rule.monthDay % 10 === 2 && rule.monthDay !== 12
            ? 'nd'
            : rule.monthDay % 10 === 3 && rule.monthDay !== 13
              ? 'rd'
              : 'th';
      const day = `${rule.monthDay}${suffix}`;
      return rule.interval === 1
        ? `The ${day} of each month`
        : `The ${day}, every ${rule.interval} months`;
    }
  }
}
