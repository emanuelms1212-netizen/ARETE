import type { FoodInput, MealSlot } from '@/domain';
import { DEMO_TODAY } from './demo-data';
import { addDays } from '@/domain';

/**
 * The demo account's food log.
 *
 * Every number here is made up, on purpose, and every food says so: its
 * source is `synthetic-demo`, which the screen labels "Synthetic demo values —
 * not real nutrition data" wherever the food appears. The brief is explicit
 * that demo foods must be visibly synthetic or properly sourced; inventing
 * plausible-looking numbers and presenting them as real would be the one
 * thing worse than an empty demo.
 */
const demo = (
  name: string,
  servingLabel: string,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  fiberG: number,
  favourite = false,
): FoodInput & { favourite: boolean } => ({
  name,
  servingLabel,
  nutrients: { kcal, proteinG, carbsG, fatG, fiberG },
  source: 'synthetic-demo',
  favourite,
});

export function demoNutrition() {
  const yesterday = addDays(DEMO_TODAY, -1);
  const foods = [
    demo('Demo porridge', '1 bowl', 300, 11, 50, 7, 7, true),
    demo('Demo yoghurt', '1 pot', 120, 10, 9, 5, 0, true),
    demo('Demo lentil soup', '1 bowl', 280, 16, 40, 5, 11),
    demo('Demo chicken salad', '1 plate', 420, 35, 18, 22, 6),
    demo('Demo apple', '1 medium', 80, 0, 21, 0, 4),
  ];
  const entries: { localDate: string; slot: MealSlot; foodIndex: number; servings: number }[] = [
    { localDate: yesterday, slot: 'breakfast', foodIndex: 0, servings: 1 },
    { localDate: yesterday, slot: 'breakfast', foodIndex: 1, servings: 1 },
    { localDate: yesterday, slot: 'lunch', foodIndex: 2, servings: 1 },
    { localDate: yesterday, slot: 'dinner', foodIndex: 3, servings: 1 },
    { localDate: DEMO_TODAY, slot: 'breakfast', foodIndex: 0, servings: 1 },
    { localDate: DEMO_TODAY, slot: 'snack', foodIndex: 4, servings: 1 },
  ];
  const water = [
    { localDate: yesterday, ml: 500 },
    { localDate: yesterday, ml: 750 },
    { localDate: DEMO_TODAY, ml: 500 },
  ];
  return { foods, entries, water };
}
