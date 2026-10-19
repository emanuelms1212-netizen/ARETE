import type {
  Food,
  FoodEntry,
  FoodInput,
  MealSlot,
  Nutrients,
  NutritionSettings,
  OilAwareness,
  TargetOverride,
  WeightPoint,
} from '@/domain';
import type { WaterLog } from '@/persistence/repository';

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export type QuickAdd = { description: string; nutrients: Nutrients };

/** The server actions the Food screen calls. Passed in, so the components can be tested alone. */
export interface FoodActions {
  readonly saveSettings: (settings: NutritionSettings) => Promise<Result<NutritionSettings>>;
  readonly saveOverride: (
    override: TargetOverride | null,
  ) => Promise<Result<TargetOverride | null>>;
  readonly saveFood: (input: { id?: string; food: FoodInput }) => Promise<Result<Food>>;
  readonly setFavourite: (input: { foodId: string; favourite: boolean }) => Promise<Result<Food>>;
  readonly archiveFood: (foodId: string) => Promise<Result<null>>;
  readonly addEntry: (
    input: { localDate: string; slot: MealSlot; attemptToken: string } & (
      { foodId: string; servings: number } | { quickAdd: QuickAdd }
    ),
  ) => Promise<Result<FoodEntry>>;
  readonly updateEntry: (input: {
    entryId: string;
    servings?: number;
    slot?: MealSlot;
    quickAdd?: QuickAdd;
  }) => Promise<Result<FoodEntry>>;
  readonly deleteEntry: (entryId: string) => Promise<Result<null>>;
  readonly copyMeal: (input: {
    toDate: string;
    slot: MealSlot;
    attemptToken: string;
  }) => Promise<Result<readonly FoodEntry[]>>;
  readonly addWater: (input: {
    localDate: string;
    ml: number;
    attemptToken: string;
  }) => Promise<Result<WaterLog>>;
  readonly deleteWater: (id: string) => Promise<Result<null>>;
  readonly logWeight: (weightKg: number) => Promise<Result<WeightPoint>>;
  readonly deleteWeight: (localDate: string) => Promise<Result<null>>;
  readonly saveOil: (value: OilAwareness) => Promise<Result<OilAwareness>>;
  readonly deleteOil: () => Promise<Result<null>>;
}

export const newAttempt = (): string => crypto.randomUUID();
