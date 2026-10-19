'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/auth';
import {
  MEAL_SLOTS,
  addDays,
  clientToken,
  foodInputSchema,
  nutritionSettingsSchema,
  oilAwarenessSchema,
  quickAddSchema,
  targetOverrideSchema,
  type Food,
  type FoodEntry,
  type IsoDate,
  type NutritionSettings,
  type OilAwareness,
  type TargetOverride,
  type WeightPoint,
} from '@/domain';
import { withUser } from '@/persistence';
import { InvalidWriteError, type AreteRepository, type WaterLog } from '@/persistence/repository';
import { resolveCurrentDay } from '../../current-day';
import { acceptDate } from './context';

/**
 * Food writes.
 *
 * Every input is parsed here, on the server. A date may be chosen by the
 * client — logging yesterday's dinner this morning is ordinary — but only
 * within the last 30 days and never in the future (ledger D86).
 */
export type FoodResult<T> = { ok: true; value: T } | { ok: false; message: string };

type Scope = { userId: string; today: IsoDate; timeZone: string };

async function run<T>(
  work: (repository: AreteRepository, scope: Scope) => Promise<FoodResult<T>>,
  alsoRevalidate: readonly string[] = [],
): Promise<FoodResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    try {
      return await work(repository, { userId: user.id, today: localDate, timeZone });
    } catch (error) {
      if (error instanceof InvalidWriteError) return { ok: false as const, message: error.message };
      throw error;
    }
  });
  revalidatePath('/train/food');
  for (const path of alsoRevalidate) revalidatePath(path);
  return result;
}

const firstIssue = (error: z.ZodError, fallback: string) => error.issues[0]?.message ?? fallback;

function dateOrRefusal(requested: string, today: IsoDate): IsoDate | null {
  return acceptDate(requested, today);
}

const DATE_REFUSAL = 'Food can be logged for today or the last 30 days.';

/** Logging any food today is the day's food commitment done — one fact, recorded once. */
async function markFoodCommitment(repository: AreteRepository, userId: string, localDate: IsoDate) {
  const day = await repository.getDay(userId, localDate);
  const commitment = day?.commitments.find(
    (item) => item.kind === 'food' && item.status !== 'done',
  );
  if (day && commitment) {
    await repository.setCommitmentStatus(userId, {
      localDate,
      commitmentId: commitment.id,
      status: 'done',
      at: new Date(),
    });
  }
}

// ---------------------------------------------------------------------------
// Settings and targets
// ---------------------------------------------------------------------------

export async function saveNutritionSettingsAction(
  input: unknown,
): Promise<FoodResult<NutritionSettings>> {
  const parsed = nutritionSettingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: firstIssue(parsed.error, 'Check the settings.') };
  return run(async (repository, { userId }) => {
    const before = await repository.getNutritionSettings(userId);
    let next = parsed.data;
    // Turning the caution on hides numbers as its starting point. The person
    // can show them again afterwards; that is their choice to make.
    if (next.eatingDisorderCaution && !before.eatingDisorderCaution) {
      next = { ...next, hideAllNumbers: true, weightTrendEnabled: false };
      if (next.goal === 'lose_gently') next = { ...next, goal: 'maintain' };
    }
    return { ok: true, value: await repository.saveNutritionSettings(userId, next) };
  });
}

export async function saveTargetOverrideAction(
  input: unknown,
): Promise<FoodResult<TargetOverride | null>> {
  if (input === null) {
    return run(async (repository, { userId }) => ({
      ok: true,
      value: await repository.saveTargetOverride(userId, null, new Date()),
    }));
  }
  const parsed = targetOverrideSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: firstIssue(parsed.error, 'Check the targets.') };
  return run(async (repository, { userId }) => ({
    ok: true,
    value: await repository.saveTargetOverride(userId, parsed.data, new Date()),
  }));
}

// ---------------------------------------------------------------------------
// Foods and recipes
// ---------------------------------------------------------------------------

export async function saveFoodAction(input: {
  id?: string;
  food: unknown;
}): Promise<FoodResult<Food>> {
  const parsed = foodInputSchema.safeParse(input.food);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error, 'Check the food.') };
  return run(async (repository, { userId }) => {
    // Demo values belong to the demo: a food may keep that label, but never gain it.
    if (parsed.data.source === 'synthetic-demo') {
      const existing = input.id
        ? (await repository.listFoods(userId)).find((food) => food.id === input.id)
        : undefined;
      if (existing?.source !== 'synthetic-demo')
        return { ok: false, message: 'Choose where the numbers came from.' };
    }
    return {
      ok: true,
      value: await repository.saveFood(userId, {
        ...(input.id === undefined ? {} : { id: input.id }),
        food: parsed.data,
      }),
    };
  });
}

export async function setFoodFavouriteAction(input: {
  foodId: string;
  favourite: boolean;
}): Promise<FoodResult<Food>> {
  return run(async (repository, { userId }) => ({
    ok: true,
    value: await repository.setFoodFavourite(userId, input.foodId, input.favourite === true),
  }));
}

export async function archiveFoodAction(foodId: string): Promise<FoodResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.archiveFood(userId, foodId);
    return { ok: true, value: null };
  });
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const slotSchema = z.enum(MEAL_SLOTS);

const addEntrySchema = z.union([
  z.object({
    localDate: z.string(),
    slot: slotSchema,
    attemptToken: z.string().min(8).max(80),
    foodId: z.string().min(1),
    servings: z.number().positive().max(50),
  }),
  z.object({
    localDate: z.string(),
    slot: slotSchema,
    attemptToken: z.string().min(8).max(80),
    quickAdd: quickAddSchema,
  }),
]);

export async function addFoodEntryAction(input: unknown): Promise<FoodResult<FoodEntry>> {
  const parsed = addEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error, 'Check the entry.') };
  return run(
    async (repository, { userId, today, timeZone }) => {
      const localDate = dateOrRefusal(parsed.data.localDate, today);
      if (!localDate) return { ok: false, message: DATE_REFUSAL };
      const base = {
        localDate,
        timeZone,
        slot: parsed.data.slot,
        clientToken: clientToken('food-entry', parsed.data.attemptToken),
      };
      const value = await repository.addFoodEntry(
        userId,
        'foodId' in parsed.data
          ? { ...base, foodId: parsed.data.foodId, servings: parsed.data.servings }
          : { ...base, quickAdd: parsed.data.quickAdd },
      );
      if (localDate === today) await markFoodCommitment(repository, userId, today);
      return { ok: true, value };
    },
    ['/today'],
  );
}

const updateEntrySchema = z.object({
  entryId: z.string().min(1),
  servings: z.number().positive().max(50).optional(),
  slot: slotSchema.optional(),
  quickAdd: quickAddSchema.optional(),
});

export async function updateFoodEntryAction(input: unknown): Promise<FoodResult<FoodEntry>> {
  const parsed = updateEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error, 'Check the entry.') };
  const { entryId, servings, slot, quickAdd } = parsed.data;
  return run(async (repository, { userId }) => ({
    ok: true,
    value: await repository.updateFoodEntry(userId, entryId, {
      ...(servings === undefined ? {} : { servings }),
      ...(slot === undefined ? {} : { slot }),
      ...(quickAdd === undefined ? {} : { quickAdd }),
    }),
  }));
}

export async function deleteFoodEntryAction(entryId: string): Promise<FoodResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.deleteFoodEntry(userId, entryId);
    return { ok: true, value: null };
  });
}

export async function copyMealAction(input: {
  toDate: string;
  slot: string;
  attemptToken: string;
}): Promise<FoodResult<readonly FoodEntry[]>> {
  const slot = slotSchema.safeParse(input.slot);
  if (!slot.success) return { ok: false, message: 'Unknown meal.' };
  return run(
    async (repository, { userId, today, timeZone }) => {
      const toDate = dateOrRefusal(input.toDate, today);
      if (!toDate) return { ok: false, message: DATE_REFUSAL };
      const fromDate = addDays(toDate, -1);
      const value = await repository.copyMeal(userId, {
        fromDate,
        toDate,
        slot: slot.data,
        timeZone,
        clientToken: clientToken('copy-meal', input.attemptToken),
      });
      if (value.length === 0) return { ok: false, message: 'There was nothing to copy.' };
      if (toDate === today) await markFoodCommitment(repository, userId, today);
      return { ok: true, value };
    },
    ['/today'],
  );
}

// ---------------------------------------------------------------------------
// Water and weight
// ---------------------------------------------------------------------------

export async function addWaterAction(input: {
  localDate: string;
  ml: number;
  attemptToken: string;
}): Promise<FoodResult<WaterLog>> {
  const ml = z.number().positive().max(5000).safeParse(input.ml);
  if (!ml.success) return { ok: false, message: 'Between 1 and 5000 ml at a time.' };
  return run(async (repository, { userId, today, timeZone }) => {
    const localDate = dateOrRefusal(input.localDate, today);
    if (!localDate) return { ok: false, message: DATE_REFUSAL };
    return {
      ok: true,
      value: await repository.addWater(userId, {
        localDate,
        timeZone,
        ml: Math.round(ml.data),
        at: new Date(),
        clientToken: clientToken('water', input.attemptToken),
      }),
    };
  });
}

export async function deleteWaterAction(id: string): Promise<FoodResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.deleteWater(userId, id);
    return { ok: true, value: null };
  });
}

export async function logWeightAction(weightKg: number): Promise<FoodResult<WeightPoint>> {
  const parsed = z.number().min(20).max(400).safeParse(weightKg);
  if (!parsed.success) return { ok: false, message: 'That weight does not look right.' };
  return run(async (repository, { userId, today, timeZone }) => ({
    ok: true,
    value: await repository.logWeight(userId, {
      localDate: today,
      timeZone,
      weightKg: Math.round(parsed.data * 10) / 10,
      at: new Date(),
    }),
  }));
}

export async function deleteWeightAction(localDate: string): Promise<FoodResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.deleteWeight(userId, localDate);
    return { ok: true, value: null };
  });
}

// ---------------------------------------------------------------------------
// Ingredient / oil awareness
// ---------------------------------------------------------------------------

export async function saveOilAwarenessAction(input: unknown): Promise<FoodResult<OilAwareness>> {
  const parsed = oilAwarenessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error, 'Check the list.') };
  return run(async (repository, { userId }) => ({
    ok: true,
    value: await repository.saveOilAwareness(userId, parsed.data),
  }));
}

export async function deleteOilAwarenessAction(): Promise<FoodResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.deleteOilAwareness(userId);
    return { ok: true, value: null };
  });
}
