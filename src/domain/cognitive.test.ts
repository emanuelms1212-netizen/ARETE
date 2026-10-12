import { describe, expect, it } from 'vitest';
import {
  DRILLS,
  DRILL_DEFINITIONS,
  TRANSFER_NOTE,
  generateArithmetic,
  generateSequence,
  nextDrill,
  scoreItems,
  seededRandom,
  summarise,
  type DrillItem,
  type DrillResult,
} from './cognitive';

function item(correct: boolean, responseMs = 800): DrillItem {
  return { prompt: '2 + 2', answer: '4', given: correct ? '4' : '5', correct, responseMs };
}

function result(drill: DrillResult['drill'], accuracy: number): DrillResult {
  return {
    drill,
    itemsAttempted: 10,
    itemsCorrect: Math.round(accuracy * 10),
    medianResponseMs: 800,
    accuracy,
  };
}

describe('the claims this module will not make', () => {
  it('states plainly that practice does not transfer', () => {
    expect(TRANSFER_NOTE.toLowerCase()).toContain('not a measure of intelligence');
    expect(TRANSFER_NOTE.toLowerCase()).toContain('not evidence of improvement at anything else');
  });

  it('never calls a result a score, an IQ, or a percentile', () => {
    const surface = [
      TRANSFER_NOTE,
      ...DRILL_DEFINITIONS.flatMap((d) => [d.title, d.summary, d.measures]),
      summarise('mental-arithmetic', [
        result('mental-arithmetic', 0.5),
        result('mental-arithmetic', 0.6),
        result('mental-arithmetic', 0.8),
      ]).summary,
    ]
      .join(' ')
      .toLowerCase();

    expect(surface).not.toMatch(/\biq\b|percentile|\bscore\b|brain age|cognitive ability/);
  });

  it('describes what each drill measures as being about that drill', () => {
    for (const definition of DRILL_DEFINITIONS) {
      expect(definition.measures.toLowerCase(), definition.slug).toContain('at this task');
    }
  });

  it('phrases a summary about the drill, not about the person', () => {
    const curve = summarise('recall', [
      result('recall', 0.4),
      result('recall', 0.6),
      result('recall', 0.7),
    ]);

    expect(curve.summary).toContain('at this drill');
    expect(curve.summary.toLowerCase()).not.toMatch(/you are|smarter|sharper|improved cognition/);
  });
});

describe('scoreItems', () => {
  it('counts attempts and correct answers', () => {
    const scored = scoreItems('mental-arithmetic', [item(true), item(false), item(true)]);

    expect(scored.itemsAttempted).toBe(3);
    expect(scored.itemsCorrect).toBe(2);
    expect(scored.accuracy).toBeCloseTo(2 / 3, 5);
  });

  it('takes the median only over correct answers', () => {
    // A wrong answer given instantly should not flatter the response time.
    const scored = scoreItems('reaction-time', [
      item(true, 500),
      item(false, 10),
      item(true, 700),
      item(true, 900),
    ]);

    expect(scored.medianResponseMs).toBe(700);
  });

  it('has no median when nothing was right', () => {
    expect(scoreItems('recall', [item(false)]).medianResponseMs).toBeNull();
  });

  it('does not divide by zero on an empty session', () => {
    expect(scoreItems('recall', []).accuracy).toBe(0);
  });
});

describe('the generators', () => {
  it('are deterministic for a seed', () => {
    expect(generateArithmetic(42, 5, 1)).toEqual(generateArithmetic(42, 5, 1));
  });

  it('differ between seeds', () => {
    expect(generateArithmetic(1, 8, 1)).not.toEqual(generateArithmetic(2, 8, 1));
  });

  it('never asks for a negative answer in subtraction', () => {
    for (const generated of generateArithmetic(7, 200, 3)) {
      expect(Number(generated.answer)).toBeGreaterThanOrEqual(0);
    }
  });

  it('gets harder with the level', () => {
    const easy = generateArithmetic(5, 100, 1).map((g) => Number(g.answer));
    const hard = generateArithmetic(5, 100, 5).map((g) => Number(g.answer));

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(hard)).toBeGreaterThan(mean(easy));
  });

  it('builds a digit sequence of the length asked for', () => {
    const generated = generateSequence(9, 6);

    expect(generated.answer).toHaveLength(6);
    expect(generated.prompt.split(' ')).toHaveLength(6);
  });

  it('produces values inside the unit interval', () => {
    const random = seededRandom(123);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('summarise', () => {
  it('says so when there is no practice yet', () => {
    expect(summarise('recall', []).summary).toBe('No practice at this yet.');
  });

  it('refuses to see a pattern in two sessions', () => {
    const curve = summarise('recall', [result('recall', 0.2), result('recall', 0.9)]);

    expect(curve.summary).toContain('Too early to see a pattern');
  });

  it('reports an improvement against where you started', () => {
    const curve = summarise('recall', [
      result('recall', 0.4),
      result('recall', 0.5),
      result('recall', 0.8),
    ]);

    expect(curve.summary).toContain('80%');
    expect(curve.summary).toContain('up from');
  });

  it('reports a decline without dramatising it', () => {
    const curve = summarise('recall', [
      result('recall', 0.9),
      result('recall', 0.8),
      result('recall', 0.5),
    ]);

    expect(curve.summary).toContain('down from');
    expect(curve.summary.toLowerCase()).not.toMatch(/worse|slipping|declining|losing/);
  });

  it('calls a small change no change', () => {
    const curve = summarise('recall', [
      result('recall', 0.7),
      result('recall', 0.72),
      result('recall', 0.71),
    ]);

    expect(curve.summary).toContain('about the same');
  });

  it('ignores other drills entirely', () => {
    const curve = summarise('recall', [result('reaction-time', 0.1), result('recall', 0.8)]);

    expect(curve.sessions).toBe(1);
  });
});

describe('nextDrill', () => {
  it('offers the least-practised drill, so one metric cannot dominate', () => {
    const history = [
      result('mental-arithmetic', 0.8),
      result('mental-arithmetic', 0.8),
      result('recall', 0.5),
    ];

    expect(nextDrill(history)).toBe(DRILLS[0]);
  });

  it('rotates rather than repeating the last one', () => {
    const history = DRILLS.filter((d) => d !== 'recall').map((d) => result(d, 0.5));

    expect(nextDrill(history)).toBe('recall');
  });

  it('has something to offer with no history at all', () => {
    expect(DRILLS).toContain(nextDrill([]));
  });
});
