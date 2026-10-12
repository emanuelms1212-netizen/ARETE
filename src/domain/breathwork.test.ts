import { describe, expect, it } from 'vitest';
import {
  BREATHWORK_SAFETY,
  BREATH_PRACTICES,
  breathPracticeBySlug,
  breathStateAt,
  cycleSeconds,
  isConservative,
  sessionSeconds,
  type BreathPattern,
} from './breathwork';

const BOX: BreathPattern = { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 };
const CALM: BreathPattern = { inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 };

describe('breathStateAt', () => {
  it('starts on the in-breath', () => {
    const state = breathStateAt(BOX, 0, 8);

    expect(state.phase).toBe('inhale');
    expect(state.label).toBe('Breathe in');
    expect(state.round).toBe(0);
  });

  it('walks through every phase of a box pattern in order', () => {
    expect(breathStateAt(BOX, 1, 8).phase).toBe('inhale');
    expect(breathStateAt(BOX, 5, 8).phase).toBe('holdIn');
    expect(breathStateAt(BOX, 9, 8).phase).toBe('exhale');
    expect(breathStateAt(BOX, 13, 8).phase).toBe('holdOut');
  });

  it('skips zero-length phases rather than flashing them', () => {
    // Calm breathing has no holds at all: 4 in, 6 out, and nothing between.
    expect(breathStateAt(CALM, 3.9, 10).phase).toBe('inhale');
    expect(breathStateAt(CALM, 4.1, 10).phase).toBe('exhale');
    expect(breathStateAt(CALM, 9.9, 10).phase).toBe('exhale');
    expect(breathStateAt(CALM, 10.1, 10).phase).toBe('inhale');
  });

  it('counts rounds as whole cycles', () => {
    expect(breathStateAt(BOX, 0, 8).round).toBe(0);
    expect(breathStateAt(BOX, 15.9, 8).round).toBe(0);
    expect(breathStateAt(BOX, 16, 8).round).toBe(1);
    expect(breathStateAt(BOX, 48, 8).round).toBe(3);
  });

  it('is complete once the rounds are done', () => {
    const state = breathStateAt(BOX, 16 * 8, 8);

    expect(state.isComplete).toBe(true);
    expect(state.roundsRemaining).toBe(0);
    expect(state.label).toBe('Done');
  });

  it('gives the same answer however many times it is asked', () => {
    // The property the orb depends on: a backgrounded tab resumes where the
    // breath actually is, not where an interval stopped.
    const answers = [11.5, 11.5, 11.5].map((t) => breathStateAt(BOX, t, 8));

    expect(new Set(answers.map((a) => `${a.phase}:${a.phaseRemaining}`)).size).toBe(1);
  });

  it('swells on the in-breath and empties on the out', () => {
    expect(breathStateAt(BOX, 0.1, 8).scale).toBeLessThan(0.2);
    expect(breathStateAt(BOX, 3.9, 8).scale).toBeGreaterThan(0.9);
    // Held at the top.
    expect(breathStateAt(BOX, 6, 8).scale).toBe(1);
    expect(breathStateAt(BOX, 11.9, 8).scale).toBeLessThan(0.1);
    // Held at the bottom.
    expect(breathStateAt(BOX, 14, 8).scale).toBe(0);
  });

  it('never returns a negative time, even with a clock that went backwards', () => {
    const state = breathStateAt(BOX, -30, 8);

    expect(state.phaseRemaining).toBeGreaterThanOrEqual(0);
    expect(state.round).toBe(0);
  });
});

describe('the patterns that ship', () => {
  it('includes the five the product offers', () => {
    expect(BREATH_PRACTICES.map((p) => p.slug)).toEqual([
      'calm-breathing',
      'box-breathing',
      'extended-exhale',
      'coherent-breathing',
      'pre-focus',
    ]);
  });

  it('are all conservative enough to coach unsupervised', () => {
    // The guard that matters: this fails if someone later adds a
    // hyperventilation protocol to the list.
    for (const practice of BREATH_PRACTICES) {
      expect(isConservative(practice.pattern), practice.slug).toBe(true);
    }
  });

  it('never ask for a hold longer than eight seconds', () => {
    for (const practice of BREATH_PRACTICES) {
      expect(Math.max(practice.pattern.holdIn, practice.pattern.holdOut)).toBeLessThanOrEqual(8);
    }
  });

  it('never ask for fast breathing', () => {
    for (const practice of BREATH_PRACTICES) {
      const breathsPerMinute = 60 / cycleSeconds(practice.pattern);
      expect(breathsPerMinute, practice.slug).toBeLessThanOrEqual(12);
    }
  });

  it('rejects an over-breathing pattern', () => {
    // Twenty-five fast breaths then a long retention — the shape of the
    // protocols this product deliberately does not ship.
    expect(isConservative({ inhale: 1, holdIn: 0, exhale: 1, holdOut: 0 })).toBe(false);
    expect(isConservative({ inhale: 2, holdIn: 60, exhale: 2, holdOut: 0 })).toBe(false);
  });

  it('is found by slug, and absent for anything else', () => {
    expect(breathPracticeBySlug('box-breathing')?.title).toBe('Box breathing');
    expect(breathPracticeBySlug('wim-hof')).toBeNull();
  });
});

describe('sessionSeconds', () => {
  it('multiplies the cycle by the rounds', () => {
    expect(sessionSeconds(BOX, 8)).toBe(128);
    expect(sessionSeconds(CALM, 10)).toBe(100);
  });
});

describe('the safety notice', () => {
  it('names the symptoms that mean stop', () => {
    const text = BREATHWORK_SAFETY.join(' ').toLowerCase();

    for (const symptom of ['dizzy', 'tingling', 'distress']) {
      expect(text).toContain(symptom);
    }
  });

  it('names the places never to practise', () => {
    const text = BREATHWORK_SAFETY.join(' ').toLowerCase();

    expect(text).toContain('water');
    expect(text).toContain('driving');
    expect(text).toContain('cold exposure');
  });

  it('makes no claim about what breathing will do for you', () => {
    const text = BREATHWORK_SAFETY.join(' ').toLowerCase();

    expect(text).not.toMatch(/cure|treat|heal|detox|boost|immune|anxiety disorder|guarantee/);
  });
});
