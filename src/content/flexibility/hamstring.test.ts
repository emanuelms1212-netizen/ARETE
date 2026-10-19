import { describe, expect, it } from 'vitest';
import { animationFor } from '@/content/train/animations';
import { FLEX_MOVEMENTS, HAMSTRING_PROGRAM, flexMovement, flexProgram } from './hamstring';

/**
 * The programme is a sourced template, so these tests pin it to the source:
 * the weeks, the sessions and the doses in SOURCE_MAP §7. If someone edits a
 * number here, they should have to edit it there too, on purpose.
 */
describe('hamstring programme', () => {
  it('is four weeks of three sessions', () => {
    expect(HAMSTRING_PROGRAM.weeks).toBe(4);
    expect(HAMSTRING_PROGRAM.sessionsPerWeek).toBe(3);
    expect(HAMSTRING_PROGRAM.sessions).toHaveLength(12);
    for (let week = 1; week <= 4; week += 1) {
      expect(
        HAMSTRING_PROGRAM.sessions
          .filter((session) => session.week === week)
          .map((session) => session.day),
      ).toEqual([1, 2, 3]);
    }
  });

  it('matches the source table, session by session', () => {
    const shape = HAMSTRING_PROGRAM.sessions.map((session) =>
      session.items
        .map((item) => `${item.movementSlug} ${item.sets}x${item.reps ?? `${item.seconds}s`}`)
        .join(', '),
    );
    const a = 'hamstring-kicks 1x15, single-leg-rdl 1x10, toe-touch 2x30s';
    const b = 'elephant-walk 1x30, good-morning 1x10, single-leg-hamstring-stretch 2x30s';
    const c =
      'sit-and-reach-reps 1x10, sit-and-reach-hold 1x30s, flat-back-hamstring-stretch 2x30s';
    const d = 'cross-body-leg-swing 1x15, standing-pancake 1x30s, pancake 2x30s';
    const e = 'standing-pancake-good-morning 1x10, hamstring-chokes 1x15, toe-touch 2x30s';
    const f =
      'roll-down 1x10, standing-pancake-good-morning 1x10, cross-body-hamstring-stretch 2x30s';
    expect(shape).toEqual([a, b, a, b, c, d, c, d, e, f, e, f]);
  });

  it('has the source warm-up, at the bottom of its range, and a no-impact alternative', () => {
    expect(HAMSTRING_PROGRAM.warmup.map((item) => item.movementSlug)).toEqual([
      'walking-lunge',
      'leg-swing',
      'high-knees',
      'jog-in-place',
    ]);
    for (const item of HAMSTRING_PROGRAM.warmup) expect(item.sets).toBe(2);
    const noImpact = HAMSTRING_PROGRAM.noImpactWarmup.map((item) => item.movementSlug);
    expect(noImpact).not.toContain('jog-in-place');
    expect(noImpact).not.toContain('high-knees');
  });

  it('points back to the source, and says its rights are pending', () => {
    expect(HAMSTRING_PROGRAM.provenance.filename).toBe('Total Flexibility - V2.pdf');
    expect(HAMSTRING_PROGRAM.provenance.note).toMatch(/ARETE’s own summaries/);
    expect(HAMSTRING_PROGRAM.rightsStatus).toBe('pending');
  });

  it('carries no promise it cannot keep', () => {
    const text = JSON.stringify(HAMSTRING_PROGRAM) + JSON.stringify(FLEX_MOVEMENTS);
    expect(text).not.toMatch(/prevent(s)? (all )?injur|guarantee|you will be able to/i);
    expect(text).not.toMatch(/Flexy|discount|Movement by David/i);
  });

  it('is found by slug', () => {
    expect(flexProgram('hamstring-mobility')).toBe(HAMSTRING_PROGRAM);
    expect(flexProgram('nope')).toBeNull();
  });
});

describe('flexibility movements', () => {
  it('cover every movement the programme and both warm-ups use', () => {
    const used = [
      ...HAMSTRING_PROGRAM.warmup,
      ...HAMSTRING_PROGRAM.noImpactWarmup,
      ...HAMSTRING_PROGRAM.sessions.flatMap((session) => session.items),
    ].map((item) => item.movementSlug);
    for (const slug of used) expect(flexMovement(slug), slug).not.toBeNull();
  });

  it('include the fifteen named in the brief', () => {
    for (const slug of [
      'hamstring-kicks',
      'elephant-walk',
      'single-leg-rdl',
      'good-morning',
      'toe-touch',
      'single-leg-hamstring-stretch',
      'sit-and-reach-reps',
      'cross-body-leg-swing',
      'standing-pancake',
      'flat-back-hamstring-stretch',
      'pancake',
      'hamstring-chokes',
      'roll-down',
      'standing-pancake-good-morning',
      'cross-body-hamstring-stretch',
    ]) {
      expect(flexMovement(slug), slug).not.toBeNull();
    }
  });

  it.each(FLEX_MOVEMENTS.map((movement) => [movement.slug, movement] as const))(
    '%s has a complete text instruction and an easier version',
    (_slug, movement) => {
      expect(movement.steps.length).toBeGreaterThanOrEqual(2);
      expect(movement.cues.length).toBeGreaterThanOrEqual(1);
      expect(movement.mistakes.length).toBeGreaterThanOrEqual(1);
      expect(movement.stopIf.length).toBeGreaterThanOrEqual(1);
      expect(movement.easier.how.length).toBeGreaterThan(10);
      if (movement.animation !== null) expect(animationFor(movement.animation)).not.toBeNull();
      // Summaries, not copies: nothing long enough to be a lifted paragraph.
      for (const step of movement.steps) expect(step.length).toBeLessThan(140);
    },
  );

  it('flags the loaded end-range positions the source map calls out', () => {
    for (const slug of ['pancake', 'standing-pancake', 'roll-down']) {
      expect(flexMovement(slug)?.endRange, slug).toBe(true);
    }
  });

  it('has unique slugs', () => {
    const slugs = FLEX_MOVEMENTS.map((movement) => movement.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
