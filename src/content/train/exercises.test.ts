import { describe, expect, it } from 'vitest';
import { MOVEMENT_PATTERNS } from '@/domain/exercise';
import { EQUIPMENT } from '@/domain/onboarding';
import { animationFor } from './animations';
import { EXERCISES, exerciseBySlug } from './exercises';

describe('exercise library', () => {
  it('has unique slugs', () => {
    const slugs = EXERCISES.map((exercise) => exercise.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(EXERCISES.map((exercise) => [exercise.slug, exercise] as const))(
    '%s has a complete text fallback',
    (_slug, exercise) => {
      expect(exercise.steps.length).toBeGreaterThanOrEqual(2);
      expect(exercise.cues.length).toBeGreaterThanOrEqual(1);
      expect(exercise.mistakes.length).toBeGreaterThanOrEqual(1);
      expect(exercise.stopIf.length).toBeGreaterThanOrEqual(1);
      for (const line of [
        ...exercise.steps,
        ...exercise.cues,
        ...exercise.mistakes,
        ...exercise.stopIf,
      ]) {
        expect(line.trim().length).toBeGreaterThan(3);
      }
    },
  );

  it('points only at animations that exist', () => {
    for (const exercise of EXERCISES) {
      if (exercise.animation !== null)
        expect(animationFor(exercise.animation), exercise.slug).not.toBeNull();
    }
  });

  it('gives every one of the nine animations at least one exercise', () => {
    const used = new Set(EXERCISES.map((exercise) => exercise.animation));
    for (const slug of [
      'squat',
      'push-up',
      'lunge',
      'plank',
      'glute-bridge',
      'single-leg-rdl',
      'good-morning',
      'leg-swing',
      'elephant-walk',
    ]) {
      expect(used.has(slug), slug).toBe(true);
    }
  });

  it('uses known patterns and equipment, and loadable exercises have an increment', () => {
    for (const exercise of EXERCISES) {
      expect(MOVEMENT_PATTERNS).toContain(exercise.pattern);
      for (const item of exercise.requires) expect(EQUIPMENT).toContain(item);
      expect(exercise.loadable).toBe(exercise.incrementKg !== null);
    }
  });

  it('has a no-equipment option for every strength pattern', () => {
    for (const pattern of [
      'squat',
      'hinge',
      'lunge',
      'push_horizontal',
      'pull_horizontal',
      'core',
    ] as const) {
      expect(
        EXERCISES.some(
          (exercise) => exercise.pattern === pattern && exercise.requires.length === 0,
        ),
        pattern,
      ).toBe(true);
    }
  });

  it('finds exercises by slug', () => {
    expect(exerciseBySlug('push-up')?.name).toBe('Push-up');
    expect(exerciseBySlug('nope')).toBeNull();
  });
});
