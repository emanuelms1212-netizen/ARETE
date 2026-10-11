import type { BodyRegion, HealthAnswers, OnboardingProfile } from './onboarding';

/**
 * The safety rules.
 *
 * Plain, deterministic functions over what the user told us. No model is
 * consulted and no probability is involved: a safety gate that can be argued
 * out of is not a gate. The build rules put it bluntly — never use an LLM
 * response as the sole safety gate — and here there is no LLM in the path at all.
 *
 * Three things this deliberately does **not** do:
 *
 *   * It does not diagnose. "You said you have fainted before" is a fact the
 *     user gave us; "you have a cardiovascular condition" is not ours to say.
 *   * It does not refuse to let anyone use the app. It declines to *generate*
 *     particular things, and says why, and offers the nearest safe alternative.
 *   * It does not treat silence as consent. Someone who preferred not to answer
 *     gets an acknowledgement screen, not a blocked module — blocking people for
 *     declining a personal question teaches them to lie to the form.
 */
export const SAFETY_MODULES = [
  'cold_exposure',
  'contrast_therapy',
  'sauna',
  'loaded_mobility',
  'high_intensity',
  'calorie_targets',
  'fasting',
] as const;

export type SafetyModule = (typeof SAFETY_MODULES)[number];

export type SafetyOutcome = 'allowed' | 'requires_acknowledgement' | 'rerouted' | 'blocked';

export interface SafetyDecision {
  readonly module: SafetyModule;
  readonly outcome: SafetyOutcome;
  /** Shown to the user, in the second person, without jargon. */
  readonly reason: string;
  /** What is offered instead. Present whenever the outcome is `rerouted`. */
  readonly alternative?: string;
}

export interface SafetyReport {
  readonly decisions: readonly SafetyDecision[];
  /** Regions an injury excludes from loading, by severity. */
  readonly excludedRegions: readonly BodyRegion[];
  readonly regressedRegions: readonly BodyRegion[];
  readonly isMinor: boolean;
  /** True when the combination warrants asking a clinician before hard training. */
  readonly clearanceRecommended: boolean;
}

const RANK: Record<SafetyOutcome, number> = {
  allowed: 0,
  requires_acknowledgement: 1,
  rerouted: 2,
  blocked: 3,
};

/** The strictest decision wins, always. Rules can only ever tighten. */
function tighten(current: SafetyDecision | undefined, candidate: SafetyDecision): SafetyDecision {
  if (!current) return candidate;
  return RANK[candidate.outcome] > RANK[current.outcome] ? candidate : current;
}

export function isMinor(birthYear: number | undefined, onDate: string): boolean {
  if (birthYear === undefined) return false;
  const year = Number(onDate.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  // Year granularity, erring towards treating someone as a minor: the app asks
  // for a year rather than a birth date, so the conservative reading is right.
  return year - birthYear < 18;
}

function injuryGates(health: HealthAnswers): {
  excluded: BodyRegion[];
  regressed: BodyRegion[];
} {
  const excluded: BodyRegion[] = [];
  const regressed: BodyRegion[] = [];

  for (const injury of health.injuries) {
    if (injury.severity === 'severe') excluded.push(injury.region);
    else if (injury.severity === 'moderate') regressed.push(injury.region);
  }

  return { excluded, regressed };
}

/**
 * Evaluates every rule and returns one decision per module.
 *
 * `onDate` is passed in rather than read from the clock, so the age gate is
 * testable and the whole function stays pure.
 */
export function evaluateSafety(profile: OnboardingProfile, onDate: string): SafetyReport {
  const { health, age, training } = profile;
  const decisions = new Map<SafetyModule, SafetyDecision>();

  const record = (decision: SafetyDecision): void => {
    decisions.set(decision.module, tighten(decisions.get(decision.module), decision));
  };

  for (const gated of SAFETY_MODULES) {
    record({ module: gated, outcome: 'allowed', reason: 'Nothing you told us rules this out.' });
  }

  const minor = isMinor(age.birthYear, onDate);
  let clearanceRecommended = health.medicalClearanceNeeded;

  // --- Pregnancy and postpartum -------------------------------------------
  if (health.pregnancyStatus === 'pregnant' || health.pregnancyStatus === 'postpartum') {
    const phrase =
      health.pregnancyStatus === 'pregnant' ? 'you are pregnant' : 'you are postpartum';

    for (const gated of ['cold_exposure', 'contrast_therapy', 'sauna'] as const) {
      record({
        module: gated,
        outcome: 'blocked',
        reason: `You told us ${phrase}, so ARETE will not schedule heat or cold immersion. This is a general caution, not advice about you.`,
      });
    }
    record({
      module: 'fasting',
      outcome: 'blocked',
      reason: `You told us ${phrase}, so no fasting targets are generated.`,
    });
    record({
      module: 'loaded_mobility',
      outcome: 'rerouted',
      reason: `You told us ${phrase}, so end-range loaded stretching is left out.`,
      alternative: 'Gentle, supported mobility with no end-range loading.',
    });
    record({
      module: 'high_intensity',
      outcome: 'rerouted',
      reason: `You told us ${phrase}, so the first week stays at conversational effort.`,
      alternative: 'Moderate sessions you could hold a conversation through.',
    });
    clearanceRecommended = true;
  }

  // Declining to answer is not an answer, and must not be punished like one.
  if (health.pregnancyStatus === 'prefer_not_to_say') {
    for (const gated of ['cold_exposure', 'contrast_therapy', 'sauna'] as const) {
      record({
        module: gated,
        outcome: 'requires_acknowledgement',
        reason:
          'You preferred not to answer that question, which is fine. Heat and cold work stays behind a safety notice you read first.',
      });
    }
  }

  // --- Cardiovascular or fainting history ---------------------------------
  if (health.cardiovascularOrFaintingHistory) {
    for (const gated of ['cold_exposure', 'contrast_therapy', 'sauna'] as const) {
      record({
        module: gated,
        outcome: 'blocked',
        reason:
          'You told us you have a heart condition or have fainted before. Cold immersion and sauna are exactly the situations where that matters, so ARETE will not schedule them.',
      });
    }
    record({
      module: 'high_intensity',
      outcome: 'rerouted',
      reason:
        'Hard intervals are left out of the first week until a clinician has said they are fine for you.',
      alternative: 'Moderate sessions, and a note to raise it at your next appointment.',
    });
    clearanceRecommended = true;
  }

  // --- Temperature sensitivity --------------------------------------------
  if (health.heatSensitivity) {
    for (const gated of ['sauna', 'contrast_therapy'] as const) {
      record({
        module: gated,
        outcome: 'blocked',
        reason:
          'You told us you do not tolerate heat well, so no sauna or heat phases are scheduled.',
      });
    }
  }

  if (health.coldSensitivity) {
    record({
      module: 'cold_exposure',
      outcome: 'blocked',
      reason: 'You told us you do not tolerate cold well, so no cold immersion is scheduled.',
    });
    record({
      module: 'contrast_therapy',
      outcome: 'rerouted',
      reason: 'Contrast therapy needs a cold phase, which you told us does not suit you.',
      alternative: 'Warm shower and gentle mobility instead.',
    });
  }

  // --- Clearance pending ---------------------------------------------------
  if (health.medicalClearanceNeeded && !health.medicalClearanceConfirmed) {
    record({
      module: 'high_intensity',
      outcome: 'rerouted',
      reason: 'You said you are waiting on medical clearance, so the first week stays light.',
      alternative: 'Walking, mobility and easy sessions until that is confirmed.',
    });
  }

  // --- Age gate ------------------------------------------------------------
  if (minor && !age.guardianConfirmed) {
    record({
      module: 'calorie_targets',
      outcome: 'blocked',
      reason:
        'Calorie targets for anyone under 18 need a guardian or clinician to agree them, so ARETE does not generate one.',
    });
    record({
      module: 'fasting',
      outcome: 'blocked',
      reason: 'No fasting targets are generated for anyone under 18.',
    });
    record({
      module: 'cold_exposure',
      outcome: 'requires_acknowledgement',
      reason:
        'Cold immersion stays behind a safety notice, and is best done with an adult present.',
    });
  }

  // --- Experience ----------------------------------------------------------
  if (training.experience === 'new' || training.recentActivity === 'none') {
    record({
      module: 'high_intensity',
      outcome: 'rerouted',
      reason:
        'The first week is deliberately easier than what you can probably manage, because week one is for showing up.',
      alternative: 'Moderate sessions you finish feeling like you could have done more.',
    });
  }

  const { excluded, regressed } = injuryGates(health);

  if (excluded.length > 0) {
    record({
      module: 'loaded_mobility',
      outcome: 'blocked',
      reason: `You told us about a severe problem with your ${excluded.join(' and ')}, so nothing loads that area this week.`,
    });
  } else if (regressed.length > 0) {
    record({
      module: 'loaded_mobility',
      outcome: 'rerouted',
      reason: `You told us your ${regressed.join(' and ')} is not right at the moment.`,
      alternative: 'The easier version of each movement, and a way to stop at any point.',
    });
  }

  return {
    decisions: SAFETY_MODULES.map((module) => decisions.get(module)!),
    excludedRegions: excluded,
    regressedRegions: regressed,
    isMinor: minor,
    clearanceRecommended,
  };
}

export function decisionFor(report: SafetyReport, module: SafetyModule): SafetyDecision {
  const found = report.decisions.find((decision) => decision.module === module);
  if (!found) throw new Error(`No safety decision recorded for ${module}`);
  return found;
}

export function isBlocked(report: SafetyReport, module: SafetyModule): boolean {
  return decisionFor(report, module).outcome === 'blocked';
}

export function isAllowed(report: SafetyReport, module: SafetyModule): boolean {
  return decisionFor(report, module).outcome === 'allowed';
}

/** Everything the user should be told, in the order it should be shown. */
export function notableDecisions(report: SafetyReport): readonly SafetyDecision[] {
  return report.decisions
    .filter((decision) => decision.outcome !== 'allowed')
    .sort((a, b) => RANK[b.outcome] - RANK[a.outcome]);
}
