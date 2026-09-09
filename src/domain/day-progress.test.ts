import { describe, expect, it } from 'vitest';
import { computeDayProgress, describeDay } from './day-progress';
import type { Commitment, Day } from './types';

function commitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'habit',
    title: 'Something',
    isMinimum: false,
    status: 'pending',
    ...overrides,
  };
}

function day(overrides: Partial<Day> = {}): Day {
  return {
    date: '2026-03-16',
    mark: 'normal',
    committedAt: null,
    commitments: [],
    ...overrides,
  };
}

describe('computeDayProgress', () => {
  it('reports an empty day as quiet rather than failed', () => {
    const progress = computeDayProgress(day());

    expect(progress.isQuietDay).toBe(true);
    expect(progress.minimumDayMet).toBe(false);
    expect(progress.completionRatio).toBe(0);
  });

  it('excludes skipped commitments from the completion ratio', () => {
    const progress = computeDayProgress(
      day({
        commitments: [
          commitment({ status: 'done' }),
          commitment({ status: 'done' }),
          commitment({ status: 'skipped', skipReason: 'Slept badly' }),
        ],
      }),
    );

    // Two of two completable items, not two of three.
    expect(progress.completionRatio).toBe(1);
    expect(progress.skipped).toBe(1);
    expect(progress.total).toBe(3);
  });

  it('meets the minimum day only when every minimum commitment is done', () => {
    const partial = computeDayProgress(
      day({
        commitments: [
          commitment({ isMinimum: true, status: 'done' }),
          commitment({ isMinimum: true, status: 'pending' }),
        ],
      }),
    );
    expect(partial.minimumDayMet).toBe(false);

    const met = computeDayProgress(
      day({
        commitments: [
          commitment({ isMinimum: true, status: 'done' }),
          commitment({ isMinimum: true, status: 'done' }),
          commitment({ status: 'pending' }),
        ],
      }),
    );
    expect(met.minimumDayMet).toBe(true);
  });

  it('does not treat a skipped minimum as met', () => {
    const progress = computeDayProgress(
      day({ commitments: [commitment({ isMinimum: true, status: 'skipped' })] }),
    );

    expect(progress.minimumDayMet).toBe(false);
    expect(progress.isQuietDay).toBe(false);
  });

  it('counts a day with no minimums as not met', () => {
    const progress = computeDayProgress(day({ commitments: [commitment({ status: 'done' })] }));

    expect(progress.minimumTotal).toBe(0);
    expect(progress.minimumDayMet).toBe(false);
  });
});

describe('describeDay', () => {
  const forbidden = ['fail', 'failed', 'broke', 'broken', 'lost', 'streak', '!'];

  function assertToneIsSafe(text: string) {
    for (const word of forbidden) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  }

  it('never shames an empty day', () => {
    const subject = day();
    const text = describeDay(subject, computeDayProgress(subject));

    expect(text).toBe('Nothing planned yet. Pick one thing.');
    assertToneIsSafe(text);
  });

  it('holds a not-today day without owing anything', () => {
    const subject = day({
      mark: 'not-today',
      commitments: [commitment({ isMinimum: true, status: 'pending' })],
    });

    expect(describeDay(subject, computeDayProgress(subject))).toBe('Held for today. Nothing owed.');
  });

  it('acknowledges a travel day', () => {
    const subject = day({ mark: 'travel', commitments: [commitment({ status: 'done' })] });

    expect(describeDay(subject, computeDayProgress(subject))).toBe(
      'A travel day, and you still moved.',
    );
  });

  it('uses non-shaming language in every reachable branch', () => {
    const cases: Day[] = [
      day(),
      day({ mark: 'travel' }),
      day({ mark: 'not-today' }),
      day({ commitments: [commitment({ status: 'pending' })] }),
      day({ commitments: [commitment({ isMinimum: true, status: 'done' })] }),
      day({
        commitments: [
          commitment({ isMinimum: true, status: 'done' }),
          commitment({ status: 'pending' }),
        ],
      }),
      day({
        commitments: [commitment({ status: 'done' }), commitment({ status: 'pending' })],
      }),
    ];

    for (const subject of cases) {
      assertToneIsSafe(describeDay(subject, computeDayProgress(subject)));
    }
  });
});
