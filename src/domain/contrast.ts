import { z } from 'zod';

/**
 * Contrast therapy: alternating heat and cold, as an optional advanced pack.
 *
 * The source (SOURCE_MAP §4) gives 70–82 °C heat and 10–15 °C cold with no
 * screening at all. ARETE keeps it strictly opt-in: a screening first, a
 * safety notice acknowledged by version, defaults well below the source's
 * numbers, a stop control on screen the whole time, and nothing about it
 * ever counts towards a streak or a programme day. The source's reasons
 * ("heat-shock proteins", "growth hormone") are reported as commonly cited
 * rationale, never as effects ARETE promises.
 */

export const CONTRAST_NOTICE_VERSION = '2026-10-19';

export const CONTRAST_SCREENING_QUESTIONS = [
  {
    id: 'heart',
    text: 'A heart condition, an irregular heartbeat, or chest pain with exertion',
  },
  { id: 'bloodPressure', text: 'High or low blood pressure, or medicine for it' },
  { id: 'pregnancy', text: 'Pregnant, or recently given birth' },
  { id: 'fainting', text: 'Fainting or dizziness when standing, in heat or in cold' },
  {
    id: 'neuropathy',
    text: 'Numbness, neuropathy or Raynaud’s — reduced feeling in hands or feet',
  },
  {
    id: 'medication',
    text: 'Medicines that affect heart rate, blood pressure, sweating or temperature',
  },
  { id: 'temperature', text: 'Unusual sensitivity to heat or cold' },
  { id: 'other', text: 'Anything else a doctor has told you makes heat or cold risky' },
] as const;
export type ContrastQuestionId = (typeof CONTRAST_SCREENING_QUESTIONS)[number]['id'];

export const contrastScreeningSchema = z.object({
  answers: z.record(
    z.enum(
      CONTRAST_SCREENING_QUESTIONS.map((question) => question.id) as [
        ContrastQuestionId,
        ...ContrastQuestionId[],
      ],
    ),
    z.boolean(),
  ),
  /** The person says a clinician has cleared them, knowing what they answered. */
  clinicianCleared: z.boolean().default(false),
});
export type ContrastScreening = z.infer<typeof contrastScreeningSchema>;

export type ContrastEligibility =
  | { readonly kind: 'ok' }
  | { readonly kind: 'needs_clearance'; readonly flagged: readonly ContrastQuestionId[] }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * Whether a session may start. A minor is refused outright; any flagged
 * answer needs the person to say a clinician has cleared them; nothing is
 * inferred from silence.
 */
export function contrastEligibility(input: {
  readonly screening: ContrastScreening | null;
  readonly isMinor: boolean;
  readonly acknowledgedVersion: string | null;
}): ContrastEligibility {
  if (input.isMinor) {
    return { kind: 'refused', reason: 'Contrast therapy is not offered to anyone under 18.' };
  }
  if (!input.screening) return { kind: 'refused', reason: 'Answer the screening questions first.' };
  if (input.acknowledgedVersion !== CONTRAST_NOTICE_VERSION) {
    return { kind: 'refused', reason: 'Read and acknowledge the safety notice first.' };
  }
  const flagged = CONTRAST_SCREENING_QUESTIONS.map((question) => question.id).filter(
    (id) => input.screening!.answers[id] !== false,
  );
  if (flagged.length > 0 && !input.screening.clinicianCleared)
    return { kind: 'needs_clearance', flagged };
  return { kind: 'ok' };
}

/** Onboarding answers that pre-tick screening questions. The person still answers every one. */
export function screeningHints(health: {
  readonly pregnancyStatus: string;
  readonly cardiovascularOrFaintingHistory: boolean;
  readonly heatSensitivity: boolean;
  readonly coldSensitivity: boolean;
}): Partial<Record<ContrastQuestionId, boolean>> {
  return {
    ...(health.pregnancyStatus === 'pregnant' || health.pregnancyStatus === 'postpartum'
      ? { pregnancy: true }
      : {}),
    ...(health.cardiovascularOrFaintingHistory ? { heart: true, fainting: true } : {}),
    ...(health.heatSensitivity || health.coldSensitivity ? { temperature: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Protocols
// ---------------------------------------------------------------------------

export const contrastProtocolSchema = z.object({
  heatSeconds: z.int().min(60).max(600),
  coldSeconds: z.int().min(10).max(120),
  cycles: z.int().min(1).max(4),
  finishOn: z.enum(['heat', 'cold']),
});
export type ContrastProtocol = z.infer<typeof contrastProtocolSchema>;

/** ARETE's default: shorter and milder than either source protocol. */
export const GENTLE_PROTOCOL: ContrastProtocol = {
  heatSeconds: 180,
  coldSeconds: 30,
  cycles: 2,
  finishOn: 'heat',
};

/** The source's two protocols, shown for reference with their own numbers and words. */
export const SOURCE_PROTOCOLS = [
  {
    name: 'Source: "muscle strength / growth"',
    heat: '70–82 °C sauna, 5 min',
    cold: '13 °C, 1 min',
    cycles: '3–4, finishing with 5–10 min heat',
    rationale:
      'Commonly cited rationale: heat-shock proteins and growth hormone. Not established as effects in people doing this; ARETE does not promise them.',
  },
  {
    name: 'Source: "athletic performance / recovery"',
    heat: '40–43 °C, 3 min',
    cold: '10–15 °C, 1 min',
    cycles: '4, finishing with 2–3 min cold',
    rationale:
      'Commonly cited rationale: less soreness and inflammation. The evidence is mixed and mostly short-term.',
  },
] as const;

export const CONTRAST_TEMPERATURE_GUIDANCE =
  'Heat: a sauna you find comfortable, or a warm-to-hot shower or bath. Cold: a cool shower (around 15–20 °C) is enough; colder water adds risk, not certainty of benefit. Never use cold water alone, never after alcohol, and leave the heat at the first sign of dizziness.';

export interface ContrastPhase {
  readonly kind: 'heat' | 'cold';
  readonly seconds: number;
  readonly cycle: number;
}

/** The ordered phases of a session. Cycles alternate heat then cold; the finish decides the last. */
export function contrastPhases(protocol: ContrastProtocol): ContrastPhase[] {
  const phases: ContrastPhase[] = [];
  for (let cycle = 1; cycle <= protocol.cycles; cycle += 1) {
    phases.push({ kind: 'heat', seconds: protocol.heatSeconds, cycle });
    const last = cycle === protocol.cycles;
    if (!last || protocol.finishOn === 'cold') {
      phases.push({ kind: 'cold', seconds: protocol.coldSeconds, cycle });
    }
  }
  return phases;
}

export function contrastTotalSeconds(protocol: ContrastProtocol): number {
  return contrastPhases(protocol).reduce((sum, phase) => sum + phase.seconds, 0);
}

export const CONTRAST_STOP_REASONS = ['dizzy', 'unwell', 'too_cold', 'too_hot', 'other'] as const;
export type ContrastStopReason = (typeof CONTRAST_STOP_REASONS)[number];

export const CONTRAST_STOP_LABEL: Record<ContrastStopReason, string> = {
  dizzy: 'Dizzy or light-headed',
  unwell: 'Felt unwell',
  too_cold: 'Too cold',
  too_hot: 'Too hot',
  other: 'Something else',
};

/** What the screen says after a stop. Dizziness and feeling unwell get the plain medical line. */
export function afterStop(reason: ContrastStopReason | null): string {
  if (reason === 'dizzy' || reason === 'unwell') {
    return 'Sit or lie down somewhere warm and safe, sip water, and do not drive. If you have chest pain, trouble breathing, or you do not feel better soon, get medical help now.';
  }
  return 'Stopping early is the right call whenever something feels off. Warm up gradually.';
}

export interface ContrastSessionRecord {
  readonly id: string;
  readonly localDate: string;
  readonly protocol: ContrastProtocol;
  readonly phasesCompleted: number;
  readonly status: 'completed' | 'stopped';
  readonly stopReason: ContrastStopReason | null;
  readonly startedAt: string;
  readonly endedAt: string;
}
