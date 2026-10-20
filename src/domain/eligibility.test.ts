import { describe, expect, it } from 'vitest';
import {
  CONTRAST_NOTICE_VERSION,
  CONTRAST_SCREENING_QUESTIONS,
  type ContrastQuestionId,
} from './contrast';
import { eligibility, eligibilityOverview, type EligibilityInputs } from './eligibility';
import { persona } from './fixtures/personas';
import { onboardingProfileSchema } from './onboarding';
import { COLD_NOTICE_VERSION } from './reset-program';
import { STOP_GUIDANCE, STOP_PATHS, STOP_SITUATIONS } from './stop-guidance';

const TODAY = '2026-10-12';
const allNo = Object.fromEntries(CONTRAST_SCREENING_QUESTIONS.map((q) => [q.id, false])) as Record<
  ContrastQuestionId,
  boolean
>;

function inputs(overrides: Partial<EligibilityInputs> = {}): EligibilityInputs {
  return {
    today: TODAY,
    profile: onboardingProfileSchema.parse({}),
    painFlags: [],
    nutrition: null,
    contrastScreening: null,
    acknowledgements: { cold_exposure: null, contrast_therapy: null },
    ...overrides,
  };
}

const screenedAndAcknowledged = {
  contrastScreening: { answers: allNo, clinicianCleared: true },
  acknowledgements: {
    cold_exposure: COLD_NOTICE_VERSION,
    contrast_therapy: CONTRAST_NOTICE_VERSION,
  },
} as const;

describe('central eligibility', () => {
  it('offers contrast and cold once the steps are done, and nothing is blocked by silence', () => {
    const decided = eligibility(inputs(screenedAndAcknowledged));
    expect(decided.contrast).toEqual({ kind: 'ok' });
    expect(decided.cold).toEqual({ kind: 'ok' });
    expect(decided.contrastOffered).toBe(true);

    const fresh = eligibility(inputs());
    expect(fresh.cold).toEqual({ kind: 'needs_acknowledgement' });
    expect(fresh.contrast.kind).toBe('refused');
    expect(fresh.contrastOffered).toBe(true);
  });

  it('lets an onboarding answer that blocks heat and cold win over a clean screening', () => {
    // The contradiction this module exists to remove: a pregnant person who
    // ticked "no" everywhere on the screening and claimed clearance.
    for (const id of ['pregnant', 'cardiac-history'] as const) {
      const decided = eligibility(
        inputs({ profile: persona(id).profile, ...screenedAndAcknowledged }),
      );
      expect(decided.contrast.kind, id).toBe('refused');
      expect(decided.contrastOffered, id).toBe(false);
      expect(decided.cold.kind, id).toBe('unavailable');
    }
  });

  it('refuses contrast to a minor even with every step done', () => {
    const decided = eligibility(
      inputs({ profile: persona('minor').profile, ...screenedAndAcknowledged }),
    );
    expect(decided.minor).toBe(true);
    expect(decided.contrast).toMatchObject({ kind: 'refused' });
    expect(decided.nutrition.calculateEnergy).toBe(false);
  });

  it('treats a nutrition birth year under 18 as a minor, whatever onboarding said', () => {
    const decided = eligibility(
      inputs({
        nutrition: { birthYear: 2012, eatingDisorderCaution: false, prescribedDiet: false },
      }),
    );
    expect(decided.minor).toBe(true);
    expect(decided.nutrition.deficitAllowed).toBe(false);
  });

  it('needs the current cold notice, not any old acknowledgement', () => {
    const decided = eligibility(
      inputs({ acknowledgements: { cold_exposure: '2000-01-01', contrast_therapy: null } }),
    );
    expect(decided.cold).toEqual({ kind: 'needs_acknowledgement' });
  });

  it('merges onboarding injuries with Train pain flags into one list', () => {
    const decided = eligibility(inputs({ painFlags: [{ region: 'knees', severity: 'moderate' }] }));
    expect(decided.flags).toEqual([{ region: 'knees', severity: 'moderate' }]);
    expect(decided.recoveryFlag).toBe(true);
    expect(
      eligibility(inputs({ painFlags: [{ region: 'knees', severity: 'mild' }] })).recoveryFlag,
    ).toBe(false);
  });

  it('turns on numbers-in-the-background when eating has been hard', () => {
    const decided = eligibility(
      inputs({
        nutrition: { birthYear: null, eatingDisorderCaution: true, prescribedDiet: false },
      }),
    );
    expect(decided.nutrition.hideNumbersByDefault).toBe(true);
    expect(decided.nutrition.deficitAllowed).toBe(false);
  });

  it('describes every gated module in the overview, with a reason for each', () => {
    const lines = eligibilityOverview(
      eligibility(inputs({ profile: persona('pregnant').profile })),
    );
    expect(lines.map((line) => line.module)).toEqual([
      'high_intensity',
      'loaded_mobility',
      'cold_exposure',
      'contrast_therapy',
      'calorie_targets',
    ]);
    expect(lines.every((line) => line.detail.length > 10)).toBe(true);
    expect(lines.find((line) => line.module === 'contrast_therapy')?.status).toBe('not_offered');
    expect(lines.find((line) => line.module === 'cold_exposure')?.status).toBe('not_offered');
    expect(lines.find((line) => line.module === 'calorie_targets')?.status).toBe('not_offered');
  });
});

describe('stop guidance', () => {
  it('has words for every situation', () => {
    for (const situation of STOP_SITUATIONS) {
      expect(STOP_GUIDANCE[situation].body.length).toBeGreaterThan(40);
    }
  });

  it('covers every concern the build rules name, somewhere', () => {
    const covered = new Set(Object.values(STOP_PATHS).flat());
    for (const required of [
      'pain',
      'dizzy',
      'distress',
      'overheating',
      'too_cold',
      'food_distress',
    ])
      expect(covered.has(required as never), required).toBe(true);
  });

  it('gives physical-effort modules a pain or dizziness exit, and reflective ones a distress exit', () => {
    expect(STOP_PATHS.workout).toEqual(expect.arrayContaining(['pain', 'dizzy', 'chest']));
    expect(STOP_PATHS.breathwork).toEqual(expect.arrayContaining(['dizzy']));
    expect(STOP_PATHS.journal).toEqual(['distress']);
    expect(STOP_PATHS.contrast).toEqual(expect.arrayContaining(['overheating', 'too_cold']));
  });

  it('sends chest pain to emergency help, not to a later appointment', () => {
    expect(STOP_GUIDANCE.chest.body).toMatch(/emergency/);
  });
});
