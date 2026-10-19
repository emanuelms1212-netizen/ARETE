import type { BodyRegion } from './onboarding';
import { EQUIPMENT } from './onboarding';

/**
 * What an exercise is, as far as the plan engine and the screens care.
 *
 * The library itself lives in `content/train/exercises.ts`. This file holds the
 * shape and the two questions asked of it everywhere: "which of these can this
 * person do with what they have and how they feel today?" and "if not this
 * one, what keeps the same intent?"
 */
export type Equipment = (typeof EQUIPMENT)[number];

/**
 * Movement patterns. Substitution preserves the pattern, because the pattern
 * is the intent: a goblet squat and a box squat train the same thing at
 * different loads; a goblet squat and a push-up do not.
 */
export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'push_horizontal',
  'push_vertical',
  'pull_horizontal',
  'pull_vertical',
  'core',
  'carry',
  'conditioning',
  'run',
  'agility',
  'warmup',
  'cooldown',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const PATTERN_LABEL: Record<MovementPattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Single-leg',
  push_horizontal: 'Push',
  push_vertical: 'Overhead push',
  pull_horizontal: 'Row',
  pull_vertical: 'Pull-down',
  core: 'Trunk',
  carry: 'Carry',
  conditioning: 'Conditioning',
  run: 'Run',
  agility: 'Footwork',
  warmup: 'Warm-up',
  cooldown: 'Cool-down',
};

export type Measure = 'reps' | 'time' | 'distance';

export interface Exercise {
  readonly slug: string;
  readonly name: string;
  readonly pattern: MovementPattern;
  /** Every item listed is needed. `[]` means nothing but the floor. */
  readonly requires: readonly Equipment[];
  readonly measure: Measure;
  /** 1 (anyone) to 5 (needs real experience). Used to pick, never to rank people. */
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  /** Regions this movement loads. A pain flag on any of them changes what is offered. */
  readonly loads: readonly BodyRegion[];
  /** True when the exercise progresses by adding external load. */
  readonly loadable: boolean;
  /** Smallest sensible load jump, in kg. Null when not loadable. */
  readonly incrementKg: number | null;
  /** Counted per side (lunges, single-leg work). */
  readonly perSide: boolean;
  /** The text fallback. Every exercise has all four, animated or not. */
  readonly steps: readonly string[];
  readonly cues: readonly string[];
  readonly mistakes: readonly string[];
  readonly stopIf: readonly string[];
  /** The slug of an animation in `content/train/animations`, when one exists. */
  readonly animation: string | null;
}

export interface Availability {
  readonly equipment: readonly Equipment[];
  /** Regions nothing may load: severe pain flags and injuries. */
  readonly excludedRegions: readonly BodyRegion[];
  /** Regions to treat gently: offer the easiest version. */
  readonly gentleRegions: readonly BodyRegion[];
  /** Exercises the person asked not to be given. */
  readonly avoid: readonly string[];
}

/** True when this person has everything the exercise needs and nothing rules it out. */
export function isAvailable(exercise: Exercise, availability: Availability): boolean {
  const owned = new Set<Equipment>(availability.equipment);
  if (!exercise.requires.every((item) => item === 'none' || owned.has(item))) return false;
  if (exercise.loads.some((region) => availability.excludedRegions.includes(region))) return false;
  if (availability.avoid.includes(exercise.slug)) return false;
  return true;
}

export function touchesGentleRegion(exercise: Exercise, availability: Availability): boolean {
  return exercise.loads.some((region) => availability.gentleRegions.includes(region));
}

/**
 * Same-pattern alternatives, nearest in difficulty first, then by name so the
 * order never depends on the order the library happens to be written in.
 */
export function substitutesFor(
  exercise: Exercise,
  library: readonly Exercise[],
  availability: Availability,
  limit = 3,
): Exercise[] {
  return library
    .filter(
      (candidate) =>
        candidate.slug !== exercise.slug &&
        candidate.pattern === exercise.pattern &&
        isAvailable(candidate, availability),
    )
    .sort(
      (a, b) =>
        Math.abs(a.difficulty - exercise.difficulty) -
          Math.abs(b.difficulty - exercise.difficulty) ||
        a.difficulty - b.difficulty ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** The next harder exercise in the same pattern that this person can do, if there is one. */
export function harderVariant(
  exercise: Exercise,
  library: readonly Exercise[],
  availability: Availability,
): Exercise | null {
  return (
    library
      .filter(
        (candidate) =>
          candidate.pattern === exercise.pattern &&
          candidate.difficulty === exercise.difficulty + 1 &&
          isAvailable(candidate, availability),
      )
      .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null
  );
}

/** The next easier exercise in the same pattern, for pain or a hard day. */
export function easierVariant(
  exercise: Exercise,
  library: readonly Exercise[],
  availability: Availability,
): Exercise | null {
  return (
    library
      .filter(
        (candidate) =>
          candidate.pattern === exercise.pattern &&
          candidate.difficulty < exercise.difficulty &&
          isAvailable(candidate, availability),
      )
      .sort((a, b) => b.difficulty - a.difficulty || a.name.localeCompare(b.name))[0] ?? null
  );
}
