import { describe, expect, it } from 'vitest';
import { addDays } from './local-day';
import {
  EMPTY_DAY,
  MIN_DAYS_TOTAL,
  buckets,
  consistency,
  fillDays,
  narrative,
  nutritionSummary,
  observations,
  observationsPending,
  thousands,
  type DayRecord,
} from './progress';

const START = '2026-03-02'; // a Monday
const day = (offset: number, patch: Partial<DayRecord> = {}): DayRecord => ({
  ...EMPTY_DAY(addDays(START, offset)),
  ...patch,
});

describe('days and buckets', () => {
  it('fills the range with empty days, keeping the real ones', () => {
    const days = fillDays([day(2, { focusMinutes: 25 })], START, addDays(START, 6));
    expect(days).toHaveLength(7);
    expect(days[2]?.focusMinutes).toBe(25);
    expect(days[0]?.focusMinutes).toBe(0);
  });

  it('uses days for a week and Monday-start weeks for longer ranges', () => {
    expect(buckets(fillDays([], START, addDays(START, 6)))).toHaveLength(7);
    const weeks = buckets(fillDays([], addDays(START, 3), addDays(START, 30)));
    expect(weeks[0]?.from).toBe(addDays(START, 3));
    expect(weeks[1]?.from).toBe(addDays(START, 7));
    expect(weeks.every((bucket) => bucket.span.includes(' to '))).toBe(true);
    expect(weeks.reduce((sum, bucket) => sum + bucket.days.length, 0)).toBe(28);
  });
});

describe('consistency', () => {
  it('keeps a run going across unplanned days and shows the rate beside it', () => {
    const days = [
      day(0, { commitmentsTotal: 3, commitmentsDone: 2 }),
      day(1),
      day(2, { commitmentsTotal: 2, commitmentsDone: 1 }),
      day(3, { commitmentsTotal: 2, commitmentsDone: 0 }),
      day(4, { commitmentsTotal: 2, commitmentsDone: 2, minimumDay: true }),
    ];
    expect(consistency(days)).toEqual({
      plannedDays: 4,
      done: 5,
      total: 9,
      rate: 5 / 9,
      minimumDays: 1,
      currentRun: 1,
      longestRun: 2,
    });
    expect(consistency([day(0)]).rate).toBeNull();
  });
});

describe('nutrition', () => {
  it('averages over logged days only', () => {
    const summary = nutritionSummary([
      day(0, { foodEntries: 2, proteinG: 80, waterMl: 1000 }),
      day(1),
      day(2, { foodEntries: 1, proteinG: null }),
    ]);
    expect(summary).toEqual({
      loggedDays: 2,
      averageProteinG: 80,
      averageFiberG: null,
      averageWaterMl: 1000,
    });
  });
});

describe('observations', () => {
  const month = (patch: (offset: number) => Partial<DayRecord>) =>
    Array.from({ length: 28 }, (_, offset) => day(offset, patch(offset)));

  it('say nothing with too few days, and say why', () => {
    const short = month(() => ({})).slice(0, MIN_DAYS_TOTAL - 1);
    expect(observations(short)).toEqual([]);
    expect(observationsPending(short)).toMatch(/at least 21 days/);
  });

  it('say nothing without enough days on each side', () => {
    const days = month((offset) => ({
      workouts: offset < 4 ? 1 : 0,
      focusMinutes: offset < 4 ? 90 : 10,
    }));
    expect(observations(days)).toEqual([]);
  });

  it('describe a clear difference as an observation, never a cause', () => {
    const days = month((offset) => ({
      workouts: offset % 2 === 0 ? 1 : 0,
      focusMinutes: offset % 2 === 0 ? 50 : 20,
    }));
    const found = observations(days);
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toMatch(/^On days with a workout, you had about 50 minutes of focus/);
    expect(found[0]?.text).toMatch(/does not show that one causes the other/);
    expect(found[0]?.text).not.toMatch(/\b(because|leads to|improves|boosts|causes you)\b/);
  });

  it('ignore a small difference', () => {
    const days = month((offset) => ({ workouts: offset % 2, focusMinutes: offset % 2 ? 25 : 20 }));
    expect(observations(days)).toEqual([]);
  });
});

describe('the narrative', () => {
  it('is separate sentences per domain, with no combined score', () => {
    const lines = narrative(
      [
        day(0, {
          commitmentsTotal: 2,
          commitmentsDone: 2,
          focusMinutes: 50,
          workouts: 1,
          volumeKg: 2400,
        }),
        day(1, { meditationMinutes: 10, cognitiveSessions: 1, foodEntries: 2, proteinG: 90 }),
      ],
      [],
      { showNutritionNumbers: false },
    );
    expect(lines).toEqual([
      '2 things done across 1 planned day.',
      '50 minutes of focused work.',
      '1 workout, 2,400 kg lifted in all.',
      '10 minutes of meditation and breathing.',
      '1 practice drill — practice, not a measure of ability.',
      'Food logged on 1 day.',
    ]);
    expect(lines.join(' ')).not.toMatch(/score|%/);
  });

  it('compares with the period before only when both have enough', () => {
    const planned = (done: number) =>
      Array.from({ length: 6 }, (_, offset) =>
        day(offset, { commitmentsTotal: 4, commitmentsDone: done }),
      );
    expect(narrative(planned(4), planned(2), { showNutritionNumbers: true }).join(' ')).toMatch(
      /a higher share of planned things done than the period before \(100% against 50%\)/,
    );
    expect(
      narrative(planned(4), planned(2).slice(0, 2), { showNutritionNumbers: true }).join(' '),
    ).not.toMatch(/period before/);
  });

  it('is honest about an empty period', () => {
    expect(narrative([day(0)], [], { showNutritionNumbers: true })).toEqual([
      'Nothing recorded in this period yet. That is information, not a judgement.',
    ]);
  });

  it('writes large numbers the same everywhere', () => {
    expect(thousands(1234567)).toBe('1,234,567');
    expect(thousands(999)).toBe('999');
  });
});
