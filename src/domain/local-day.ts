import type { IsoDate } from './types';

/**
 * Local days.
 *
 * ARETE's unit of work is a day, and a day is the *user's* day: it starts at
 * their local midnight, in the zone they were in when they recorded it. That is
 * why every dated row in the schema stores `local_date` alongside the
 * `timezone` it was recorded in rather than a bare timestamp — a user who flies
 * to Tokyo must not have yesterday silently re-filed.
 *
 * Everything here is pure and takes the zone explicitly. Nothing reads the
 * system clock or the system zone, so the tests can be exhaustive and the
 * server cannot accidentally use its own timezone.
 */

/** Offset of `instant` in `timeZone`, in milliseconds east of UTC. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    // Some ICU builds render midnight as hour 24.
    read('hour') % 24,
    read('minute'),
    read('second'),
  );

  return asIfUtc - instant.getTime();
}

/** The calendar date `instant` falls on, in `timeZone`. */
export function toLocalDate(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * The instant at which a wall-clock time in `timeZone` occurs.
 *
 * Resolved twice because the offset itself depends on the instant: on a DST
 * boundary the first guess can land in the wrong offset. Times that do not
 * exist (the spring-forward gap) resolve forward, which is what a user means by
 * "07:00" on that morning.
 */
export function zonedTimeToInstant(
  localDate: IsoDate,
  wallClockTime: string,
  timeZone: string,
): Date {
  const naive = Date.parse(`${localDate}T${wallClockTime}Z`);
  if (Number.isNaN(naive)) {
    throw new RangeError(`Not a local date and time: ${localDate} ${wallClockTime}`);
  }

  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const refined = naive - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(refined);
}

/** The half-open instant range `[start, end)` of a local day. */
export function localDayRange(
  localDate: IsoDate,
  timeZone: string,
): { readonly start: Date; readonly end: Date } {
  return {
    start: zonedTimeToInstant(localDate, '00:00:00', timeZone),
    end: zonedTimeToInstant(addDays(localDate, 1), '00:00:00', timeZone),
  };
}

/** Calendar arithmetic on an ISO date, with no timezone involved at all. */
export function addDays(localDate: IsoDate, days: number): IsoDate {
  const parsed = Date.parse(`${localDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new RangeError(`Not an ISO date: ${localDate}`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError('Not an ISO date');
  return Math.round((b - a) / 86_400_000);
}

/** Day of the week, 0 = Sunday. */
export function weekdayOf(localDate: IsoDate): number {
  const parsed = Date.parse(`${localDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new RangeError(`Not an ISO date: ${localDate}`);
  return new Date(parsed).getUTCDay();
}

/** The first day of the week containing `localDate`, honouring the user's preference. */
export function startOfWeek(localDate: IsoDate, weekStartsOn = 1): IsoDate {
  const offset = (weekdayOf(localDate) - weekStartsOn + 7) % 7;
  return addDays(localDate, -offset);
}

export function monthOf(localDate: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) throw new RangeError(`Not an ISO date: ${localDate}`);
  return { year, month, day };
}

/**
 * True when `instant` falls on `localDate` in `timeZone`. The question the
 * app actually asks — "does this session belong to today?" — rather than a
 * timestamp comparison that would be wrong by up to a day.
 */
export function instantBelongsToDay(instant: Date, localDate: IsoDate, timeZone: string): boolean {
  return toLocalDate(instant, timeZone) === localDate;
}
