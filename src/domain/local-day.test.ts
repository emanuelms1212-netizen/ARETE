import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  instantBelongsToDay,
  localDayRange,
  startOfWeek,
  toLocalDate,
  weekdayOf,
  zonedTimeToInstant,
} from './local-day';

describe('toLocalDate', () => {
  it('puts an instant on the right day on each side of the date line', () => {
    const instant = new Date('2026-03-16T12:00:00Z');

    expect(toLocalDate(instant, 'UTC')).toBe('2026-03-16');
    expect(toLocalDate(instant, 'Pacific/Kiritimati')).toBe('2026-03-17'); // UTC+14
    expect(toLocalDate(instant, 'Pacific/Niue')).toBe('2026-03-16'); // UTC-11
  });

  it('keeps late-evening work on the day the user had it', () => {
    // 23:30 in New York is already tomorrow in UTC. It is not tomorrow for them.
    const instant = new Date('2026-03-17T03:30:00Z');

    expect(toLocalDate(instant, 'UTC')).toBe('2026-03-17');
    expect(toLocalDate(instant, 'America/New_York')).toBe('2026-03-16');
  });
});

describe('localDayRange', () => {
  it('spans exactly 24 hours on an ordinary day', () => {
    const { start, end } = localDayRange('2026-03-16', 'Europe/London');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('spans 23 hours on the day the clocks go forward', () => {
    // Europe/London springs forward on 29 March 2026.
    const { start, end } = localDayRange('2026-03-29', 'Europe/London');
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('spans 25 hours on the day the clocks go back', () => {
    // Europe/London falls back on 25 October 2026.
    const { start, end } = localDayRange('2026-10-25', 'Europe/London');
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('starts at the right instant for a zone behind UTC', () => {
    const { start } = localDayRange('2026-03-16', 'America/New_York');
    expect(start.toISOString()).toBe('2026-03-16T04:00:00.000Z'); // EDT, UTC-4
  });

  it('contains every instant of its own day and none of the next', () => {
    const date = '2026-10-25';
    const zone = 'Europe/London';
    const { start, end } = localDayRange(date, zone);

    expect(instantBelongsToDay(start, date, zone)).toBe(true);
    expect(instantBelongsToDay(new Date(end.getTime() - 1), date, zone)).toBe(true);
    expect(instantBelongsToDay(end, date, zone)).toBe(false);
  });
});

describe('zonedTimeToInstant', () => {
  it('resolves a wall-clock time that exists', () => {
    expect(zonedTimeToInstant('2026-07-01', '07:00:00', 'Europe/London').toISOString()).toBe(
      '2026-07-01T06:00:00.000Z',
    );
  });

  it('resolves a wall-clock time inside the spring-forward gap forward, not backward', () => {
    // 01:30 does not exist in London on 29 March 2026.
    const resolved = zonedTimeToInstant('2026-03-29', '01:30:00', 'Europe/London');
    expect(resolved.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(toLocalDate(resolved, 'Europe/London')).toBe('2026-03-29');
  });

  it('rejects nonsense rather than guessing', () => {
    expect(() => zonedTimeToInstant('not-a-date', '07:00:00', 'UTC')).toThrow(RangeError);
  });
});

describe('calendar arithmetic', () => {
  it('crosses a month and a leap day', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts days in both directions', () => {
    expect(daysBetween('2026-03-16', '2026-03-19')).toBe(3);
    expect(daysBetween('2026-03-19', '2026-03-16')).toBe(-3);
    expect(daysBetween('2026-03-16', '2026-03-16')).toBe(0);
  });

  it('is unaffected by daylight saving, because it never involves a zone', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('knows the weekday', () => {
    expect(weekdayOf('2026-03-16')).toBe(1); // a Monday
    expect(weekdayOf('2026-03-15')).toBe(0); // a Sunday
  });

  it('honours the week-start preference', () => {
    expect(startOfWeek('2026-03-19', 1)).toBe('2026-03-16'); // Monday start
    expect(startOfWeek('2026-03-19', 0)).toBe('2026-03-15'); // Sunday start
    expect(startOfWeek('2026-03-16', 1)).toBe('2026-03-16');
  });
});

describe('formatLocalDate', () => {
  it('writes dates the same way everywhere, with no locale data involved', async () => {
    const { formatLocalDate } = await import('./local-day');
    expect(formatLocalDate('2026-03-18', 'short')).toBe('Wed 18 Mar');
    expect(formatLocalDate('2026-03-18', 'long')).toBe('Wednesday 18 March');
    expect(formatLocalDate('2026-03-18', 'day')).toBe('Wed 18');
    expect(formatLocalDate('not-a-date', 'long')).toBe('not-a-date');
  });
});
