import {
  MEAL_SLOTS,
  foodInputSchema,
  nutrientsSchema,
  nutritionSettingsSchema,
  oilAwarenessSchema,
  quickAddSchema,
  recipePerServing,
  scaleNutrients,
  targetOverrideSchema,
  type Food,
  type FoodEntry,
  type FoodInput,
  type MealSlot,
  type Nutrients,
  type NutritionSettings,
  type OilAwareness,
  type TargetOverride,
  type WeightPoint,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type AddFoodEntryInput,
  type WaterLog,
} from '../repository';

/**
 * Nutrition, in memory. The same rules as the SQL adapter and the same
 * contract suite: entries carry a snapshot of their numbers, recipes are
 * calculated on save, copies are idempotent, one weigh-in per day, and
 * turning oil awareness off deletes all of it.
 */
interface UserState {
  settings: NutritionSettings | null;
  override: TargetOverride | null;
  foods: Food[];
  entries: FoodEntry[];
  water: WaterLog[];
  weights: Map<string, WeightPoint>;
  oil: OilAwareness | null;
  tokens: Map<string, string[]>;
}

export function createMemoryNutrition(
  hooks: {
    /** Onboarding's answers, as the starting point for settings. */
    readonly defaults?: (userId: string) => Partial<NutritionSettings>;
    /** Keeps onboarding's food answers in step when settings change. */
    readonly onSettingsSaved?: (userId: string, settings: NutritionSettings) => void;
  } = {},
) {
  let sequence = 0;
  const users = new Map<string, UserState>();
  const next = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  function state(userId: string): UserState {
    let found = users.get(userId);
    if (!found) {
      found = {
        settings: null,
        override: null,
        foods: [],
        entries: [],
        water: [],
        weights: new Map(),
        oil: null,
        tokens: new Map(),
      };
      users.set(userId, found);
    }
    return found;
  }

  function food(userId: string, foodId: string): Food {
    const found = state(userId).foods.find((entry) => entry.id === foodId);
    if (!found) throw new RecordNotFoundError('No such food for this account.');
    return found;
  }

  function buildFood(userId: string, id: string, input: FoodInput, previous?: Food): Food {
    const parsed = foodInputSchema.parse(input);
    let nutrients: Nutrients = parsed.nutrients;
    if (parsed.source === 'recipe') {
      const ingredients = parsed.ingredients.map((ingredient) => {
        if (ingredient.foodId === id)
          throw new InvalidWriteError('A recipe cannot contain itself.');
        return { food: food(userId, ingredient.foodId), servings: ingredient.servings };
      });
      nutrients = recipePerServing(ingredients, parsed.servingsMade!).nutrients;
    }
    return {
      id,
      name: parsed.name,
      brand: parsed.brand,
      servingLabel: parsed.servingLabel,
      servingGrams: parsed.servingGrams,
      nutrients,
      source: parsed.source,
      favourite: previous?.favourite ?? false,
      ingredients: parsed.source === 'recipe' ? parsed.ingredients : [],
      servingsMade: parsed.source === 'recipe' ? parsed.servingsMade : null,
      archived: false,
    };
  }

  function entry(userId: string, entryId: string): FoodEntry {
    const found = state(userId).entries.find((item) => item.id === entryId);
    if (!found) throw new RecordNotFoundError('No such entry for this account.');
    return found;
  }

  const byDateThenCreated = (a: FoodEntry, b: FoodEntry) =>
    a.localDate.localeCompare(b.localDate) ||
    MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot) ||
    a.createdAt.localeCompare(b.createdAt);

  return {
    async getNutritionSettings(userId: string) {
      const mine = state(userId);
      return structuredClone(
        mine.settings ?? nutritionSettingsSchema.parse(hooks.defaults?.(userId) ?? {}),
      );
    },

    async saveNutritionSettings(userId: string, settings: NutritionSettings) {
      const parsed = nutritionSettingsSchema.parse(settings);
      state(userId).settings = parsed;
      hooks.onSettingsSaved?.(userId, parsed);
      return structuredClone(parsed);
    },

    async getTargetOverride(userId: string) {
      return structuredClone(state(userId).override);
    },

    async saveTargetOverride(userId: string, override: TargetOverride | null) {
      state(userId).override = override === null ? null : targetOverrideSchema.parse(override);
      return structuredClone(state(userId).override);
    },

    async listFoods(userId: string) {
      return state(userId)
        .foods.filter((item) => !item.archived)
        .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name))
        .map((item) => structuredClone(item));
    },

    async saveFood(userId: string, input: { id?: string; food: FoodInput }) {
      const mine = state(userId);
      if (input.id) {
        const previous = food(userId, input.id);
        const updated = buildFood(userId, input.id, input.food, previous);
        mine.foods[mine.foods.indexOf(previous)] = updated;
        return structuredClone(updated);
      }
      const created = buildFood(userId, next('food'), input.food);
      mine.foods.push(created);
      return structuredClone(created);
    },

    async setFoodFavourite(userId: string, foodId: string, favourite: boolean) {
      const mine = state(userId);
      const current = food(userId, foodId);
      const updated = { ...current, favourite };
      mine.foods[mine.foods.indexOf(current)] = updated;
      return structuredClone(updated);
    },

    async archiveFood(userId: string, foodId: string) {
      const mine = state(userId);
      const current = food(userId, foodId);
      mine.foods[mine.foods.indexOf(current)] = { ...current, archived: true };
    },

    async listFoodEntries(userId: string, range: { from: string; to: string }) {
      return state(userId)
        .entries.filter((item) => item.localDate >= range.from && item.localDate <= range.to)
        .sort(byDateThenCreated)
        .map((item) => structuredClone(item));
    },

    async addFoodEntry(userId: string, input: AddFoodEntryInput) {
      const mine = state(userId);
      const seen = mine.tokens.get(input.clientToken);
      if (seen?.[0]) return structuredClone(entry(userId, seen[0]));

      let created: FoodEntry;
      const base = {
        id: next('entry'),
        localDate: input.localDate,
        slot: input.slot,
        createdAt: new Date().toISOString(),
      };
      if ('foodId' in input) {
        if (!(input.servings > 0 && input.servings <= 50))
          throw new InvalidWriteError('Servings must be between 0 and 50.');
        const source = food(userId, input.foodId);
        created = {
          ...base,
          foodId: source.id,
          description: source.name,
          servings: input.servings,
          nutrients: scaleNutrients(source.nutrients, input.servings),
          source: source.source,
        };
      } else {
        const quick = quickAddSchema.parse(input.quickAdd);
        created = {
          ...base,
          foodId: null,
          description: quick.description,
          servings: null,
          nutrients: quick.nutrients,
          source: 'quick-add',
        };
      }
      mine.entries.push(created);
      mine.tokens.set(input.clientToken, [created.id]);
      return structuredClone(created);
    },

    async updateFoodEntry(
      userId: string,
      entryId: string,
      patch: {
        servings?: number;
        slot?: MealSlot;
        quickAdd?: { description: string; nutrients: Nutrients };
      },
    ) {
      const mine = state(userId);
      const current = entry(userId, entryId);
      let updated: FoodEntry = { ...current, slot: patch.slot ?? current.slot };
      if (patch.servings !== undefined) {
        if (current.foodId === null || current.servings === null)
          throw new InvalidWriteError('A quick add has no servings to change.');
        if (!(patch.servings > 0 && patch.servings <= 50))
          throw new InvalidWriteError('Servings must be between 0 and 50.');
        // Rescale the snapshot itself, so a later edit to the food does not leak in.
        const perServing = scaleNutrients(current.nutrients, 1 / current.servings);
        updated = {
          ...updated,
          servings: patch.servings,
          nutrients: scaleNutrients(perServing, patch.servings),
        };
      }
      if (patch.quickAdd !== undefined) {
        if (current.source !== 'quick-add')
          throw new InvalidWriteError('Only a quick add can be rewritten.');
        const quick = quickAddSchema.parse(patch.quickAdd);
        updated = {
          ...updated,
          description: quick.description,
          nutrients: nutrientsSchema.parse(quick.nutrients),
        };
      }
      mine.entries[mine.entries.indexOf(current)] = updated;
      return structuredClone(updated);
    },

    async deleteFoodEntry(userId: string, entryId: string) {
      const mine = state(userId);
      entry(userId, entryId);
      mine.entries = mine.entries.filter((item) => item.id !== entryId);
    },

    async copyMeal(
      userId: string,
      input: {
        fromDate: string;
        toDate: string;
        slot: MealSlot;
        timeZone: string;
        clientToken: string;
      },
    ) {
      const mine = state(userId);
      const seen = mine.tokens.get(input.clientToken);
      if (seen) return seen.map((id) => structuredClone(entry(userId, id)));
      const source = mine.entries
        .filter((item) => item.localDate === input.fromDate && item.slot === input.slot)
        .sort(byDateThenCreated);
      const copies = source.map((item) => ({
        ...item,
        id: next('entry'),
        localDate: input.toDate,
        createdAt: new Date().toISOString(),
      }));
      mine.entries.push(...copies);
      mine.tokens.set(
        input.clientToken,
        copies.map((item) => item.id),
      );
      return copies.map((item) => structuredClone(item));
    },

    async addWater(
      userId: string,
      input: { localDate: string; timeZone: string; ml: number; at: Date; clientToken: string },
    ) {
      const mine = state(userId);
      const seen = mine.tokens.get(input.clientToken);
      if (seen?.[0]) return structuredClone(mine.water.find((item) => item.id === seen[0])!);
      if (!(input.ml > 0 && input.ml <= 5000))
        throw new InvalidWriteError('Between 1 and 5000 ml at a time.');
      const created: WaterLog = {
        id: next('water'),
        localDate: input.localDate,
        ml: input.ml,
        loggedAt: input.at.toISOString(),
      };
      mine.water.push(created);
      mine.tokens.set(input.clientToken, [created.id]);
      return structuredClone(created);
    },

    async listWater(userId: string, range: { from: string; to: string }) {
      return state(userId)
        .water.filter((item) => item.localDate >= range.from && item.localDate <= range.to)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
        .map((item) => structuredClone(item));
    },

    async deleteWater(userId: string, id: string) {
      const mine = state(userId);
      if (!mine.water.some((item) => item.id === id))
        throw new RecordNotFoundError('No such water entry.');
      mine.water = mine.water.filter((item) => item.id !== id);
    },

    async logWeight(
      userId: string,
      input: { localDate: string; timeZone: string; weightKg: number; at: Date },
    ) {
      if (!(input.weightKg >= 20 && input.weightKg <= 400))
        throw new InvalidWriteError('That weight does not look right.');
      const point = { localDate: input.localDate, weightKg: Math.round(input.weightKg * 10) / 10 };
      state(userId).weights.set(input.localDate, point);
      return structuredClone(point);
    },

    async listWeights(userId: string, range: { from: string; to: string }) {
      return [...state(userId).weights.values()]
        .filter((item) => item.localDate >= range.from && item.localDate <= range.to)
        .sort((a, b) => a.localDate.localeCompare(b.localDate))
        .map((item) => structuredClone(item));
    },

    async deleteWeight(userId: string, localDate: string) {
      state(userId).weights.delete(localDate);
    },

    async getOilAwareness(userId: string) {
      return structuredClone(state(userId).oil);
    },

    async saveOilAwareness(userId: string, value: OilAwareness) {
      const parsed = oilAwarenessSchema.parse(value);
      state(userId).oil = parsed;
      return structuredClone(parsed);
    },

    async deleteOilAwareness(userId: string) {
      state(userId).oil = null;
    },

    seedNutrition(
      userId: string,
      seed: {
        foods: readonly (FoodInput & { favourite?: boolean })[];
        entries: readonly {
          localDate: string;
          slot: MealSlot;
          foodIndex: number;
          servings: number;
        }[];
        water: readonly { localDate: string; ml: number }[];
      },
    ) {
      const mine = state(userId);
      const created = seed.foods.map((input) => {
        const built = {
          ...buildFood(userId, next('food'), input),
          favourite: input.favourite ?? false,
        };
        mine.foods.push(built);
        return built;
      });
      for (const item of seed.entries) {
        const source = created[item.foodIndex]!;
        mine.entries.push({
          id: next('entry'),
          localDate: item.localDate,
          slot: item.slot,
          foodId: source.id,
          description: source.name,
          servings: item.servings,
          nutrients: scaleNutrients(source.nutrients, item.servings),
          source: source.source,
          createdAt: `${item.localDate}T08:00:00.000Z`,
        });
      }
      for (const item of seed.water) {
        mine.water.push({
          id: next('water'),
          localDate: item.localDate,
          ml: item.ml,
          loggedAt: `${item.localDate}T09:00:00.000Z`,
        });
      }
    },

    exportNutrition(userId: string) {
      const mine = state(userId);
      const rows = (items: readonly unknown[]) =>
        items.map((item) => structuredClone(item) as Record<string, unknown>);
      return {
        nutrition_profile: mine.settings ? rows([mine.settings]) : [],
        nutrition_targets: mine.override ? rows([mine.override]) : [],
        foods: rows(mine.foods),
        food_entries: rows(mine.entries),
        hydration_logs: rows(mine.water),
        body_metrics: rows([...mine.weights.values()]),
        oil_awareness: mine.oil ? rows([mine.oil]) : [],
      };
    },

    deleteNutrition(userId: string) {
      users.delete(userId);
    },
  };
}
