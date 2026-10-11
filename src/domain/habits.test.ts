import { describe, expect, it } from 'vitest';
import {
  daysSinceLastCounted,
  describeStreak,
  outcomeFor,
  rollingConsistency,
  streakFrom,
  targetForDay,
  type Habit,
  type HabitDay,
  type HabitStatus,
} from './habits';
import { addDays } from './local-day';
import type { IsoDate } from './types';

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Read',
    kind: 'binary',
    unit: null,
    targetValue: null,
    minimumTarget: null,
    goalId: null,
    pausedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

/** Builds a run of consecutive scheduled days from a compact spelling. */
function days(
  from: IsoDate,
  spec: readonly (HabitStatus | 'none' | 'unscheduled' | number)[],
): HabitDay[] {
  return spec.map((entry, index) => {
    const localDate = addDays(from, index);
    if (entry === 'unscheduled') return { localDate, scheduled: false, log: null };
    if (entry === 'none') return { localDate, scheduled: true, log: null };
    if (typeof entry === 'number') {
      return {
        localDate,
        scheduled: true,
        log: { habitId: 'h1', localDate, status: 'done', value: entry, skipReason: null },
      };
    }
    return {
      localDate,
      scheduled: true,
      log: {
        habitId: 'h1',
        localDate,
        status: entry,
        value: null,
        skipReason: entry === 'skipped' ? 'Travelling' : null,
      },
    };
  });
}

describe('outcomeFor', () => {
  it('treats an unscheduled day as nothing to answer for', () => {
    const outcome = outcomeFor(habit(), {
      localDate: '2026-03-16',
      scheduled: false,
      log: null,
    });

    expect(outcome.neutral).toBe(true);
    expect(outcome.label).toBe('Not scheduled');
  });

  it('treats a rest day as neutral, not as a lapse', () => {
    const [day] = days('2026-03-16', ['rest']);

    expect(outcomeFor(habit(), day!).neutral).toBe(true);
    expect(outcomeFor(habit(), day!).label).toBe('Rest day');
  });

  it('does not call today missed before today is over', () => {
    const [day] = days('2026-03-16', ['none']);

    expect(outcomeFor(habit(), day!, '2026-03-16').neutral).toBe(true);
    expect(outcomeFor(habit(), day!, '2026-03-16').label).toBe('Not yet');
  });

  it('calls a finished unanswered day missed', () => {
    const [day] = days('2026-03-16', ['none']);

    expect(outcomeFor(habit(), day!, '2026-03-20').neutral).toBe(false);
    expect(outcomeFor(habit(), day!, '2026-03-20').label).toBe('Missed');
  });

  describe('count habits', () => {
    const reading = habit({ kind: 'count', unit: 'pages', targetValue: 20, minimumTarget: 5 });

    it('meets the target at or above it', () => {
      const [day] = days('2026-03-16', [20]);
      expect(outcomeFor(reading, day!).met).toBe(true);
    });

    it('counts the minimum as a day that still counts', () => {
      const [day] = days('2026-03-16', [5]);
      const outcome = outcomeFor(reading, day!);

      expect(outcome.met).toBe(false);
      expect(outcome.metMinimum).toBe(true);
      expect(outcome.label).toBe('Minimum met');
    });

    it('does not count a value below the minimum', () => {
      const [day] = days('2026-03-16', [2]);
      expect(outcomeFor(reading, day!).metMinimum).toBe(false);
    });
  });

  describe('limit habits', () => {
    // The inversion is the whole point: for a limit, lower is better.
    const coffee = habit({ kind: 'limit', unit: 'cups', targetValue: 2, minimumTarget: 4 });

    it('counts staying under the ceiling as success', () => {
      const [day] = days('2026-03-16', [1]);
      const outcome = outcomeFor(coffee, day!);

      expect(outcome.met).toBe(true);
      expect(outcome.label).toBe('Under');
    });

    it('counts exactly the ceiling as success', () => {
      const [day] = days('2026-03-16', [2]);
      expect(outcomeFor(coffee, day!).met).toBe(true);
    });

    it('never treats a bigger number as a better day', () => {
      const [low] = days('2026-03-16', [1]);
      const [high] = days('2026-03-16', [9]);

      expect(outcomeFor(coffee, low!).met).toBe(true);
      expect(outcomeFor(coffee, high!).met).toBe(false);
      expect(outcomeFor(coffee, high!).metMinimum).toBe(false);
    });

    it('accepts the looser ceiling on a hard day', () => {
      const [day] = days('2026-03-16', [3]);
      const outcome = outcomeFor(coffee, day!);

      expect(outcome.met).toBe(false);
      expect(outcome.metMinimum).toBe(true);
      expect(outcome.label).toBe('Over, within tolerance');
    });
  });
});

describe('streakFrom', () => {
  it('counts consecutive days that met the target', () => {
    const streak = streakFrom(habit(), days('2026-03-16', ['done', 'done', 'done']));

    expect(streak.current).toBe(3);
    expect(streak.longest).toBe(3);
  });

  it('continues through a rest day rather than breaking on it', () => {
    const streak = streakFrom(habit(), days('2026-03-16', ['done', 'rest', 'done']));

    expect(streak.current).toBe(2);
    // The rest day is not counted against consistency either.
    expect(streak.scheduledDays).toBe(2);
  });

  it('continues through an unscheduled day', () => {
    const streak = streakFrom(habit(), days('2026-03-16', ['done', 'unscheduled', 'done']));

    expect(streak.current).toBe(2);
  });

  it('continues when the user met their own minimum but not the target', () => {
    const reading = habit({ kind: 'count', unit: 'pages', targetValue: 20, minimumTarget: 5 });
    const streak = streakFrom(reading, days('2026-03-16', [20, 6, 20]));

    expect(streak.current).toBe(3);
  });

  it('ends the current streak on a missed day', () => {
    const streak = streakFrom(habit(), days('2026-03-16', ['done', 'none', 'done']), '2026-03-25');

    expect(streak.current).toBe(1);
  });

  it('keeps the longest run after a miss, because it still happened', () => {
    const streak = streakFrom(
      habit(),
      days('2026-03-16', ['done', 'done', 'done', 'none', 'done']),
      '2026-03-25',
    );

    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(3);
  });

  it('counts a skip against consistency without resetting the longest run', () => {
    const streak = streakFrom(habit(), days('2026-03-16', ['done', 'done', 'skipped']));

    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(2);
    expect(streak.countedDays).toBe(2);
    expect(streak.scheduledDays).toBe(3);
  });

  it('reports zero rather than dividing by nothing', () => {
    expect(streakFrom(habit(), []).consistency).toBe(0);
  });
});

describe('rollingConsistency', () => {
  it('looks only at the window', () => {
    // Thirty-one days: the first is a miss and should fall outside a 30-day
    // window ending on the last.
    const spec = ['none' as const, ...Array.from({ length: 30 }, () => 'done' as const)];
    const all = days('2026-03-01', spec);

    const rolling = rollingConsistency(habit(), all, {
      endingOn: '2026-03-31',
      windowDays: 30,
      today: '2026-04-05',
    });

    expect(rolling.consistency).toBe(1);
    expect(rolling.scheduledDays).toBe(30);
  });

  it('includes the miss when the window reaches back far enough', () => {
    const spec = ['none' as const, ...Array.from({ length: 30 }, () => 'done' as const)];
    const all = days('2026-03-01', spec);

    const rolling = rollingConsistency(habit(), all, {
      endingOn: '2026-03-31',
      windowDays: 31,
      today: '2026-04-05',
    });

    expect(rolling.scheduledDays).toBe(31);
    expect(rolling.countedDays).toBe(30);
  });
});

describe('describeStreak', () => {
  it('never tells someone they are back to day one', () => {
    const streak = streakFrom(
      habit(),
      days('2026-03-16', ['done', 'done', 'done', 'none']),
      '2026-03-25',
    );
    const text = describeStreak(streak);

    expect(text).toMatch(/ready when you are/i);
    expect(text).not.toMatch(/back to|lost|broken|failed|day one|start over/i);
  });

  it('mentions the longest run so that past work is still visible', () => {
    const streak = streakFrom(
      habit(),
      days('2026-03-16', ['done', 'done', 'done', 'none']),
      '2026-03-25',
    );

    expect(describeStreak(streak)).toContain('3');
  });

  it('says so when the current run is the best one', () => {
    const streak = streakFrom(habit(), days('2026-03-16', ['done', 'done', 'done']));

    expect(describeStreak(streak)).toMatch(/longest yet/i);
  });

  it('has something to say before anything is scheduled', () => {
    expect(describeStreak(streakFrom(habit(), []))).toBe('Nothing scheduled yet.');
  });

  it('is never phrased as a scolding, whatever the history', () => {
    const histories: HabitStatus[][] = [
      ['none', 'none', 'none'],
      ['skipped', 'skipped'],
      ['done', 'none', 'done'],
      ['rest', 'rest'],
    ] as HabitStatus[][];

    for (const history of histories) {
      const text = describeStreak(streakFrom(habit(), days('2026-03-16', history), '2026-03-25'));
      expect(text, history.join(',')).not.toMatch(
        /fail|lost|broke|ruin|streak is gone|you didn't|shame|again\?/i,
      );
    }
  });
});

describe('targetForDay', () => {
  const reading = habit({ kind: 'count', targetValue: 20, minimumTarget: 5 });

  it('shows the target on a normal day', () => {
    expect(targetForDay(reading, false)).toBe(20);
  });

  it('swaps in the minimum when the day is running minimal', () => {
    expect(targetForDay(reading, true)).toBe(5);
  });

  it('falls back to the target when no minimum was set', () => {
    expect(targetForDay(habit({ kind: 'count', targetValue: 20 }), true)).toBe(20);
  });
});

describe('daysSinceLastCounted', () => {
  it('measures from the last day that counted', () => {
    const history = days('2026-03-16', ['done', 'none', 'none']);

    expect(daysSinceLastCounted(habit(), history, '2026-03-18')).toBe(2);
  });

  it('is null when nothing has counted yet', () => {
    expect(daysSinceLastCounted(habit(), days('2026-03-16', ['none']), '2026-03-16')).toBeNull();
  });
});
