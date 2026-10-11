import { describe, expect, it } from 'vitest';
import {
  daysRemaining,
  describeGoalTiming,
  goalProgress,
  goalSchema,
  isMeasured,
  reviewIsDue,
  reviewWeekOf,
  type Goal,
  type Measurement,
  type Milestone,
} from './goals';

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Run 10k',
    why: null,
    successMeasure: null,
    measureUnit: null,
    startValue: null,
    targetValue: null,
    status: 'active',
    targetDate: null,
    maintenanceDate: null,
    reviewDay: null,
    archivedAt: null,
    ...overrides,
  };
}

function readings(...values: readonly (readonly [string, number])[]): Measurement[] {
  return values.map(([localDate, value]) => ({ localDate, value }));
}

function milestone(completed: boolean, id = 'm1'): Milestone {
  return { id, title: 'A milestone', dueDate: null, completedAt: completed ? new Date() : null };
}

describe('goalSchema', () => {
  it('rejects half a measure, because half a measure renders an unreadable bar', () => {
    const result = goalSchema.safeParse({ ...goal(), targetValue: 10, measureUnit: null });
    expect(result.success).toBe(false);
  });

  it('accepts a goal with no measure at all', () => {
    expect(goalSchema.safeParse(goal()).success).toBe(true);
  });

  it('accepts a complete measure', () => {
    expect(
      goalSchema.safeParse({ ...goal(), targetValue: 10, measureUnit: 'km', startValue: 3 })
        .success,
    ).toBe(true);
  });
});

describe('goalProgress', () => {
  it('never turns completed milestones into a percentage', () => {
    const progress = goalProgress(goal(), [], [milestone(true), milestone(false, 'm2')]);

    expect(progress.kind).toBe('judged');
    expect(progress.summary).toMatch(/judged at review/i);
    // The shape itself prevents a progress bar: there is no ratio to render.
    expect('ratio' in progress).toBe(false);
  });

  it('says so plainly when a goal has no number', () => {
    const progress = goalProgress(goal(), []);

    expect(progress.summary).toBe('Judged at review, not by a number.');
  });

  it('measures an ascending goal from start to target', () => {
    const running = goal({ measureUnit: 'km', startValue: 3, targetValue: 10 });
    const progress = goalProgress(running, readings(['2026-03-01', 3], ['2026-03-20', 6.5]));

    expect(progress.kind).toBe('measured');
    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.ratio).toBeCloseTo(0.5, 5);
    expect(progress.descending).toBe(false);
  });

  it('measures a descending goal as progress rather than as loss', () => {
    // The case that catches naive implementations: moving 90 → 85 toward a
    // target of 80 is halfway, not minus-something.
    const weight = goal({ measureUnit: 'kg', startValue: 90, targetValue: 80 });
    const progress = goalProgress(weight, readings(['2026-03-01', 90], ['2026-03-20', 85]));

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.descending).toBe(true);
    expect(progress.ratio).toBeCloseTo(0.5, 5);
  });

  it('uses the latest reading, not the best one', () => {
    const running = goal({ measureUnit: 'km', startValue: 0, targetValue: 10 });
    const progress = goalProgress(
      running,
      readings(['2026-03-01', 0], ['2026-03-10', 9], ['2026-03-20', 4]),
    );

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.latest).toBe(4);
    expect(progress.ratio).toBeCloseTo(0.4, 5);
  });

  it('clamps rather than reporting more than finished', () => {
    const running = goal({ measureUnit: 'km', startValue: 0, targetValue: 10 });
    const progress = goalProgress(running, readings(['2026-03-20', 14]));

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.ratio).toBe(1);
  });

  it('clamps rather than reporting negative progress', () => {
    const running = goal({ measureUnit: 'km', startValue: 5, targetValue: 10 });
    const progress = goalProgress(running, readings(['2026-03-20', 2]));

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.ratio).toBe(0);
  });

  it('does not divide by zero when start already equals target', () => {
    const held = goal({ measureUnit: 'kg', startValue: 80, targetValue: 80 });
    const progress = goalProgress(held, readings(['2026-03-20', 80]));

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.ratio).toBe(1);
  });

  it('has no ratio before the first reading', () => {
    const running = goal({ measureUnit: 'km', startValue: 0, targetValue: 10 });
    const progress = goalProgress(running, []);

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.ratio).toBeNull();
    expect(progress.summary).toMatch(/no readings yet/i);
  });

  it('falls back to the first reading when no start value was given', () => {
    const running = goal({ measureUnit: 'km', targetValue: 10 });
    const progress = goalProgress(running, readings(['2026-03-01', 2], ['2026-03-20', 6]));

    if (progress.kind !== 'measured') throw new Error('unreachable');
    expect(progress.startValue).toBe(2);
    expect(progress.ratio).toBeCloseTo(0.5, 5);
  });

  it('does not depend on the order readings arrive in', () => {
    const running = goal({ measureUnit: 'km', startValue: 0, targetValue: 10 });
    const forwards = goalProgress(running, readings(['2026-03-01', 1], ['2026-03-20', 7]));
    const backwards = goalProgress(running, readings(['2026-03-20', 7], ['2026-03-01', 1]));

    expect(forwards).toEqual(backwards);
  });
});

describe('isMeasured', () => {
  it('is false for a judged goal, so no progress bar is rendered', () => {
    expect(isMeasured(goal())).toBe(false);
  });

  it('is true once a unit and a target exist', () => {
    expect(isMeasured(goal({ measureUnit: 'km', targetValue: 10 }))).toBe(true);
  });
});

describe('reviewWeekOf', () => {
  it('names a week by its first day in the user’s own week start', () => {
    // 2026-03-18 is a Wednesday.
    expect(reviewWeekOf('2026-03-18', 1)).toBe('2026-03-16');
    expect(reviewWeekOf('2026-03-18', 0)).toBe('2026-03-15');
  });
});

describe('reviewIsDue', () => {
  it('is due when this week has not been reviewed', () => {
    expect(
      reviewIsDue(goal(), { today: '2026-03-18', weekStartsOn: 1, lastReviewedWeek: null }),
    ).toBe(true);
  });

  it('is not due once this week has been reviewed', () => {
    expect(
      reviewIsDue(goal(), {
        today: '2026-03-18',
        weekStartsOn: 1,
        lastReviewedWeek: '2026-03-16',
      }),
    ).toBe(false);
  });

  it('is due again in a new week', () => {
    expect(
      reviewIsDue(goal(), {
        today: '2026-03-24',
        weekStartsOn: 1,
        lastReviewedWeek: '2026-03-16',
      }),
    ).toBe(true);
  });

  it('waits for the chosen day', () => {
    // Review on Sunday (0); today is Wednesday.
    const sunday = goal({ reviewDay: 0 });

    expect(
      reviewIsDue(sunday, { today: '2026-03-18', weekStartsOn: 1, lastReviewedWeek: null }),
    ).toBe(false);
    expect(
      reviewIsDue(sunday, { today: '2026-03-22', weekStartsOn: 1, lastReviewedWeek: null }),
    ).toBe(true);
  });

  it('never asks about a paused or archived goal', () => {
    const options = { today: '2026-03-18', weekStartsOn: 1, lastReviewedWeek: null } as const;

    expect(reviewIsDue(goal({ status: 'paused' }), options)).toBe(false);
    expect(reviewIsDue(goal({ archivedAt: new Date() }), options)).toBe(false);
  });
});

describe('daysRemaining', () => {
  it('is null without a date', () => {
    expect(daysRemaining(goal(), '2026-03-18')).toBeNull();
  });

  it('counts to the target date', () => {
    expect(daysRemaining(goal({ targetDate: '2026-03-25' }), '2026-03-18')).toBe(7);
  });

  it('prefers the maintenance date, because the goal is not over when it is reached', () => {
    const held = goal({ targetDate: '2026-03-25', maintenanceDate: '2026-06-25' });

    expect(daysRemaining(held, '2026-03-18')).toBe(99);
    expect(describeGoalTiming(held, '2026-03-18')).toMatch(/to hold it/i);
  });

  it('states a passed date without dramatising it', () => {
    const text = describeGoalTiming(goal({ targetDate: '2026-03-10' }), '2026-03-18');

    expect(text).toBe('8 days past the date.');
    expect(text).not.toMatch(/overdue|late|missed|failed/i);
  });
});
