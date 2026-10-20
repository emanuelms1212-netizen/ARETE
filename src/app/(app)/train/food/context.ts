import {
  ACTIVITY_FACTOR,
  MEAL_SLOTS,
  NO_TARGETS,
  addDays,
  calculateTargets,
  dayTotals,
  daysBetween,
  eligibility,
  restingEnergy,
  rollingAverage,
  targetsFromOverride,
  weightTrend,
  type DayTotals,
  type Food,
  type FoodEntry,
  type IsoDate,
  type MealSlot,
  type NutritionSettings,
  type OilAwareness,
  type Safeguards,
  type TargetOverride,
  type Targets,
  type WeightPoint,
} from '@/domain';
import type { AreteRepository, WaterLog } from '@/persistence/repository';

/**
 * Everything the Food screen and its actions need, derived on the server in
 * one place — as Train and Flexibility do.
 *
 * Safeguards come from the onboarding answers (age, pregnancy) and from the
 * person's own food settings, and they are applied here rather than on the
 * screen, so a calorie target that should not exist is never computed, let
 * alone hidden with CSS.
 */
export const BACKFILL_DAYS = 30;

export interface FoodDisplay {
  /** Any numbers at all. Off means meals and water are logged as words and counts. */
  readonly numbers: boolean;
  /** Energy numbers specifically. */
  readonly calories: boolean;
  readonly weightTrend: boolean;
}

export interface FoodDay {
  readonly localDate: IsoDate;
  readonly totals: DayTotals;
}

export interface FoodContext {
  readonly today: IsoDate;
  readonly date: IsoDate;
  readonly earliest: IsoDate;
  readonly settings: NutritionSettings;
  readonly override: TargetOverride | null;
  readonly safeguards: Safeguards;
  readonly targets: Targets;
  /** What a self-set energy target is compared against; null when it cannot be estimated. */
  readonly estimate: { readonly restingKcal: number | null; readonly needsKcal: number | null };
  readonly display: FoodDisplay;
  readonly latestWeight: WeightPoint | null;
  readonly foods: readonly Food[];
  readonly entries: readonly FoodEntry[];
  /** Slots that had entries the day before the viewed date, so they can be copied. */
  readonly copyable: readonly MealSlot[];
  readonly water: readonly WaterLog[];
  readonly totals: DayTotals;
  readonly week: readonly FoodDay[];
  readonly weights: readonly WeightPoint[];
  readonly averages: readonly { localDate: string; averageKg: number }[];
  readonly trend: ReturnType<typeof weightTrend>;
  readonly oil: OilAwareness | null;
}

export function ageOn(birthYear: number | null, localDate: IsoDate): number | null {
  if (birthYear === null) return null;
  return Number(localDate.slice(0, 4)) - birthYear;
}

/** A date the client asked for, accepted only within the backfill window. */
export function acceptDate(requested: string | undefined, today: IsoDate): IsoDate | null {
  if (requested === undefined) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || Number.isNaN(Date.parse(requested))) return null;
  const back = daysBetween(requested, today);
  return back >= 0 && back <= BACKFILL_DAYS ? requested : null;
}

export function deriveTargets(input: {
  settings: NutritionSettings;
  override: TargetOverride | null;
  safeguards: Safeguards;
  weightKg: number | null;
  today: IsoDate;
}): Pick<FoodContext, 'targets' | 'estimate'> {
  const { settings, override, safeguards, weightKg, today } = input;
  const ageYears = ageOn(settings.birthYear, today);
  const estimable = weightKg !== null && settings.heightCm !== null && ageYears !== null;
  const rest = estimable
    ? restingEnergy(settings.sex, weightKg, settings.heightCm!, ageYears)
    : null;
  const estimate = {
    restingKcal: safeguards.calculateEnergy ? rest : null,
    needsKcal:
      safeguards.calculateEnergy && rest !== null
        ? rest * ACTIVITY_FACTOR[settings.activity]
        : null,
  };

  if (override) return { targets: targetsFromOverride(override), estimate };
  if (!safeguards.calculateEnergy) {
    return {
      targets: {
        ...NO_TARGETS,
        working: [
          'No targets are calculated for you (see the note above). You can enter targets you were given.',
        ],
      },
      estimate,
    };
  }
  return {
    targets: calculateTargets(
      {
        sex: settings.sex,
        ageYears,
        heightCm: settings.heightCm,
        weightKg,
        activity: settings.activity,
        goal: settings.goal,
      },
      { deficitAllowed: safeguards.deficitAllowed },
    ),
    estimate,
  };
}

export async function loadFoodContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
  requestedDate?: string,
): Promise<FoodContext> {
  const date = acceptDate(requestedDate, today) ?? today;
  const weekFrom = addDays(date, -6);
  const [onboarding, settings, override, foods, entries, water, weights, oil] = await Promise.all([
    repository.getOnboarding(userId),
    repository.getNutritionSettings(userId),
    repository.getTargetOverride(userId),
    repository.listFoods(userId),
    repository.listFoodEntries(userId, { from: addDays(weekFrom, -1), to: date }),
    repository.listWater(userId, { from: weekFrom, to: date }),
    // A year back for the weight used in calculations; the trend looks at 90 days.
    repository.listWeights(userId, { from: addDays(today, -365), to: today }),
    repository.getOilAwareness(userId),
  ]);

  const birthYear = settings.birthYear ?? onboarding.profile.age.birthYear ?? null;
  // The same central rules every module uses (see domain/eligibility.ts).
  const safeguards = eligibility({
    today,
    profile: onboarding.profile,
    painFlags: [],
    nutrition: {
      birthYear: settings.birthYear,
      eatingDisorderCaution: settings.eatingDisorderCaution,
      prescribedDiet: settings.prescribedDiet,
    },
    contrastScreening: null,
    acknowledgements: { cold_exposure: null, contrast_therapy: null },
  }).nutrition;

  const latestWeight = weights.at(-1) ?? null;
  const trendFrom = addDays(today, -90);
  const recentWeights = weights.filter((point) => point.localDate >= trendFrom);
  const { targets, estimate } = deriveTargets({
    settings: { ...settings, birthYear },
    override,
    safeguards,
    weightKg: latestWeight?.weightKg ?? null,
    today,
  });

  const numbers = !settings.hideAllNumbers;
  const display: FoodDisplay = {
    numbers,
    calories: numbers && !settings.hideCalorieNumbers,
    weightTrend: numbers && settings.weightTrendEnabled && safeguards.weightTrendOffered,
  };

  const onDay = (day: IsoDate) => entries.filter((entry) => entry.localDate === day);
  const waterOn = (day: IsoDate) => water.filter((log) => log.localDate === day);
  const yesterday = addDays(date, -1);
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(weekFrom, index);
    return {
      localDate: day,
      totals: dayTotals(
        onDay(day),
        waterOn(day).map((log) => log.ml),
      ),
    };
  });

  return {
    today,
    date,
    earliest: addDays(today, -BACKFILL_DAYS),
    settings: { ...settings, birthYear },
    override,
    safeguards,
    targets,
    estimate,
    display,
    latestWeight,
    foods,
    entries: onDay(date),
    copyable: MEAL_SLOTS.filter((slot) =>
      onDay(yesterday).some((entry) => entry.slot === slot),
    ).filter((slot) => !onDay(date).some((entry) => entry.slot === slot)),
    water: waterOn(date),
    totals: dayTotals(
      onDay(date),
      waterOn(date).map((log) => log.ml),
    ),
    week,
    // Weights stay out of the page entirely unless the trend is wanted and allowed.
    weights: display.weightTrend ? recentWeights : [],
    averages: display.weightTrend ? rollingAverage(recentWeights) : [],
    trend: display.weightTrend ? weightTrend(recentWeights) : null,
    oil,
  };
}
