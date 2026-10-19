import { z } from 'zod';
import { addDays, daysBetween } from './local-day';

/**
 * Nutrition: awareness, not doctrine.
 *
 * Everything here is arithmetic that can be shown to the person: the target
 * calculation returns its own working, totals are plain sums of what was
 * logged, and the weight trend is a rolling average. Nothing invents a
 * nutrition value — a food has the numbers someone typed in, from a label or
 * their own estimate, labelled as such, or it has none.
 *
 * Targets are ranges, never budgets. The words for where a day landed are
 * "under", "in range" and "over" — there is no red, no "you failed", and no
 * total score. A day with no numbers at all is a day that was logged.
 */

// ---------------------------------------------------------------------------
// Nutrients
// ---------------------------------------------------------------------------

export const NUTRIENTS = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export type Nutrients = { readonly [K in Nutrient]: number | null };

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  fiberG: null,
};

const nutrient = z.number().min(0).max(20_000).nullable().default(null);

export const nutrientsSchema = z.object({
  kcal: nutrient,
  proteinG: nutrient,
  carbsG: nutrient,
  fatG: nutrient,
  fiberG: nutrient,
});

export const NUTRIENT_LABEL: Record<Nutrient, string> = {
  kcal: 'Energy',
  proteinG: 'Protein',
  carbsG: 'Carbohydrate',
  fatG: 'Fat',
  fiberG: 'Fibre',
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function scaleNutrients(perServing: Nutrients, servings: number): Nutrients {
  const out = {} as Record<Nutrient, number | null>;
  for (const key of NUTRIENTS) {
    const value = perServing[key];
    out[key] = value === null ? null : round1(value * servings);
  }
  return out;
}

/** Sum of whatever is known. A null stays null only if every value was null. */
export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const out = {} as Record<Nutrient, number | null>;
  for (const key of NUTRIENTS) {
    const known = items.map((item) => item[key]).filter((value): value is number => value !== null);
    out[key] = known.length === 0 ? null : round1(known.reduce((sum, value) => sum + value, 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Foods, recipes and their sources
// ---------------------------------------------------------------------------

/**
 * Where a food's numbers came from. Shown next to every food, everywhere.
 * `synthetic-demo` exists so the demo account has something to show without
 * pretending made-up numbers are real.
 */
export const FOOD_SOURCES = ['label', 'estimate', 'recipe', 'synthetic-demo'] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

export const FOOD_SOURCE_LABEL: Record<FoodSource, string> = {
  label: 'From the packet label',
  estimate: 'Your estimate',
  recipe: 'Calculated from your recipe',
  'synthetic-demo': 'Synthetic demo values — not real nutrition data',
};

export const recipeIngredientSchema = z.object({
  foodId: z.string().min(1),
  servings: z.number().positive().max(100),
});

export const foodInputSchema = z
  .object({
    name: z.string().trim().min(1, 'A food needs a name.').max(80),
    brand: z.string().trim().max(60).nullable().default(null),
    servingLabel: z.string().trim().min(1).max(40).default('1 serving'),
    servingGrams: z.number().positive().max(5000).nullable().default(null),
    nutrients: nutrientsSchema.prefault({}),
    source: z.enum(FOOD_SOURCES).default('estimate'),
    ingredients: z.array(recipeIngredientSchema).max(40).default([]),
    servingsMade: z.number().positive().max(100).nullable().default(null),
  })
  .refine(
    (food) =>
      food.source !== 'recipe' || (food.ingredients.length > 0 && food.servingsMade !== null),
    {
      message: 'A recipe needs ingredients and how many servings it makes.',
      path: ['ingredients'],
    },
  );

export type FoodInput = z.input<typeof foodInputSchema>;

export interface Food {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly servingLabel: string;
  readonly servingGrams: number | null;
  /** Per serving. */
  readonly nutrients: Nutrients;
  readonly source: FoodSource;
  readonly favourite: boolean;
  readonly ingredients: readonly { readonly foodId: string; readonly servings: number }[];
  readonly servingsMade: number | null;
  readonly archived: boolean;
}

/**
 * A recipe's numbers per serving: the ingredients' totals divided by the
 * servings it makes. An ingredient with no numbers contributes nothing to a
 * nutrient, and the recipe says how many were incomplete.
 */
export function recipePerServing(
  ingredients: readonly { readonly food: Pick<Food, 'nutrients'>; readonly servings: number }[],
  servingsMade: number,
): { nutrients: Nutrients; incomplete: number } {
  const total = sumNutrients(
    ingredients.map((entry) => scaleNutrients(entry.food.nutrients, entry.servings)),
  );
  const incomplete = ingredients.filter((entry) =>
    NUTRIENTS.some((key) => entry.food.nutrients[key] === null),
  ).length;
  return { nutrients: scaleNutrients(total, 1 / servingsMade), incomplete };
}

// ---------------------------------------------------------------------------
// Entries and the day
// ---------------------------------------------------------------------------

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export interface FoodEntry {
  readonly id: string;
  readonly localDate: string;
  readonly slot: MealSlot;
  readonly foodId: string | null;
  /** The food's name at the time, or the quick-add description. */
  readonly description: string;
  readonly servings: number | null;
  /** Snapshot at the time of logging: editing a food later does not rewrite history. */
  readonly nutrients: Nutrients;
  readonly source: FoodSource | 'quick-add';
  readonly createdAt: string;
}

export const quickAddSchema = z.object({
  description: z.string().trim().min(1, 'Say what it was.').max(120),
  nutrients: nutrientsSchema.prefault({}),
});

export interface DayTotals {
  readonly nutrients: Nutrients;
  readonly entries: number;
  /** Entries logged with no numbers at all. Counted, never nagged about. */
  readonly withoutNumbers: number;
  readonly waterMl: number;
}

export function dayTotals(
  entries: readonly Pick<FoodEntry, 'nutrients'>[],
  waterMl: readonly number[] = [],
): DayTotals {
  return {
    nutrients: sumNutrients(entries.map((entry) => entry.nutrients)),
    entries: entries.length,
    withoutNumbers: entries.filter((entry) =>
      NUTRIENTS.every((key) => entry.nutrients[key] === null),
    ).length,
    waterMl: waterMl.reduce((sum, value) => sum + value, 0),
  };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export const NUTRITION_GOALS = ['maintain', 'lose_gently', 'gain', 'none'] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];

export const NUTRITION_GOAL_LABEL: Record<NutritionGoal, string> = {
  maintain: 'Stay about the same',
  lose_gently: 'Lose weight gently',
  gain: 'Gain weight',
  none: 'No energy target — just awareness',
};

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting',
  light: 'On my feet some of the day, or light exercise',
  moderate: 'Exercise most days',
  active: 'Hard training or a physical job',
};

export const SEX_FOR_CALCULATION = ['female', 'male', 'unspecified'] as const;
export type SexForCalculation = (typeof SEX_FOR_CALCULATION)[number];

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface Targets {
  readonly kcal: Range | null;
  readonly proteinG: Range | null;
  readonly carbsG: Range | null;
  readonly fatG: Range | null;
  /** "At least": fibre has a floor, not a ceiling worth policing. */
  readonly fiberG: Range | null;
  readonly waterMl: Range | null;
  /** Each step of the calculation, in words and numbers, in order. */
  readonly working: readonly string[];
  readonly source: 'calculated' | 'override' | 'clinician' | 'none';
}

export const NO_TARGETS: Targets = {
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  fiberG: null,
  waterMl: null,
  working: [],
  source: 'none',
};

export interface TargetInputs {
  readonly sex: SexForCalculation;
  readonly ageYears: number | null;
  readonly heightCm: number | null;
  readonly weightKg: number | null;
  readonly activity: ActivityLevel;
  readonly goal: NutritionGoal;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Mifflin–St Jeor resting energy. With sex unspecified, the midpoint of the two equations. */
export function restingEnergy(
  sex: SexForCalculation,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + offset;
}

/** The smallest energy target ARETE will calculate, whatever the inputs. */
export const ENERGY_FLOOR_KCAL = 1200;

/**
 * Calculates targets, and shows the working.
 *
 * Energy needs weight, height and age; without them, there is no energy
 * target and nothing is guessed. Protein and water need weight. Fibre
 * follows energy. A gentle loss is at most 10% below estimated needs (and
 * at most 500 kcal), never below resting energy or 1200 kcal.
 */
export function calculateTargets(
  input: TargetInputs,
  options: { readonly deficitAllowed: boolean } = { deficitAllowed: true },
): Targets {
  const working: string[] = [];
  const { weightKg, heightCm, ageYears } = input;
  const goal: NutritionGoal =
    input.goal === 'lose_gently' && !options.deficitAllowed ? 'maintain' : input.goal;
  if (goal !== input.goal) {
    working.push(
      'A weight-loss target is not set for you, so the energy range is for maintenance.',
    );
  }

  let center: number | null = null;
  if (goal !== 'none' && weightKg !== null && heightCm !== null && ageYears !== null) {
    const rest = restingEnergy(input.sex, weightKg, heightCm, ageYears);
    const factor = ACTIVITY_FACTOR[input.activity];
    const needs = rest * factor;
    working.push(
      `Resting energy (Mifflin–St Jeor${input.sex === 'unspecified' ? ', midpoint of the two sex-specific versions' : `, ${input.sex}`}): 10 × ${weightKg} kg + 6.25 × ${heightCm} cm − 5 × ${ageYears} y ${input.sex === 'male' ? '+ 5' : input.sex === 'female' ? '− 161' : '− 78'} = ${Math.round(rest)} kcal.`,
    );
    working.push(
      `× ${factor} for activity (${ACTIVITY_LABEL[input.activity].toLowerCase()}) = about ${Math.round(needs)} kcal a day.`,
    );

    center = needs;
    if (goal === 'lose_gently') {
      const cut = Math.min(needs * 0.1, 500);
      const floor = Math.max(rest, ENERGY_FLOOR_KCAL);
      center = Math.max(needs - cut, floor);
      working.push(
        center === floor && needs - cut < floor
          ? `A gentle loss would go below your resting energy or ${ENERGY_FLOOR_KCAL} kcal, so it stops at ${Math.round(floor)} kcal.`
          : `Gentle loss: ${Math.round(cut)} kcal less (10%, at most 500) = ${Math.round(center)} kcal.`,
      );
    } else if (goal === 'gain') {
      const add = Math.min(needs * 0.1, 350);
      center = needs + add;
      working.push(
        `Gain: ${Math.round(add)} kcal more (10%, at most 350) = ${Math.round(center)} kcal.`,
      );
    }
  } else if (goal !== 'none') {
    working.push('No energy range: it needs your height, weight and age, and nothing is guessed.');
  }

  const kcal =
    center === null ? null : { min: roundTo(center * 0.95, 10), max: roundTo(center * 1.05, 10) };
  if (kcal)
    working.push(`Energy range: ±5% = ${kcal.min}–${kcal.max} kcal. A range, not a budget.`);

  const proteinG =
    weightKg === null ? null : { min: roundTo(weightKg * 1.2, 5), max: roundTo(weightKg * 1.6, 5) };
  if (proteinG)
    working.push(`Protein: 1.2–1.6 g per kg × ${weightKg} kg = ${proteinG.min}–${proteinG.max} g.`);

  let fatG: Range | null = null;
  let carbsG: Range | null = null;
  let fiberG: Range | null = null;
  if (center !== null) {
    fatG = { min: roundTo((center * 0.2) / 9, 5), max: roundTo((center * 0.35) / 9, 5) };
    working.push(`Fat: 20–35% of energy ÷ 9 kcal per g = ${fatG.min}–${fatG.max} g.`);
    if (proteinG) {
      const low = Math.max(0, (center - proteinG.max * 4 - fatG.max * 9) / 4);
      const high = Math.max(low, (center - proteinG.min * 4 - fatG.min * 9) / 4);
      carbsG = { min: roundTo(low, 5), max: roundTo(high, 5) };
      working.push(
        `Carbohydrate: what energy is left after protein and fat, ÷ 4 = ${carbsG.min}–${carbsG.max} g.`,
      );
    }
    const fiber = roundTo((center / 1000) * 14, 1);
    fiberG = { min: fiber, max: roundTo(fiber * 1.5, 1) };
    working.push(`Fibre: at least 14 g per 1000 kcal = ${fiberG.min} g or more.`);
  }

  const waterMl =
    weightKg === null ? null : { min: roundTo(weightKg * 30, 50), max: roundTo(weightKg * 35, 50) };
  if (waterMl) {
    working.push(
      `Water: 30–35 ml per kg = ${waterMl.min}–${waterMl.max} ml, food and drinks together. More in heat or hard training.`,
    );
  }

  const any = kcal ?? proteinG ?? fatG ?? waterMl;
  return {
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    waterMl,
    working,
    source: any ? 'calculated' : 'none',
  };
}

export type RangeStatus = 'under' | 'in_range' | 'over';

export const RANGE_STATUS_LABEL: Record<RangeStatus, string> = {
  under: 'under',
  in_range: 'in range',
  over: 'over',
};

export function rangeStatus(
  value: number,
  range: Range,
  kind: 'band' | 'floor' = 'band',
): RangeStatus {
  if (value < range.min) return 'under';
  if (kind === 'band' && value > range.max) return 'over';
  return 'in_range';
}

/**
 * Warnings for an energy target someone sets themselves. They are shown, not
 * enforced: it is their decision, and the app's job is to say what it knows.
 */
export function deficitWarnings(
  targetKcal: number,
  estimate: { restingKcal: number | null; needsKcal: number | null },
): string[] {
  const warnings: string[] = [];
  if (targetKcal < ENERGY_FLOOR_KCAL) {
    warnings.push(
      `Below ${ENERGY_FLOOR_KCAL} kcal a day is very low for almost every adult. Please talk to a doctor or dietitian before eating this little.`,
    );
  }
  if (estimate.restingKcal !== null && targetKcal < estimate.restingKcal) {
    warnings.push(
      `This is below your estimated resting energy (${Math.round(estimate.restingKcal)} kcal). Eating under that for long tends to backfire.`,
    );
  }
  if (estimate.needsKcal !== null && targetKcal < estimate.needsKcal * 0.8) {
    warnings.push(
      'This is more than 20% below your estimated needs — an aggressive deficit. A smaller one is easier to keep and kinder to training and sleep.',
    );
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Safeguards
// ---------------------------------------------------------------------------

export interface SafeguardInputs {
  readonly isMinor: boolean;
  readonly guardianConfirmed: boolean;
  readonly pregnancyStatus: 'not_applicable' | 'pregnant' | 'postpartum' | 'prefer_not_to_say';
  /** The person said calorie counting or weighing has been unhelpful for them, or has an eating-disorder history. */
  readonly eatingDisorderCaution: boolean;
  /** The person follows a diet prescribed by a clinician. */
  readonly prescribedDiet: boolean;
}

export interface Safeguards {
  /** Whether ARETE calculates an energy target at all. */
  readonly calculateEnergy: boolean;
  readonly deficitAllowed: boolean;
  /** Numbers start hidden; the person can still choose to show them. */
  readonly hideNumbersByDefault: boolean;
  readonly weightTrendOffered: boolean;
  readonly messages: readonly { readonly title: string; readonly body: string }[];
}

/**
 * What changes when a safeguard applies. Each one only ever removes or
 * softens something; none adds pressure.
 */
export function nutritionSafeguards(input: SafeguardInputs): Safeguards {
  let calculateEnergy = true;
  let deficitAllowed = true;
  let hideNumbersByDefault = false;
  let weightTrendOffered = true;
  const messages: { title: string; body: string }[] = [];

  if (input.isMinor && !input.guardianConfirmed) {
    calculateEnergy = false;
    deficitAllowed = false;
    weightTrendOffered = false;
    messages.push({
      title: 'Under 18',
      body: 'ARETE does not calculate calorie targets or track weight trends for anyone under 18 unless a parent, guardian or clinician has agreed them. Logging meals, water and fibre still works.',
    });
  }
  if (input.pregnancyStatus === 'pregnant' || input.pregnancyStatus === 'postpartum') {
    calculateEnergy = false;
    deficitAllowed = false;
    messages.push({
      title: input.pregnancyStatus === 'pregnant' ? 'Pregnancy' : 'After birth',
      body: 'Energy needs change a lot at this time and depend on things ARETE cannot see, so no calorie target is calculated and weight-loss targets are off. Your midwife, doctor or dietitian can give you numbers; you can enter them yourself.',
    });
  }
  if (input.eatingDisorderCaution) {
    deficitAllowed = false;
    hideNumbersByDefault = true;
    weightTrendOffered = false;
    messages.push({
      title: 'Numbers stay in the background',
      body: 'Because you said counting or weighing has not helped you, numbers are hidden, weight trends are off, and there is no weight-loss target. You can log meals without any numbers at all. If food or weight is becoming a source of distress, your doctor or an eating-disorder support service (in the US, the National Alliance for Eating Disorders) can help.',
    });
  }
  if (input.prescribedDiet) {
    calculateEnergy = false;
    messages.push({
      title: 'Your clinician’s plan comes first',
      body: 'ARETE does not calculate targets that might contradict a prescribed diet. Enter the targets your clinician gave you, and they are marked as theirs.',
    });
  }

  return { calculateEnergy, deficitAllowed, hideNumbersByDefault, weightTrendOffered, messages };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const nutritionSettingsSchema = z.object({
  goal: z.enum(NUTRITION_GOALS).default('none'),
  activity: z.enum(ACTIVITY_LEVELS).default('light'),
  sex: z.enum(SEX_FOR_CALCULATION).default('unspecified'),
  birthYear: z.int().min(1900).max(2100).nullable().default(null),
  heightCm: z.number().min(100).max(250).nullable().default(null),
  hideCalorieNumbers: z.boolean().default(false),
  hideAllNumbers: z.boolean().default(false),
  eatingDisorderCaution: z.boolean().default(false),
  prescribedDiet: z.boolean().default(false),
  weightTrendEnabled: z.boolean().default(false),
  unitSystem: z.enum(['metric', 'us']).default('metric'),
});
export type NutritionSettings = z.infer<typeof nutritionSettingsSchema>;

export const targetOverrideSchema = z
  .object({
    kcal: z.number().min(500).max(10_000).nullable().default(null),
    proteinG: z.number().min(0).max(1000).nullable().default(null),
    carbsG: z.number().min(0).max(2000).nullable().default(null),
    fatG: z.number().min(0).max(1000).nullable().default(null),
    fiberG: z.number().min(0).max(200).nullable().default(null),
    waterMl: z.number().min(0).max(10_000).nullable().default(null),
    fromClinician: z.boolean().default(false),
  })
  .refine(
    (value) =>
      [value.kcal, value.proteinG, value.carbsG, value.fatG, value.fiberG, value.waterMl].some(
        (entry) => entry !== null,
      ),
    {
      message: 'Enter at least one target.',
    },
  );
export type TargetOverride = z.infer<typeof targetOverrideSchema>;

/** An override is a point the person chose; shown as a small range around it so the words stay the same. */
export function targetsFromOverride(override: TargetOverride): Targets {
  const around = (value: number | null, spread: number): Range | null =>
    value === null
      ? null
      : { min: Math.round(value * (1 - spread)), max: Math.round(value * (1 + spread)) };
  return {
    kcal: around(override.kcal, 0.05),
    proteinG: around(override.proteinG, 0.1),
    carbsG: around(override.carbsG, 0.1),
    fatG: around(override.fatG, 0.1),
    fiberG: override.fiberG === null ? null : { min: override.fiberG, max: override.fiberG * 1.5 },
    waterMl: around(override.waterMl, 0.1),
    working: [
      override.fromClinician
        ? 'Targets entered from your clinician’s plan.'
        : 'Targets you set yourself.',
    ],
    source: override.fromClinician ? 'clinician' : 'override',
  };
}

// ---------------------------------------------------------------------------
// Weight trend
// ---------------------------------------------------------------------------

export interface WeightPoint {
  readonly localDate: string;
  readonly weightKg: number;
}

/**
 * A 7-day rolling average for each day with a weigh-in: the mean of every
 * weigh-in in the seven days ending that day. Daily weight moves with water
 * and salt; the average is the only number worth looking at.
 */
export function rollingAverage(
  points: readonly WeightPoint[],
  window = 7,
): { localDate: string; averageKg: number }[] {
  const sorted = [...points].sort((a, b) => a.localDate.localeCompare(b.localDate));
  return sorted.map((point) => {
    const from = addDays(point.localDate, -(window - 1));
    const inWindow = sorted.filter(
      (other) => other.localDate >= from && other.localDate <= point.localDate,
    );
    const average = inWindow.reduce((sum, other) => sum + other.weightKg, 0) / inWindow.length;
    return { localDate: point.localDate, averageKg: Math.round(average * 10) / 10 };
  });
}

/** Change in the rolling average over the period, per week, in plain words. */
export function weightTrend(
  points: readonly WeightPoint[],
): { perWeekKg: number; days: number; words: string } | null {
  const averages = rollingAverage(points);
  const first = averages[0];
  const last = averages.at(-1);
  if (!first || !last) return null;
  const days = daysBetween(first.localDate, last.localDate);
  if (days < 7) return null;
  const perWeekKg = Math.round(((last.averageKg - first.averageKg) / days) * 7 * 100) / 100;
  const size = Math.abs(perWeekKg);
  const words =
    size < 0.1
      ? 'about level'
      : `${perWeekKg < 0 ? 'down' : 'up'} about ${size.toFixed(1)} kg a week`;
  return { perWeekKg, days, words };
}

// ---------------------------------------------------------------------------
// Ingredient / oil awareness
// ---------------------------------------------------------------------------

export const OIL_STANCES = ['prefer', 'limit', 'avoid'] as const;
export type OilStance = (typeof OIL_STANCES)[number];

export const COOKING_OILS = [
  'Olive oil',
  'Avocado oil',
  'Butter',
  'Ghee',
  'Coconut oil',
  'Rapeseed (canola) oil',
  'Sunflower oil',
  'Vegetable oil blend',
] as const;

export const oilAwarenessSchema = z.object({
  cookingOils: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  list: z
    .array(z.object({ ingredient: z.string().trim().min(1).max(40), stance: z.enum(OIL_STANCES) }))
    .max(40)
    .default([]),
  /** Ingredient-label notes, by food id. */
  labelNotes: z.record(z.string(), z.string().trim().max(300)).default({}),
});
export type OilAwareness = z.infer<typeof oilAwarenessSchema>;

/** Which list items a piece of label text mentions. Case-insensitive, whole words where it matters. */
export function oilMatches(text: string, list: OilAwareness['list']): OilAwareness['list'] {
  const haystack = text.toLowerCase();
  return list.filter((item) => haystack.includes(item.ingredient.toLowerCase()));
}
