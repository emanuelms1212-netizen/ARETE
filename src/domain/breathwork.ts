import { z } from 'zod';

/**
 * Breathwork patterns, and the phase you are in right now.
 *
 * The orb is driven the same way the focus timer is: nothing counts, and the
 * phase is derived from elapsed seconds. A backgrounded tab, a locked phone
 * and a reload all compute the same answer, so the animation resumes where the
 * breath actually is rather than where a paused interval left it.
 *
 * What is deliberately absent matters as much as what is here. There is no
 * hyperventilation pattern — no Wim Hof rounds, no breath-of-fire, no
 * retention after forced over-breathing. Those carry a real risk of syncope
 * and are not something an app should coach unsupervised, so the MVP does not
 * ship them (PRODUCT_SPEC: conservative defaults, explicit safety exits).
 */
export const breathPhaseSchema = z.enum(['inhale', 'holdIn', 'exhale', 'holdOut']);
export type BreathPhase = z.infer<typeof breathPhaseSchema>;

export const breathPatternSchema = z.object({
  inhale: z.number().positive(),
  holdIn: z.number().nonnegative(),
  exhale: z.number().positive(),
  holdOut: z.number().nonnegative(),
});
export type BreathPattern = z.infer<typeof breathPatternSchema>;

export interface BreathworkPractice {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly pattern: BreathPattern;
  readonly defaultRounds: number;
  /** Why someone would choose this one over the others. */
  readonly useWhen: string;
}

/**
 * The five the brief asks for, and nothing more adventurous.
 *
 * Every one of these is a slow or balanced pattern. The longest hold is four
 * seconds, which is well inside what is comfortable at rest.
 */
export const BREATH_PRACTICES: readonly BreathworkPractice[] = [
  {
    slug: 'calm-breathing',
    title: 'Calm breathing',
    summary: 'Slow and even, with no holds. The one to start with.',
    pattern: { inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 },
    defaultRounds: 10,
    useWhen: 'Anywhere, any time. Nothing about it is strenuous.',
  },
  {
    slug: 'box-breathing',
    title: 'Box breathing',
    summary: 'Four equal sides: in, hold, out, hold.',
    pattern: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 },
    defaultRounds: 8,
    useWhen: 'When your attention is scattered and you want something to count.',
  },
  {
    slug: 'extended-exhale',
    title: 'Extended exhale',
    summary: 'A long breath out, roughly twice the length of the breath in.',
    pattern: { inhale: 4, holdIn: 0, exhale: 8, holdOut: 0 },
    defaultRounds: 8,
    useWhen: 'When you are winding down, or cannot settle at night.',
  },
  {
    slug: 'coherent-breathing',
    title: 'Coherent breathing',
    summary: 'Five and five — about six breaths a minute.',
    pattern: { inhale: 5, holdIn: 0, exhale: 5, holdOut: 0 },
    defaultRounds: 12,
    useWhen: 'For a steady ten minutes rather than a quick reset.',
  },
  {
    slug: 'pre-focus',
    title: 'Before focus',
    summary: 'Three slow rounds with a short hold, then start work.',
    pattern: { inhale: 4, holdIn: 2, exhale: 6, holdOut: 0 },
    defaultRounds: 3,
    useWhen: 'Immediately before a focus block, as a way of beginning.',
  },
];

export function breathPracticeBySlug(slug: string): BreathworkPractice | null {
  return BREATH_PRACTICES.find((practice) => practice.slug === slug) ?? null;
}

/** Seconds in one full cycle of this pattern. */
export function cycleSeconds(pattern: BreathPattern): number {
  return pattern.inhale + pattern.holdIn + pattern.exhale + pattern.holdOut;
}

export interface BreathState {
  readonly phase: BreathPhase;
  readonly label: string;
  /** Seconds left in this phase, counting down. */
  readonly phaseRemaining: number;
  readonly phaseSeconds: number;
  /** 0 to 1 through the current phase. */
  readonly phaseProgress: number;
  /** How large the orb should be, 0 to 1. Rises on the in-breath, falls on the out. */
  readonly scale: number;
  /** Completed rounds so far. */
  readonly round: number;
  readonly roundsRemaining: number;
  readonly isComplete: boolean;
}

const PHASE_LABEL: Record<BreathPhase, string> = {
  inhale: 'Breathe in',
  holdIn: 'Hold',
  exhale: 'Breathe out',
  holdOut: 'Rest',
};

/**
 * Where the breath is, derived from how long the session has been running.
 *
 * Phases of zero length are skipped rather than rendered for an instant, which
 * is what makes the same function work for a pattern with holds and one
 * without.
 */
export function breathStateAt(
  pattern: BreathPattern,
  elapsedSeconds: number,
  rounds: number,
): BreathState {
  const cycle = cycleSeconds(pattern);
  const elapsed = Math.max(0, elapsedSeconds);
  const completedRounds = Math.floor(elapsed / cycle);

  if (completedRounds >= rounds) {
    return {
      phase: 'holdOut',
      label: 'Done',
      phaseRemaining: 0,
      phaseSeconds: 0,
      phaseProgress: 1,
      scale: 0,
      round: rounds,
      roundsRemaining: 0,
      isComplete: true,
    };
  }

  const within = elapsed - completedRounds * cycle;
  const phases: readonly { phase: BreathPhase; seconds: number }[] = [
    { phase: 'inhale', seconds: pattern.inhale },
    { phase: 'holdIn', seconds: pattern.holdIn },
    { phase: 'exhale', seconds: pattern.exhale },
    { phase: 'holdOut', seconds: pattern.holdOut },
  ];

  let offset = 0;
  for (const step of phases) {
    if (step.seconds <= 0) continue;
    if (within < offset + step.seconds) {
      const into = within - offset;
      const progress = into / step.seconds;

      // The orb is full at the top of the in-breath and empty at the bottom of
      // the out-breath; the holds keep it where it was.
      const scale =
        step.phase === 'inhale'
          ? progress
          : step.phase === 'holdIn'
            ? 1
            : step.phase === 'exhale'
              ? 1 - progress
              : 0;

      return {
        phase: step.phase,
        label: PHASE_LABEL[step.phase],
        phaseRemaining: Math.max(0, step.seconds - into),
        phaseSeconds: step.seconds,
        phaseProgress: progress,
        scale,
        round: completedRounds,
        roundsRemaining: rounds - completedRounds,
        isComplete: false,
      };
    }
    offset += step.seconds;
  }

  // Unreachable while the pattern has a positive inhale and exhale, which the
  // schema requires. Falling back to the start beats throwing at the user.
  return breathStateAt(pattern, completedRounds * cycle, rounds);
}

/** How long a session of this many rounds will take. */
export function sessionSeconds(pattern: BreathPattern, rounds: number): number {
  return cycleSeconds(pattern) * rounds;
}

/**
 * The safety notice, shown before every breathwork session.
 *
 * Not a disclaimer dump and not hidden behind a link: four lines, in the order
 * someone would actually need them, on the screen where the decision is made.
 */
export const BREATHWORK_SAFETY: readonly string[] = [
  'Stop if you feel dizzy, light-headed, tingling, short of breath, or distressed. Breathe normally and sit down.',
  'Never practise in or near water, while driving, or while standing in cold exposure.',
  'If you are pregnant, or have a heart, lung or blood-pressure condition, check with a clinician first.',
  'These are slow patterns. Nothing here asks you to over-breathe, and you should not feel pushed.',
];

/**
 * Whether a pattern is gentle enough for the app to coach unsupervised.
 *
 * Used by a test rather than by a form: it exists so that adding an aggressive
 * pattern later fails loudly instead of quietly shipping.
 */
export function isConservative(pattern: BreathPattern): boolean {
  const longestHold = Math.max(pattern.holdIn, pattern.holdOut);
  const rate = 60 / cycleSeconds(pattern);
  return longestHold <= 8 && rate <= 20 && pattern.exhale >= pattern.inhale * 0.5;
}
