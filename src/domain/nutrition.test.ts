import { describe, expect, it } from 'vitest';
import { NO_SUPPLEMENTS, OIL_CARDS, RESTAURANT_QUESTIONS } from '@/content/nutrition/oil-awareness';
import {
  ENERGY_FLOOR_KCAL,
  calculateTargets,
  dayTotals,
  deficitWarnings,
  foodInputSchema,
  nutritionSafeguards,
  nutritionSettingsSchema,
  oilAwarenessSchema,
  oilMatches,
  quickAddSchema,
  rangeStatus,
  recipePerServing,
  restingEnergy,
  rollingAverage,
  scaleNutrients,
  sumNutrients,
  targetOverrideSchema,
  targetsFromOverride,
  weightTrend,
  type Nutrients,
  type SafeguardInputs,
} from './nutrition';
import {
  feetInchesToCentimetres,
  formatFoodMass,
  formatHeight,
  formatVolume,
  gramsToOunces,
  ouncesToGrams,
  volumeToStorage,
} from './units';

const n = (
  kcal: number | null,
  proteinG: number | null = null,
  carbsG: number | null = null,
  fatG: number | null = null,
  fiberG: number | null = null,
): Nutrients => ({
  kcal,
  proteinG,
  carbsG,
  fatG,
  fiberG,
});

describe('totals', () => {
  it('reconcile: the day total is exactly the sum of its entries', () => {
    const entries = [
      { nutrients: n(320, 12, 50, 8, 6) },
      { nutrients: n(150.4, 20.2, 2, 6.1, 0) },
      { nutrients: n(89.9, 1.1, 22.8, 0.3, 2.6) },
    ];
    const totals = dayTotals(entries);
    expect(totals.nutrients).toEqual(n(560.3, 33.3, 74.8, 14.4, 8.6));
    expect(totals.entries).toBe(3);
  });

  it('treats unknown as unknown, not zero, and counts entries with no numbers without nagging', () => {
    const totals = dayTotals([{ nutrients: n(200) }, { nutrients: n(null) }]);
    expect(totals.nutrients.kcal).toBe(200);
    expect(totals.nutrients.proteinG).toBeNull();
    expect(totals.withoutNumbers).toBe(1);
  });

  it('recalculates when an entry is edited or removed', () => {
    const entries = [{ nutrients: scaleNutrients(n(100, 10), 2) }, { nutrients: n(50, 5) }];
    expect(dayTotals(entries).nutrients.kcal).toBe(250);
    entries[0] = { nutrients: scaleNutrients(n(100, 10), 1.5) };
    expect(dayTotals(entries).nutrients).toMatchObject({ kcal: 200, proteinG: 20 });
    expect(dayTotals(entries.slice(1)).nutrients).toMatchObject({ kcal: 50, proteinG: 5 });
  });

  it('adds water separately', () => {
    expect(dayTotals([], [250, 500]).waterMl).toBe(750);
  });

  it('sums nothing to nothing', () => {
    expect(sumNutrients([])).toEqual(n(null));
  });
});

describe('recipes', () => {
  it('divides the ingredients by the servings made', () => {
    const oats = { nutrients: n(150, 5, 27, 3, 4) };
    const milk = { nutrients: n(120, 8, 12, 5, 0) };
    const { nutrients, incomplete } = recipePerServing(
      [
        { food: oats, servings: 2 },
        { food: milk, servings: 1 },
      ],
      2,
    );
    expect(nutrients).toEqual(n(210, 9, 33, 5.5, 4));
    expect(incomplete).toBe(0);
  });

  it('says how many ingredients had missing numbers', () => {
    const { incomplete } = recipePerServing([{ food: { nutrients: n(100) }, servings: 1 }], 1);
    expect(incomplete).toBe(1);
  });

  it('needs ingredients and a serving count to be a recipe', () => {
    expect(foodInputSchema.safeParse({ name: 'Stew', source: 'recipe' }).success).toBe(false);
    expect(
      foodInputSchema.safeParse({
        name: 'Stew',
        source: 'recipe',
        ingredients: [{ foodId: 'f1', servings: 2 }],
        servingsMade: 4,
      }).success,
    ).toBe(true);
  });
});

describe('targets', () => {
  const base = {
    sex: 'female' as const,
    ageYears: 35,
    heightCm: 165,
    weightKg: 62,
    activity: 'light' as const,
    goal: 'maintain' as const,
  };

  it('uses Mifflin–St Jeor, and the midpoint when sex is not given', () => {
    expect(restingEnergy('female', 62, 165, 35)).toBeCloseTo(10 * 62 + 6.25 * 165 - 5 * 35 - 161);
    expect(restingEnergy('male', 62, 165, 35)).toBeCloseTo(10 * 62 + 6.25 * 165 - 5 * 35 + 5);
    expect(restingEnergy('unspecified', 62, 165, 35)).toBeCloseTo(
      10 * 62 + 6.25 * 165 - 5 * 35 - 78,
    );
  });

  it('returns ranges and shows every step of the working', () => {
    const targets = calculateTargets(base);
    const needs = restingEnergy('female', 62, 165, 35) * 1.375;
    expect(targets.kcal!.min).toBeLessThan(needs);
    expect(targets.kcal!.max).toBeGreaterThan(needs);
    expect(targets.proteinG).toEqual({ min: 75, max: 100 });
    expect(targets.waterMl).toEqual({ min: 1850, max: 2150 });
    expect(targets.fiberG!.min).toBeGreaterThan(20);
    expect(targets.working.join(' ')).toMatch(/Mifflin–St Jeor/);
    expect(targets.working.join(' ')).toMatch(/A range, not a budget/);
    expect(targets.source).toBe('calculated');
  });

  it('keeps a gentle loss gentle: at most 10%, at most 500 kcal, never below resting energy or 1200', () => {
    const maintain = calculateTargets(base);
    const lose = calculateTargets({ ...base, goal: 'lose_gently' });
    const maintainCentre = (maintain.kcal!.min + maintain.kcal!.max) / 2;
    const loseCentre = (lose.kcal!.min + lose.kcal!.max) / 2;
    expect(maintainCentre - loseCentre).toBeLessThanOrEqual(500 + 20);
    expect(loseCentre / maintainCentre).toBeGreaterThan(0.88);

    const small = calculateTargets({
      sex: 'female',
      ageYears: 70,
      heightCm: 150,
      weightKg: 45,
      activity: 'sedentary',
      goal: 'lose_gently',
    });
    const rest = restingEnergy('female', 45, 150, 70);
    expect((small.kcal!.min + small.kcal!.max) / 2).toBeGreaterThanOrEqual(
      Math.max(rest, ENERGY_FLOOR_KCAL) - 10,
    );
    expect(small.working.join(' ')).toMatch(/stops at/);
  });

  it('turns a loss into maintenance when a deficit is not allowed', () => {
    const lose = calculateTargets({ ...base, goal: 'lose_gently' }, { deficitAllowed: false });
    expect(lose).toMatchObject({ kcal: calculateTargets(base).kcal });
    expect(lose.working[0]).toMatch(/not set for you/);
  });

  it('guesses nothing: no weight means no energy, protein or water target', () => {
    const targets = calculateTargets({ ...base, weightKg: null });
    expect(targets.kcal).toBeNull();
    expect(targets.proteinG).toBeNull();
    expect(targets.waterMl).toBeNull();
    expect(targets.working.join(' ')).toMatch(/nothing is guessed/);
  });

  it('has no energy target when the goal is awareness only', () => {
    expect(calculateTargets({ ...base, goal: 'none' }).kcal).toBeNull();
  });

  it('describes where a day landed in neutral words', () => {
    expect(rangeStatus(90, { min: 100, max: 120 })).toBe('under');
    expect(rangeStatus(110, { min: 100, max: 120 })).toBe('in_range');
    expect(rangeStatus(130, { min: 100, max: 120 })).toBe('over');
    expect(rangeStatus(40, { min: 25, max: 37 }, 'floor')).toBe('in_range');
  });

  it('warns about an aggressive self-set target without forbidding it', () => {
    expect(deficitWarnings(1100, { restingKcal: 1300, needsKcal: 1900 })).toHaveLength(3);
    expect(deficitWarnings(1800, { restingKcal: 1300, needsKcal: 1900 })).toEqual([]);
  });

  it('accepts an override, marks a clinician’s, and needs at least one number', () => {
    expect(targetOverrideSchema.safeParse({}).success).toBe(false);
    const override = targetOverrideSchema.parse({ kcal: 2000, fromClinician: true });
    const targets = targetsFromOverride(override);
    expect(targets.source).toBe('clinician');
    expect(targets.kcal).toEqual({ min: 1900, max: 2100 });
  });
});

describe('safeguards', () => {
  const none: SafeguardInputs = {
    isMinor: false,
    guardianConfirmed: false,
    pregnancyStatus: 'not_applicable',
    eatingDisorderCaution: false,
    prescribedDiet: false,
  };

  it('changes nothing when none apply', () => {
    expect(nutritionSafeguards(none)).toMatchObject({
      calculateEnergy: true,
      deficitAllowed: true,
      hideNumbersByDefault: false,
      messages: [],
    });
  });

  it('calculates no energy target for a minor without a guardian’s agreement', () => {
    const result = nutritionSafeguards({ ...none, isMinor: true });
    expect(result.calculateEnergy).toBe(false);
    expect(result.weightTrendOffered).toBe(false);
    expect(
      nutritionSafeguards({ ...none, isMinor: true, guardianConfirmed: true }).calculateEnergy,
    ).toBe(true);
  });

  it('calculates no energy target and no deficit in pregnancy or after birth', () => {
    for (const pregnancyStatus of ['pregnant', 'postpartum'] as const) {
      const result = nutritionSafeguards({ ...none, pregnancyStatus });
      expect(result.calculateEnergy).toBe(false);
      expect(result.deficitAllowed).toBe(false);
      expect(result.messages[0]?.body).toMatch(/midwife, doctor or dietitian/);
    }
  });

  it('hides numbers, drops the weight trend and any deficit when counting has not helped', () => {
    const result = nutritionSafeguards({ ...none, eatingDisorderCaution: true });
    expect(result).toMatchObject({
      hideNumbersByDefault: true,
      weightTrendOffered: false,
      deficitAllowed: false,
    });
    expect(result.messages[0]?.body).toMatch(/National Alliance for Eating Disorders/);
    expect(result.messages[0]?.body).not.toMatch(/NEDA/);
  });

  it('defers to a prescribed diet', () => {
    const result = nutritionSafeguards({ ...none, prescribedDiet: true });
    expect(result.calculateEnergy).toBe(false);
    expect(result.messages[0]?.title).toMatch(/clinician/);
  });

  it('only ever removes or softens', () => {
    const all = nutritionSafeguards({
      isMinor: true,
      guardianConfirmed: false,
      pregnancyStatus: 'pregnant',
      eatingDisorderCaution: true,
      prescribedDiet: true,
    });
    expect(all).toMatchObject({
      calculateEnergy: false,
      deficitAllowed: false,
      hideNumbersByDefault: true,
      weightTrendOffered: false,
    });
    expect(all.messages).toHaveLength(4);
  });
});

describe('weight trend', () => {
  const points = Array.from({ length: 21 }, (_, index) => ({
    localDate: `2026-03-${String(index + 1).padStart(2, '0')}`,
    weightKg: 80 - index * 0.05 + (index % 2 === 0 ? 0.4 : -0.4),
  }));

  it('smooths daily noise with a 7-day rolling average', () => {
    const averages = rollingAverage(points);
    expect(averages).toHaveLength(21);
    const dailySwing = Math.abs(points[10]!.weightKg - points[11]!.weightKg);
    const averageSwing = Math.abs(averages[10]!.averageKg - averages[11]!.averageKg);
    expect(averageSwing).toBeLessThan(dailySwing / 4);
  });

  it('reports the trend per week in plain words, and nothing for under a week', () => {
    const trend = weightTrend(points)!;
    expect(trend.perWeekKg).toBeLessThan(0);
    expect(trend.words).toMatch(/^(down about|about level)/);
    expect(weightTrend(points.slice(0, 3))).toBeNull();
  });
});

describe('units', () => {
  it('converts food mass, water and height both ways', () => {
    expect(gramsToOunces(ouncesToGrams(3.5))).toBeCloseTo(3.5, 10);
    expect(formatFoodMass(100, 'us').text).toBe('3.5 oz');
    expect(formatFoodMass(100, 'metric').text).toBe('100 g');
    expect(formatVolume(250, 'us').text).toBe('8.5 fl oz');
    expect(volumeToStorage(8, 'us')).toBeCloseTo(236.6, 1);
    expect(volumeToStorage(250, 'metric')).toBe(250);
    expect(formatHeight(178, 'us').text).toBe('5 ft 10 in');
    expect(feetInchesToCentimetres(5, 10)).toBeCloseTo(177.8, 1);
  });
});

describe('settings and inputs', () => {
  it('defaults to awareness: no energy goal, numbers shown, no weight trend', () => {
    expect(nutritionSettingsSchema.parse({})).toMatchObject({
      goal: 'none',
      weightTrendEnabled: false,
      hideCalorieNumbers: false,
    });
  });

  it('lets a quick add have a description and no numbers at all', () => {
    expect(quickAddSchema.parse({ description: 'Dinner at my sister’s' }).nutrients).toEqual(
      n(null),
    );
    expect(quickAddSchema.safeParse({ description: '  ' }).success).toBe(false);
  });
});

describe('oil awareness', () => {
  it('is empty until the person fills it in', () => {
    expect(oilAwarenessSchema.parse({})).toEqual({ cookingOils: [], list: [], labelNotes: {} });
  });

  it('matches label text against the person’s own list, case-insensitively', () => {
    const list = [
      { ingredient: 'canola', stance: 'limit' as const },
      { ingredient: 'olive oil', stance: 'prefer' as const },
    ];
    expect(oilMatches('Ingredients: oats, CANOLA oil, salt', list)).toEqual([list[0]]);
    expect(oilMatches('water, salt', list)).toEqual([]);
  });

  it('presents the source as one viewpoint, beside the evidence and mainstream advice, with no supplement advice', () => {
    for (const card of OIL_CARDS) {
      expect(card.claim).toMatch(/guide/);
      expect(card.evidence.length).toBeGreaterThan(10);
      expect(card.mainstream.length).toBeGreaterThan(5);
    }
    const text = JSON.stringify(OIL_CARDS) + RESTAURANT_QUESTIONS.join(' ');
    expect(text).not.toMatch(/prevents?\b|cures?\b|vitamin e|\bnac\b|take (a|an) /i);
    expect(NO_SUPPLEMENTS).toMatch(/does not recommend/);
  });
});
