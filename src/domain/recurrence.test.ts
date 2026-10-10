import { describe, expect, it } from 'vitest';
import { describeRecurrence, expand, occursOn, parseRecurrence } from './recurrence';

const MONDAY = '2026-03-16';

describe('daily rules', () => {
  const everyDay = parseRecurrence({ freq: 'daily', interval: 1 });
  const everyOther = parseRecurrence({ freq: 'daily', interval: 2 });

  it('fires every day', () => {
    expect(expand(everyDay, MONDAY, MONDAY, '2026-03-20')).toEqual([
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
    ]);
  });

  it('anchors "every other day" to the start, not to the calendar', () => {
    expect(expand(everyOther, MONDAY, MONDAY, '2026-03-21')).toEqual([
      '2026-03-16',
      '2026-03-18',
      '2026-03-20',
    ]);
    expect(expand(everyOther, '2026-03-17', MONDAY, '2026-03-21')).toEqual([
      '2026-03-17',
      '2026-03-19',
      '2026-03-21',
    ]);
  });

  it('never fires before it starts', () => {
    expect(occursOn(everyDay, MONDAY, '2026-03-15')).toBe(false);
  });

  it('stops at `until`', () => {
    const bounded = parseRecurrence({ freq: 'daily', interval: 1, until: '2026-03-18' });
    expect(expand(bounded, MONDAY, MONDAY, '2026-03-20')).toEqual([
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
    ]);
  });
});

describe('weekly rules', () => {
  it('fires on the chosen weekdays', () => {
    const monThu = parseRecurrence({ freq: 'weekly', interval: 1, weekdays: [1, 4] });
    expect(expand(monThu, MONDAY, MONDAY, '2026-03-29')).toEqual([
      '2026-03-16',
      '2026-03-19',
      '2026-03-23',
      '2026-03-26',
    ]);
  });

  it('handles weekdays-only, the most common real schedule', () => {
    const weekdays = parseRecurrence({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] });
    expect(expand(weekdays, MONDAY, MONDAY, '2026-03-22')).toEqual([
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
    ]);
  });

  it('skips the off weeks of a fortnightly rule', () => {
    const fortnightly = parseRecurrence({ freq: 'weekly', interval: 2, weekdays: [1] });
    expect(expand(fortnightly, MONDAY, MONDAY, '2026-04-13')).toEqual([
      '2026-03-16',
      '2026-03-30',
      '2026-04-13',
    ]);
  });

  it("measures weeks from the user's week start", () => {
    const fortnightly = parseRecurrence({ freq: 'weekly', interval: 2, weekdays: [0] });
    // Starting on a Sunday, with weeks beginning on Monday, the Sunday that
    // starts the rule sits at the END of its week.
    expect(occursOn(fortnightly, '2026-03-15', '2026-03-15', 1)).toBe(true);
    expect(occursOn(fortnightly, '2026-03-15', '2026-03-29', 1)).toBe(true);
    expect(occursOn(fortnightly, '2026-03-15', '2026-03-22', 1)).toBe(false);
  });

  it('refuses a rule with no days, which would never fire', () => {
    expect(() => parseRecurrence({ freq: 'weekly', interval: 1, weekdays: [] })).toThrow();
  });
});

describe('monthly rules', () => {
  it('fires on the same day each month', () => {
    const first = parseRecurrence({ freq: 'monthly', interval: 1, monthDay: 1 });
    expect(expand(first, '2026-01-01', '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
  });

  it('skips months that do not have the day, rather than inventing one', () => {
    const thirtyFirst = parseRecurrence({ freq: 'monthly', interval: 1, monthDay: 31 });
    expect(expand(thirtyFirst, '2026-01-31', '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
  });

  it('honours an interval', () => {
    const quarterly = parseRecurrence({ freq: 'monthly', interval: 3, monthDay: 15 });
    expect(expand(quarterly, '2026-01-15', '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
  });
});

describe('guards', () => {
  it('rejects an unknown frequency instead of silently doing nothing', () => {
    expect(() => parseRecurrence({ freq: 'yearly', interval: 1 })).toThrow();
  });

  it('refuses to expand an unbounded range', () => {
    const everyDay = parseRecurrence({ freq: 'daily', interval: 1 });
    expect(() => expand(everyDay, '2020-01-01', '2020-01-01', '2030-01-01')).toThrow(RangeError);
  });

  it('returns nothing for a backwards range', () => {
    const everyDay = parseRecurrence({ freq: 'daily', interval: 1 });
    expect(expand(everyDay, MONDAY, '2026-03-20', '2026-03-16')).toEqual([]);
  });
});

describe('describeRecurrence', () => {
  it("says what the rule does, in the product's own plain English", () => {
    expect(describeRecurrence(parseRecurrence({ freq: 'daily', interval: 1 }))).toBe('Every day');
    expect(describeRecurrence(parseRecurrence({ freq: 'daily', interval: 3 }))).toBe(
      'Every 3 days',
    );
    expect(
      describeRecurrence(parseRecurrence({ freq: 'weekly', interval: 1, weekdays: [1] })),
    ).toBe('Every Monday');
    expect(
      describeRecurrence(parseRecurrence({ freq: 'weekly', interval: 1, weekdays: [4, 1] })),
    ).toBe('Every Monday and Thursday');
    expect(describeRecurrence(parseRecurrence({ freq: 'monthly', interval: 1, monthDay: 1 }))).toBe(
      'The 1st of each month',
    );
    expect(
      describeRecurrence(parseRecurrence({ freq: 'monthly', interval: 1, monthDay: 22 })),
    ).toBe('The 22nd of each month');
  });
});
