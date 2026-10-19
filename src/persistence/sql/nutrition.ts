import {
  MEAL_SLOTS,
  foodInputSchema,
  nutritionSettingsSchema,
  oilAwarenessSchema,
  quickAddSchema,
  recipePerServing,
  scaleNutrients,
  targetOverrideSchema,
  type Food,
  type FoodEntry,
  type FoodInput,
  type FoodSource,
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
import type { SqlExecutor } from '../sql-executor';

/**
 * Nutrition, in SQL.
 *
 * Canonical units throughout — kilocalories, grams, millilitres, kilograms —
 * and every entry stores the numbers it was logged with. Settings live on the
 * onboarding row (`nutrition_profile`) and units on `preferences`, so the
 * same facts are never stored twice.
 */
type Num = string | number | null;
const num = (value: Num) => (value === null ? null : Number(value));
const iso = (value: string | Date) => new Date(value).toISOString();

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  serving_label: string;
  serving_grams: Num;
  calories: Num;
  protein_g: Num;
  carbs_g: Num;
  fat_g: Num;
  fiber_g: Num;
  source: FoodSource | null;
  is_favourite: boolean;
  ingredients: { foodId: string; servings: number }[];
  servings_made: Num;
  archived_at: string | Date | null;
}

interface EntryRow {
  id: string;
  local_date: string;
  slot: MealSlot;
  food_id: string | null;
  description: string | null;
  quantity: Num;
  calories: Num;
  protein_g: Num;
  carbs_g: Num;
  fat_g: Num;
  fiber_g: Num;
  source: FoodEntry['source'] | null;
  created_at: string | Date;
}

const FOOD_COLUMNS = `id, name, brand, serving_label, serving_grams, calories, protein_g, carbs_g,
  fat_g, fiber_g, source, is_favourite, ingredients, servings_made, archived_at`;

const ENTRY_COLUMNS = `e.id, m.local_date::text as local_date, m.slot, e.food_id, e.description,
  e.quantity, e.calories, e.protein_g, e.carbs_g, e.fat_g, e.fiber_g, e.source, e.created_at`;

function nutrientsOf(
  row: Pick<FoodRow, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'>,
): Nutrients {
  return {
    kcal: num(row.calories),
    proteinG: num(row.protein_g),
    carbsG: num(row.carbs_g),
    fatG: num(row.fat_g),
    fiberG: num(row.fiber_g),
  };
}

function toFood(row: FoodRow): Food {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    servingLabel: row.serving_label,
    servingGrams: num(row.serving_grams),
    nutrients: nutrientsOf(row),
    source: row.source ?? 'estimate',
    favourite: row.is_favourite,
    ingredients: row.ingredients,
    servingsMade: num(row.servings_made),
    archived: row.archived_at !== null,
  };
}

function toEntry(row: EntryRow): FoodEntry {
  return {
    id: row.id,
    localDate: row.local_date,
    slot: row.slot,
    foodId: row.food_id,
    description: row.description ?? '',
    servings: num(row.quantity),
    nutrients: nutrientsOf(row),
    source: row.source ?? 'quick-add',
    createdAt: iso(row.created_at),
  };
}

export function createSqlNutrition(executor: SqlExecutor) {
  async function food(userId: string, foodId: string): Promise<Food> {
    const result = await executor.query<FoodRow>(
      `select ${FOOD_COLUMNS} from public.foods where id = $2 and user_id = $1`,
      [userId, foodId],
    );
    if (!result.rows[0]) throw new RecordNotFoundError('No such food for this account.');
    return toFood(result.rows[0]);
  }

  async function entry(userId: string, entryId: string): Promise<FoodEntry> {
    const result = await executor.query<EntryRow>(
      `select ${ENTRY_COLUMNS} from public.food_entries e join public.meals m on m.id = e.meal_id
        where e.user_id = $1 and e.id = $2`,
      [userId, entryId],
    );
    if (!result.rows[0]) throw new RecordNotFoundError('No such entry for this account.');
    return toEntry(result.rows[0]);
  }

  async function mealId(
    userId: string,
    localDate: string,
    timeZone: string,
    slot: MealSlot,
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `insert into public.meals (user_id, local_date, timezone, slot) values ($1, $2, $3, $4)
       on conflict (user_id, local_date, slot) do update set timezone = public.meals.timezone
       returning id`,
      [userId, localDate, timeZone, slot],
    );
    return result.rows[0]!.id;
  }

  async function insertEntry(
    userId: string,
    meal: string,
    values: {
      foodId: string | null;
      description: string;
      servings: number | null;
      nutrients: Nutrients;
      source: FoodEntry['source'];
      clientToken: string | null;
    },
  ): Promise<string> {
    const n = values.nutrients;
    const result = await executor.query<{ id: string }>(
      `insert into public.food_entries
         (user_id, meal_id, food_id, description, quantity, unit, calories, protein_g, carbs_g,
          fat_g, fiber_g, source, client_token)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        userId,
        meal,
        values.foodId,
        values.description,
        values.servings,
        values.servings === null ? null : 'serving',
        n.kcal,
        n.proteinG,
        n.carbsG,
        n.fatG,
        n.fiberG,
        values.source,
        values.clientToken,
      ],
    );
    return result.rows[0]!.id;
  }

  async function nutrientsFor(
    userId: string,
    parsed: ReturnType<typeof foodInputSchema.parse>,
    selfId?: string,
  ): Promise<Nutrients> {
    if (parsed.source !== 'recipe') return parsed.nutrients;
    const ingredients = [];
    for (const ingredient of parsed.ingredients) {
      if (ingredient.foodId === selfId)
        throw new InvalidWriteError('A recipe cannot contain itself.');
      ingredients.push({
        food: await food(userId, ingredient.foodId),
        servings: ingredient.servings,
      });
    }
    return recipePerServing(ingredients, parsed.servingsMade!).nutrients;
  }

  return {
    async getNutritionSettings(userId: string): Promise<NutritionSettings> {
      const result = await executor.query<{
        goal: string | null;
        activity: string | null;
        sex_for_calculation: string | null;
        birth_year: number | null;
        height_cm: Num;
        hide_calorie_numbers: boolean | null;
        hide_all_numbers: boolean | null;
        eating_disorder_caution: boolean | null;
        prescribed_diet: boolean | null;
        weight_trend_enabled: boolean | null;
        unit_system: string | null;
      }>(
        `select n.goal, n.activity, n.sex_for_calculation, n.birth_year, n.height_cm,
                n.hide_calorie_numbers, n.hide_all_numbers, n.eating_disorder_caution,
                n.prescribed_diet, n.weight_trend_enabled, p.unit_system
           from public.profiles pr
           left join public.nutrition_profile n on n.user_id = pr.id
           left join public.preferences p on p.user_id = pr.id
          where pr.id = $1`,
        [userId],
      );
      const row = result.rows[0];
      const defined = <T>(value: T | null | undefined) =>
        value === null || value === undefined ? undefined : value;
      return nutritionSettingsSchema.parse({
        goal: defined(row?.goal),
        activity: defined(row?.activity),
        sex: defined(row?.sex_for_calculation),
        birthYear: row?.birth_year ?? null,
        heightCm: num(row?.height_cm ?? null),
        hideCalorieNumbers: defined(row?.hide_calorie_numbers),
        hideAllNumbers: defined(row?.hide_all_numbers),
        eatingDisorderCaution: defined(row?.eating_disorder_caution),
        prescribedDiet: defined(row?.prescribed_diet),
        weightTrendEnabled: defined(row?.weight_trend_enabled),
        unitSystem: defined(row?.unit_system),
      });
    },

    async saveNutritionSettings(userId: string, settings: NutritionSettings) {
      const parsed = nutritionSettingsSchema.parse(settings);
      await executor.query(
        `insert into public.nutrition_profile
           (user_id, goal, activity, sex_for_calculation, birth_year, height_cm, hide_calorie_numbers,
            hide_all_numbers, eating_disorder_caution, prescribed_diet, weight_trend_enabled)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (user_id) do update set
           goal = excluded.goal, activity = excluded.activity,
           sex_for_calculation = excluded.sex_for_calculation, birth_year = excluded.birth_year,
           height_cm = excluded.height_cm, hide_calorie_numbers = excluded.hide_calorie_numbers,
           hide_all_numbers = excluded.hide_all_numbers,
           eating_disorder_caution = excluded.eating_disorder_caution,
           prescribed_diet = excluded.prescribed_diet,
           weight_trend_enabled = excluded.weight_trend_enabled`,
        [
          userId,
          parsed.goal,
          parsed.activity,
          parsed.sex,
          parsed.birthYear,
          parsed.heightCm,
          parsed.hideCalorieNumbers,
          parsed.hideAllNumbers,
          parsed.eatingDisorderCaution,
          parsed.prescribedDiet,
          parsed.weightTrendEnabled,
        ],
      );
      await executor.query(
        `insert into public.preferences (user_id, unit_system) values ($1, $2)
         on conflict (user_id) do update set unit_system = excluded.unit_system`,
        [userId, parsed.unitSystem],
      );
      return parsed;
    },

    async getTargetOverride(userId: string): Promise<TargetOverride | null> {
      const result = await executor.query<{
        calories: Num;
        protein_g: Num;
        carbs_g: Num;
        fat_g: Num;
        fiber_g: Num;
        water_ml: Num;
        from_clinician: boolean;
      }>(
        `select calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, from_clinician
           from public.nutrition_targets where user_id = $1 and effective_to is null and is_enabled`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return targetOverrideSchema.parse({
        kcal: num(row.calories),
        proteinG: num(row.protein_g),
        carbsG: num(row.carbs_g),
        fatG: num(row.fat_g),
        fiberG: num(row.fiber_g),
        waterMl: num(row.water_ml),
        fromClinician: row.from_clinician,
      });
    },

    async saveTargetOverride(userId: string, override: TargetOverride | null, at: Date) {
      const today = at.toISOString().slice(0, 10);
      // History is kept: the current row is closed rather than overwritten.
      await executor.query(
        `update public.nutrition_targets set effective_to = greatest(effective_from, $2::date)
          where user_id = $1 and effective_to is null`,
        [userId, today],
      );
      if (override === null) return null;
      const parsed = targetOverrideSchema.parse(override);
      await executor.query(
        `insert into public.nutrition_targets
           (user_id, effective_from, calories, protein_g, carbs_g, fat_g, fiber_g, water_ml,
            from_clinician, is_enabled)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [
          userId,
          today,
          parsed.kcal === null ? null : Math.round(parsed.kcal),
          parsed.proteinG,
          parsed.carbsG,
          parsed.fatG,
          parsed.fiberG,
          parsed.waterMl,
          parsed.fromClinician,
        ],
      );
      return parsed;
    },

    async listFoods(userId: string) {
      const result = await executor.query<FoodRow>(
        `select ${FOOD_COLUMNS} from public.foods
          where user_id = $1 and archived_at is null
          order by is_favourite desc, name`,
        [userId],
      );
      return result.rows.map(toFood);
    },

    async saveFood(userId: string, input: { id?: string; food: FoodInput }) {
      const parsed = foodInputSchema.parse(input.food);
      if (input.id) await food(userId, input.id);
      const nutrients = await nutrientsFor(userId, parsed, input.id);
      const params = [
        userId,
        parsed.name,
        parsed.brand,
        parsed.servingLabel,
        parsed.servingGrams,
        nutrients.kcal,
        nutrients.proteinG,
        nutrients.carbsG,
        nutrients.fatG,
        nutrients.fiberG,
        parsed.source,
        JSON.stringify(parsed.source === 'recipe' ? parsed.ingredients : []),
        parsed.source === 'recipe' ? parsed.servingsMade : null,
      ];
      const result = input.id
        ? await executor.query<FoodRow>(
            `update public.foods set name = $2, brand = $3, serving_label = $4, serving_grams = $5,
               calories = $6, protein_g = $7, carbs_g = $8, fat_g = $9, fiber_g = $10, source = $11,
               ingredients = $12::jsonb, servings_made = $13
             where user_id = $1 and id = $14 returning ${FOOD_COLUMNS}`,
            [...params, input.id],
          )
        : await executor.query<FoodRow>(
            `insert into public.foods
               (user_id, name, brand, serving_label, serving_grams, calories, protein_g, carbs_g,
                fat_g, fiber_g, source, ingredients, servings_made)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
             returning ${FOOD_COLUMNS}`,
            params,
          );
      return toFood(result.rows[0]!);
    },

    async setFoodFavourite(userId: string, foodId: string, favourite: boolean) {
      await food(userId, foodId);
      const result = await executor.query<FoodRow>(
        `update public.foods set is_favourite = $3 where user_id = $1 and id = $2 returning ${FOOD_COLUMNS}`,
        [userId, foodId, favourite],
      );
      return toFood(result.rows[0]!);
    },

    async archiveFood(userId: string, foodId: string) {
      await food(userId, foodId);
      await executor.query(
        `update public.foods set archived_at = now() where user_id = $1 and id = $2`,
        [userId, foodId],
      );
    },

    async listFoodEntries(userId: string, range: { from: string; to: string }) {
      const result = await executor.query<EntryRow>(
        `select ${ENTRY_COLUMNS} from public.food_entries e join public.meals m on m.id = e.meal_id
          where e.user_id = $1 and m.local_date between $2 and $3
          order by m.local_date, array_position($4::text[], m.slot), e.created_at`,
        [userId, range.from, range.to, [...MEAL_SLOTS]],
      );
      return result.rows.map(toEntry);
    },

    async addFoodEntry(userId: string, input: AddFoodEntryInput) {
      const seen = await executor.query<{ id: string }>(
        `select id from public.food_entries where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );
      if (seen.rows[0]) return entry(userId, seen.rows[0].id);

      const meal = await mealId(userId, input.localDate, input.timeZone, input.slot);
      let id: string;
      if ('foodId' in input) {
        if (!(input.servings > 0 && input.servings <= 50))
          throw new InvalidWriteError('Servings must be between 0 and 50.');
        const source = await food(userId, input.foodId);
        id = await insertEntry(userId, meal, {
          foodId: source.id,
          description: source.name,
          servings: input.servings,
          nutrients: scaleNutrients(source.nutrients, input.servings),
          source: source.source,
          clientToken: input.clientToken,
        });
      } else {
        const quick = quickAddSchema.parse(input.quickAdd);
        id = await insertEntry(userId, meal, {
          foodId: null,
          description: quick.description,
          servings: null,
          nutrients: quick.nutrients,
          source: 'quick-add',
          clientToken: input.clientToken,
        });
      }
      return entry(userId, id);
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
      const current = await entry(userId, entryId);
      let nutrients = current.nutrients;
      let description = current.description;
      let servings = current.servings;
      if (patch.servings !== undefined) {
        if (current.foodId === null || current.servings === null)
          throw new InvalidWriteError('A quick add has no servings to change.');
        if (!(patch.servings > 0 && patch.servings <= 50))
          throw new InvalidWriteError('Servings must be between 0 and 50.');
        nutrients = scaleNutrients(
          scaleNutrients(current.nutrients, 1 / current.servings),
          patch.servings,
        );
        servings = patch.servings;
      }
      if (patch.quickAdd !== undefined) {
        if (current.source !== 'quick-add')
          throw new InvalidWriteError('Only a quick add can be rewritten.');
        const quick = quickAddSchema.parse(patch.quickAdd);
        nutrients = quick.nutrients;
        description = quick.description;
      }
      const meal =
        patch.slot !== undefined && patch.slot !== current.slot
          ? await mealId(
              userId,
              current.localDate,
              (
                await executor.query<{ timezone: string }>(
                  `select m.timezone from public.food_entries e join public.meals m on m.id = e.meal_id where e.id = $1`,
                  [entryId],
                )
              ).rows[0]?.timezone ?? 'UTC',
              patch.slot,
            )
          : null;
      await executor.query(
        `update public.food_entries
            set quantity = $3, description = $4, calories = $5, protein_g = $6, carbs_g = $7,
                fat_g = $8, fiber_g = $9, meal_id = coalesce($10, meal_id)
          where user_id = $1 and id = $2`,
        [
          userId,
          entryId,
          servings,
          description,
          nutrients.kcal,
          nutrients.proteinG,
          nutrients.carbsG,
          nutrients.fatG,
          nutrients.fiberG,
          meal,
        ],
      );
      return entry(userId, entryId);
    },

    async deleteFoodEntry(userId: string, entryId: string) {
      await entry(userId, entryId);
      await executor.query(`delete from public.food_entries where user_id = $1 and id = $2`, [
        userId,
        entryId,
      ]);
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
      const tokenPrefix = `${input.clientToken}:`;
      const seen = await executor.query<{ id: string }>(
        `select id from public.food_entries where user_id = $1 and client_token like $2 order by client_token`,
        [userId, `${tokenPrefix}%`],
      );
      if (seen.rows.length > 0) return Promise.all(seen.rows.map((row) => entry(userId, row.id)));

      const source = await executor.query<EntryRow>(
        `select ${ENTRY_COLUMNS} from public.food_entries e join public.meals m on m.id = e.meal_id
          where e.user_id = $1 and m.local_date = $2 and m.slot = $3 order by e.created_at`,
        [userId, input.fromDate, input.slot],
      );
      if (source.rows.length === 0) return [];
      const meal = await mealId(userId, input.toDate, input.timeZone, input.slot);
      const ids: string[] = [];
      let index = 0;
      for (const row of source.rows.map(toEntry)) {
        index += 1;
        ids.push(
          await insertEntry(userId, meal, {
            foodId: row.foodId,
            description: row.description,
            servings: row.servings,
            nutrients: row.nutrients,
            source: row.source,
            clientToken: `${tokenPrefix}${String(index).padStart(3, '0')}`,
          }),
        );
      }
      return Promise.all(ids.map((id) => entry(userId, id)));
    },

    async addWater(
      userId: string,
      input: { localDate: string; timeZone: string; ml: number; at: Date; clientToken: string },
    ) {
      const columns = `id, local_date::text, ml, logged_at`;
      const seen = await executor.query<{
        id: string;
        local_date: string;
        ml: Num;
        logged_at: string | Date;
      }>(`select ${columns} from public.hydration_logs where user_id = $1 and client_token = $2`, [
        userId,
        input.clientToken,
      ]);
      const toWater = (row: {
        id: string;
        local_date: string;
        ml: Num;
        logged_at: string | Date;
      }): WaterLog => ({
        id: row.id,
        localDate: row.local_date,
        ml: Number(row.ml),
        loggedAt: iso(row.logged_at),
      });
      if (seen.rows[0]) return toWater(seen.rows[0]);
      if (!(input.ml > 0 && input.ml <= 5000))
        throw new InvalidWriteError('Between 1 and 5000 ml at a time.');
      const result = await executor.query<{
        id: string;
        local_date: string;
        ml: Num;
        logged_at: string | Date;
      }>(
        `insert into public.hydration_logs (user_id, local_date, timezone, ml, logged_at, client_token)
         values ($1, $2, $3, $4, $5, $6) returning ${columns}`,
        [
          userId,
          input.localDate,
          input.timeZone,
          input.ml,
          input.at.toISOString(),
          input.clientToken,
        ],
      );
      return toWater(result.rows[0]!);
    },

    async listWater(userId: string, range: { from: string; to: string }) {
      const result = await executor.query<{
        id: string;
        local_date: string;
        ml: Num;
        logged_at: string | Date;
      }>(
        `select id, local_date::text, ml, logged_at from public.hydration_logs
          where user_id = $1 and local_date between $2 and $3 order by logged_at`,
        [userId, range.from, range.to],
      );
      return result.rows.map((row) => ({
        id: row.id,
        localDate: row.local_date,
        ml: Number(row.ml),
        loggedAt: iso(row.logged_at),
      }));
    },

    async deleteWater(userId: string, id: string) {
      const result = await executor.query<{ id: string }>(
        `delete from public.hydration_logs where user_id = $1 and id = $2 returning id`,
        [userId, id],
      );
      if (!result.rows[0]) throw new RecordNotFoundError('No such water entry.');
    },

    async logWeight(
      userId: string,
      input: { localDate: string; timeZone: string; weightKg: number; at: Date },
    ): Promise<WeightPoint> {
      if (!(input.weightKg >= 20 && input.weightKg <= 400))
        throw new InvalidWriteError('That weight does not look right.');
      const weight = Math.round(input.weightKg * 10) / 10;
      await executor.query(
        `insert into public.body_metrics (user_id, local_date, timezone, measured_at, weight_kg)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, local_date) do update set weight_kg = excluded.weight_kg, measured_at = excluded.measured_at`,
        [userId, input.localDate, input.timeZone, input.at.toISOString(), weight],
      );
      return { localDate: input.localDate, weightKg: weight };
    },

    async listWeights(userId: string, range: { from: string; to: string }) {
      const result = await executor.query<{ local_date: string; weight_kg: Num }>(
        `select local_date::text, weight_kg from public.body_metrics
          where user_id = $1 and local_date between $2 and $3 and weight_kg is not null
          order by local_date`,
        [userId, range.from, range.to],
      );
      return result.rows.map((row) => ({
        localDate: row.local_date,
        weightKg: Number(row.weight_kg),
      }));
    },

    async deleteWeight(userId: string, localDate: string) {
      await executor.query(
        `update public.body_metrics set weight_kg = null where user_id = $1 and local_date = $2`,
        [userId, localDate],
      );
    },

    async getOilAwareness(userId: string): Promise<OilAwareness | null> {
      const result = await executor.query<{
        cooking_oils: string[];
        list: OilAwareness['list'];
        label_notes: OilAwareness['labelNotes'];
      }>(`select cooking_oils, list, label_notes from public.oil_awareness where user_id = $1`, [
        userId,
      ]);
      const row = result.rows[0];
      return row
        ? oilAwarenessSchema.parse({
            cookingOils: row.cooking_oils,
            list: row.list,
            labelNotes: row.label_notes,
          })
        : null;
    },

    async saveOilAwareness(userId: string, value: OilAwareness) {
      const parsed = oilAwarenessSchema.parse(value);
      await executor.query(
        `insert into public.oil_awareness (user_id, cooking_oils, list, label_notes)
         values ($1, $2, $3::jsonb, $4::jsonb)
         on conflict (user_id) do update set
           cooking_oils = excluded.cooking_oils, list = excluded.list, label_notes = excluded.label_notes`,
        [
          userId,
          parsed.cookingOils,
          JSON.stringify(parsed.list),
          JSON.stringify(parsed.labelNotes),
        ],
      );
      return parsed;
    },

    async deleteOilAwareness(userId: string) {
      await executor.query(`delete from public.oil_awareness where user_id = $1`, [userId]);
    },
  };
}
