import { COLD_NOTICE_VERSION } from './reset-program';
import { contrastEligibility, type ContrastEligibility, type ContrastScreening } from './contrast';
import {
  flexEligibility,
  type FlexEligibility,
  type FlexMovement,
  type FlexProgram,
} from './flexibility';
import { nutritionSafeguards, type Safeguards } from './nutrition';
import type { Injury, OnboardingProfile } from './onboarding';
import {
  decisionFor,
  evaluateSafety,
  isMinor,
  type SafetyDecision,
  type SafetyReport,
} from './safety';
import type { IsoDate } from './types';

/**
 * One place that decides what each module may offer this person.
 *
 * Before this existed, every screen assembled its own answer: Reset merged
 * injury flags one way, Flexibility another; contrast therapy checked its
 * screening but not the onboarding answers that rule heat and cold out; the
 * cold finish on the Reset checked an acknowledgement but not whether cold
 * was blocked at all. Each check was right on its own and together they
 * could contradict each other. Now the server contexts call `eligibility`
 * and the components only display what it decided.
 *
 * Two rules hold everywhere:
 *
 *   * The strictest source wins. An onboarding answer that blocks heat and
 *     cold is not undone by a later screening answer or a clearance tick;
 *     the person changes the onboarding answer itself, knowingly.
 *   * Nothing is inferred from silence, and nothing here diagnoses.
 */
export interface EligibilityInputs {
  readonly today: IsoDate;
  readonly profile: OnboardingProfile;
  /** Train's own pain flags, which sit beside the onboarding injuries. */
  readonly painFlags: readonly Injury[];
  readonly nutrition: {
    readonly birthYear: number | null;
    readonly eatingDisorderCaution: boolean;
    readonly prescribedDiet: boolean;
  } | null;
  readonly contrastScreening: ContrastScreening | null;
  readonly acknowledgements: {
    readonly cold_exposure: string | null;
    readonly contrast_therapy: string | null;
  };
}

export type ColdEligibility =
  | { readonly kind: 'ok' }
  | { readonly kind: 'needs_acknowledgement' }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface Eligibility {
  readonly report: SafetyReport;
  readonly minor: boolean;
  /** Onboarding injuries and Train's pain flags together, one list. */
  readonly flags: readonly Injury[];
  /** A moderate or severe flag anywhere: the Reset keeps movement easy. */
  readonly recoveryFlag: boolean;
  readonly cold: ColdEligibility;
  readonly contrast: ContrastEligibility;
  /** False when age or a health answer rules contrast out, not just a missing step. */
  readonly contrastOffered: boolean;
  readonly nutrition: Safeguards;
}

function closed(decision: SafetyDecision): boolean {
  return decision.outcome === 'blocked' || decision.outcome === 'rerouted';
}

function because(decision: SafetyDecision): string {
  return decision.alternative ? `${decision.reason} ${decision.alternative}` : decision.reason;
}

export function eligibility(input: EligibilityInputs): Eligibility {
  const report = evaluateSafety(input.profile, input.today);
  // Either birth year saying "under 18" is enough: the conservative reading.
  const minor =
    report.isMinor ||
    (input.nutrition?.birthYear !== null &&
      input.nutrition?.birthYear !== undefined &&
      isMinor(input.nutrition.birthYear, input.today));
  const flags = [...input.profile.health.injuries, ...input.painFlags];

  const coldDecision = decisionFor(report, 'cold_exposure');
  const cold: ColdEligibility = closed(coldDecision)
    ? { kind: 'unavailable', reason: because(coldDecision) }
    : input.acknowledgements.cold_exposure === COLD_NOTICE_VERSION
      ? { kind: 'ok' }
      : { kind: 'needs_acknowledgement' };

  const contrastDecision = decisionFor(report, 'contrast_therapy');
  const contrastOffered = !minor && !closed(contrastDecision);
  const contrast: ContrastEligibility = minor
    ? { kind: 'refused', reason: 'Contrast therapy is not offered to anyone under 18.' }
    : closed(contrastDecision)
      ? { kind: 'refused', reason: because(contrastDecision) }
      : contrastEligibility({
          screening: input.contrastScreening,
          isMinor: false,
          acknowledgedVersion: input.acknowledgements.contrast_therapy,
        });

  const nutrition = nutritionSafeguards({
    isMinor: minor,
    guardianConfirmed: input.profile.age.guardianConfirmed,
    pregnancyStatus: input.profile.health.pregnancyStatus,
    eatingDisorderCaution: input.nutrition?.eatingDisorderCaution ?? false,
    prescribedDiet: input.nutrition?.prescribedDiet ?? false,
  });

  return {
    report,
    minor,
    flags,
    recoveryFlag: flags.some((flag) => flag.severity !== 'mild'),
    cold,
    contrast,
    contrastOffered,
    nutrition,
  };
}

/** The flexibility programme's decision, from the same merged flags. */
export function flexEligibilityFor(
  decided: Eligibility,
  program: FlexProgram,
  movements: readonly FlexMovement[],
): FlexEligibility {
  return flexEligibility(program, decided.flags, movements);
}

// ---------------------------------------------------------------------------
// The overview a person can read in Settings
// ---------------------------------------------------------------------------

export type ModuleStatus = 'available' | 'adjusted' | 'needs_a_step' | 'not_offered';

export interface ModuleLine {
  readonly module: string;
  readonly label: string;
  readonly status: ModuleStatus;
  readonly detail: string;
}

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  available: 'Available',
  adjusted: 'Adjusted for you',
  needs_a_step: 'One step first',
  not_offered: 'Not offered',
};

/** Every gated module, in plain words, from the one decision above. */
export function eligibilityOverview(decided: Eligibility): readonly ModuleLine[] {
  const line = (decision: SafetyDecision, label: string): ModuleLine => ({
    module: decision.module,
    label,
    status:
      decision.outcome === 'allowed'
        ? 'available'
        : decision.outcome === 'requires_acknowledgement'
          ? 'needs_a_step'
          : decision.outcome === 'rerouted'
            ? 'adjusted'
            : 'not_offered',
    detail: because(decision),
  });
  const report = decided.report;
  const lines: ModuleLine[] = [
    line(decisionFor(report, 'high_intensity'), 'Hard training sessions'),
    line(decisionFor(report, 'loaded_mobility'), 'Loaded stretching and mobility'),
  ];

  lines.push({
    module: 'cold_exposure',
    label: 'Cool finish to a shower (60-Day Reset)',
    status:
      decided.cold.kind === 'ok'
        ? 'available'
        : decided.cold.kind === 'needs_acknowledgement'
          ? 'needs_a_step'
          : 'not_offered',
    detail:
      decided.cold.kind === 'unavailable'
        ? decided.cold.reason
        : decided.cold.kind === 'needs_acknowledgement'
          ? 'Off unless you choose it, after reading a short cold-water note.'
          : 'You have read the cold-water note. It stays off unless you turn it on.',
  });

  lines.push({
    module: 'contrast_therapy',
    label: 'Contrast therapy',
    status:
      decided.contrast.kind === 'ok'
        ? 'available'
        : decided.contrastOffered
          ? 'needs_a_step'
          : 'not_offered',
    detail:
      decided.contrast.kind === 'ok'
        ? 'Screened and acknowledged. Every session still has a stop control on screen.'
        : decided.contrast.kind === 'needs_clearance'
          ? 'Some screening answers need a clinician’s clearance first.'
          : decided.contrast.reason,
  });

  const food = decided.nutrition;
  lines.push({
    module: 'calorie_targets',
    label: 'Calorie targets',
    status: !food.calculateEnergy
      ? 'not_offered'
      : food.hideNumbersByDefault
        ? 'adjusted'
        : 'available',
    detail:
      food.messages.map((message) => message.body).join(' ') ||
      'Calculated from what you entered, and only if you ask for them.',
  });
  return lines;
}
