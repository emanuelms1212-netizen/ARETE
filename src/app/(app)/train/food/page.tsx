import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { DayView, FoodTabs, WeekView, type FoodTab } from '@/components/food/food-board';
import { FoodsPanel } from '@/components/food/foods-panel';
import { OilPanel } from '@/components/food/oil-panel';
import { SettingsPanel } from '@/components/food/settings-panel';
import type { FoodActions } from '@/components/food/types';
import { EmptyState, PageHeader } from '@/components/ui';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../../current-day';
import {
  addFoodEntryAction,
  addWaterAction,
  archiveFoodAction,
  copyMealAction,
  deleteFoodEntryAction,
  deleteOilAwarenessAction,
  deleteWaterAction,
  deleteWeightAction,
  logWeightAction,
  saveFoodAction,
  saveNutritionSettingsAction,
  saveOilAwarenessAction,
  saveTargetOverrideAction,
  setFoodFavouriteAction,
  updateFoodEntryAction,
} from './actions';
import { loadFoodContext } from './context';

export const metadata: Metadata = { title: 'Food' };

export const dynamic = 'force-dynamic';

const TABS: readonly FoodTab[] = ['day', 'week', 'foods', 'settings'];

const actions: FoodActions = {
  saveSettings: saveNutritionSettingsAction,
  saveOverride: saveTargetOverrideAction,
  saveFood: saveFoodAction,
  setFavourite: setFoodFavouriteAction,
  archiveFood: archiveFoodAction,
  addEntry: addFoodEntryAction,
  updateEntry: updateFoodEntryAction,
  deleteEntry: deleteFoodEntryAction,
  copyMeal: copyMealAction,
  addWater: addWaterAction,
  deleteWater: deleteWaterAction,
  logWeight: logWeightAction,
  deleteWeight: deleteWeightAction,
  saveOil: saveOilAwarenessAction,
  deleteOil: deleteOilAwarenessAction,
};

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }
  const params = await searchParams;
  const tab: FoodTab = TABS.includes(params.tab as FoodTab) ? (params.tab as FoodTab) : 'day';

  const data = await withUser(user.id, async (repository) => {
    const { localDate } = await resolveCurrentDay(repository, user);
    return loadFoodContext(repository, user.id, localDate, params.date);
  });
  const visibility = { numbers: data.display.numbers, calories: data.display.calories };
  const unitSystem = data.settings.unitSystem;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/train" className="hover:underline">
            Train
          </Link>
        }
        title="Food"
        lede="Log what you eat, with numbers or without. Targets are ranges, never a budget."
      />
      <FoodTabs current={tab} date={data.date} today={data.today} />
      {tab === 'day' ? (
        <DayView
          today={data.today}
          date={data.date}
          earliest={data.earliest}
          entries={data.entries}
          copyable={data.copyable}
          water={data.water}
          totals={data.totals}
          targets={data.targets}
          foods={data.foods}
          visibility={visibility}
          unitSystem={unitSystem}
          actions={actions}
        />
      ) : null}
      {tab === 'week' ? (
        <WeekView
          week={data.week}
          today={data.today}
          targets={data.targets}
          visibility={visibility}
          unitSystem={unitSystem}
        />
      ) : null}
      {tab === 'foods' ? (
        <FoodsPanel
          foods={data.foods}
          visibility={visibility}
          unitSystem={unitSystem}
          oil={data.oil}
          actions={actions}
        />
      ) : null}
      {tab === 'settings' ? (
        <>
          <SettingsPanel
            settings={data.settings}
            override={data.override}
            safeguards={data.safeguards}
            targets={data.targets}
            estimate={data.estimate}
            visibility={data.display}
            latestWeight={data.latestWeight}
            weights={data.weights}
            averages={data.averages}
            trend={data.trend}
            actions={actions}
          />
          <OilPanel oil={data.oil} actions={actions} />
        </>
      ) : null}
    </div>
  );
}
