import { describe, expect, it } from 'vitest';
import { nutritionSafeguards, nutritionSettingsSchema } from '@/domain';
import { acceptDate, ageOn, deriveTargets } from './context';

const settings = nutritionSettingsSchema.parse({
  goal: 'lose_gently',
  birthYear: 1990,
  heightCm: 170,
  sex: 'female',
});
const none = {
  isMinor: false,
  guardianConfirmed: false,
  pregnancyStatus: 'not_applicable' as const,
  eatingDisorderCaution: false,
  prescribedDiet: false,
};
const today = '2026-10-19';

describe('food dates', () => {
  it('accept today and the last 30 days, and nothing else', () => {
    expect(acceptDate(undefined, today)).toBe(today);
    expect(acceptDate('2026-10-18', today)).toBe('2026-10-18');
    expect(acceptDate('2026-09-19', today)).toBe('2026-09-19');
    expect(acceptDate('2026-09-18', today)).toBeNull();
    expect(acceptDate('2026-10-20', today)).toBeNull();
    expect(acceptDate('yesterday', today)).toBeNull();
  });

  it('take age from the birth year, or not at all', () => {
    expect(ageOn(1990, today)).toBe(36);
    expect(ageOn(null, today)).toBeNull();
  });
});

describe('targets on the Food screen', () => {
  it('are calculated, with a gentle deficit, when nothing applies', () => {
    const { targets, estimate } = deriveTargets({
      settings,
      override: null,
      safeguards: nutritionSafeguards(none),
      weightKg: 70,
      today,
    });
    expect(targets.source).toBe('calculated');
    expect(targets.kcal).not.toBeNull();
    expect(targets.kcal!.max).toBeLessThan(estimate.needsKcal!);
  });

  it('are not calculated at all for a minor, in pregnancy, or on a prescribed diet', () => {
    for (const change of [
      { isMinor: true },
      { pregnancyStatus: 'pregnant' as const },
      { pregnancyStatus: 'postpartum' as const },
      { prescribedDiet: true },
    ]) {
      const { targets, estimate } = deriveTargets({
        settings,
        override: null,
        safeguards: nutritionSafeguards({ ...none, ...change }),
        weightKg: 70,
        today,
      });
      expect(targets.source).toBe('none');
      expect(targets.kcal).toBeNull();
      expect(targets.proteinG).toBeNull();
      expect(estimate.needsKcal).toBeNull();
    }
  });

  it('drop the deficit when counting has not helped', () => {
    const gentle = deriveTargets({
      settings,
      override: null,
      safeguards: nutritionSafeguards(none),
      weightKg: 70,
      today,
    }).targets;
    const cautious = deriveTargets({
      settings,
      override: null,
      safeguards: nutritionSafeguards({ ...none, eatingDisorderCaution: true }),
      weightKg: 70,
      today,
    }).targets;
    expect(cautious.kcal!.min).toBeGreaterThan(gentle.kcal!.min);
    expect(cautious.working[0]).toMatch(/not set for you/);
  });

  it("use a clinician's numbers when given, even where nothing is calculated", () => {
    const { targets } = deriveTargets({
      settings,
      override: {
        kcal: 2400,
        proteinG: null,
        carbsG: null,
        fatG: null,
        fiberG: null,
        waterMl: null,
        fromClinician: true,
      },
      safeguards: nutritionSafeguards({ ...none, pregnancyStatus: 'pregnant' }),
      weightKg: 70,
      today,
    });
    expect(targets.source).toBe('clinician');
    expect(targets.kcal).toEqual({ min: 2280, max: 2520 });
  });
});
