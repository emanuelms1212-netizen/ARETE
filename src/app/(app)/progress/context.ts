import {
  addDays,
  consistency,
  daysBetween,
  fillDays,
  narrative,
  nutritionSummary,
  observations,
  observationsPending,
  summariseWorkout,
  rollingConsistency,
  streakFrom,
  PROGRESS_RANGES,
  type ConsistencySummary,
  type DayRecord,
  type IsoDate,
  type NutritionSummary,
  type Observation,
  type ProgressRange,
  type Streak,
} from '@/domain';
import type { AreteRepository } from '@/persistence/repository';

/**
 * Progress for a date range, from every module's own records.
 *
 * Each module's numbers stay in their own units; the page shows them side by
 * side with a sentence each and never adds them up. Nutrition numbers follow
 * the person's own choice to hide them.
 */
export interface HabitProgress {
  readonly id: string;
  readonly title: string;
  readonly streak: Streak;
  readonly rolling: Streak;
}

export interface ProgressContext {
  readonly today: IsoDate;
  readonly range: ProgressRange;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly days: readonly DayRecord[];
  readonly consistency: ConsistencySummary;
  readonly nutrition: NutritionSummary;
  readonly showNutritionNumbers: boolean;
  readonly narrative: readonly string[];
  readonly observations: readonly Observation[];
  readonly observationsPending: string;
  readonly habits: readonly HabitProgress[];
  readonly milestones: readonly { goal: string; title: string; completedOn: IsoDate }[];
  readonly drills: readonly { drill: string; sessions: number; minutes: number }[];
}

export function acceptRange(requested: string | undefined): ProgressRange {
  const value = Number(requested);
  return (PROGRESS_RANGES as readonly number[]).includes(value) ? (value as ProgressRange) : 28;
}

const CARDIO = /^(run_|conditioning|court)/;

export async function dayRecords(
  repository: AreteRepository,
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<DayRecord[]> {
  const [days, minimum, focus, workouts, flex, mind, food, water, journal, settings] =
    await Promise.all([
      repository.listDays(userId, { from, to }),
      repository.listMinimumDays(userId, { from, to }),
      repository.listFocusSessionsBetween(userId, { from, to }),
      repository.listWorkouts(userId, { limit: 400 }),
      repository.listFlexSessionsBetween(userId, { from, to }),
      repository.listMindHistory(userId, { limit: 1000 }),
      repository.listFoodEntries(userId, { from, to }),
      repository.listWater(userId, { from, to }),
      repository.listJournal(userId, { from, to }),
      repository.getNutritionSettings(userId),
    ]);
  const minimumSet = new Set(minimum);
  const journalSet = new Set(journal.map((entry) => entry.localDate));
  const inRange = (date: string) => date >= from && date <= to;

  const records = new Map<string, DayRecord>();
  const touch = (date: string) => {
    const found = records.get(date);
    if (found) return found;
    const fresh = fillDays([], date, date)[0]!;
    records.set(date, fresh);
    return fresh;
  };
  const patch = (date: string, change: (record: DayRecord) => Partial<DayRecord>) => {
    if (!inRange(date)) return;
    const record = touch(date);
    records.set(date, { ...record, ...change(record) });
  };

  for (const day of days) {
    patch(day.date, () => ({
      commitmentsTotal: day.commitments.length,
      commitmentsDone: day.commitments.filter((item) => item.status === 'done').length,
    }));
  }
  for (const date of minimumSet) patch(date, () => ({ minimumDay: true }));
  for (const date of journalSet) patch(date, () => ({ journal: true }));
  for (const session of focus) {
    patch(session.localDate, (record) => ({
      focusMinutes: record.focusMinutes + Math.round(session.actualSeconds / 60),
    }));
  }
  for (const workout of workouts) {
    if (workout.status !== 'completed') continue;
    const summary = summariseWorkout(workout);
    patch(workout.localDate, (record) => ({
      workouts: record.workouts + 1,
      volumeKg: record.volumeKg + summary.volumeKg,
      cardioMinutes:
        record.cardioMinutes + (CARDIO.test(workout.snapshot.kind) ? (summary.minutes ?? 0) : 0),
    }));
  }
  for (const session of flex) {
    if (session.status !== 'completed') continue;
    patch(session.localDate, (record) => ({ mobilitySessions: record.mobilitySessions + 1 }));
  }
  for (const entry of mind) {
    if (entry.status !== 'completed') continue;
    patch(entry.localDate, (record) =>
      entry.kind === 'meditation'
        ? { meditationMinutes: record.meditationMinutes + entry.minutes }
        : entry.kind === 'breathwork'
          ? { breathworkMinutes: record.breathworkMinutes + entry.minutes }
          : { cognitiveSessions: record.cognitiveSessions + 1 },
    );
  }
  const numbersHidden = settings.hideAllNumbers;
  for (const entry of food) {
    patch(entry.localDate, (record) => ({
      foodEntries: record.foodEntries + 1,
      proteinG:
        numbersHidden || entry.nutrients.proteinG === null
          ? record.proteinG
          : (record.proteinG ?? 0) + entry.nutrients.proteinG,
      fiberG:
        numbersHidden || entry.nutrients.fiberG === null
          ? record.fiberG
          : (record.fiberG ?? 0) + entry.nutrients.fiberG,
    }));
  }
  for (const log of water) patch(log.localDate, (record) => ({ waterMl: record.waterMl + log.ml }));

  return fillDays([...records.values()], from, to);
}

export async function loadProgressContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
  requestedRange?: string,
): Promise<ProgressContext> {
  const range = acceptRange(requestedRange);
  const from = addDays(today, -(range - 1));
  const previousFrom = addDays(from, -range);
  const [days, previous, settings, habits, goals, mind] = await Promise.all([
    dayRecords(repository, userId, from, today),
    dayRecords(repository, userId, previousFrom, addDays(from, -1)),
    repository.getNutritionSettings(userId),
    repository.listHabits(userId),
    repository.listGoals(userId),
    repository.listMindHistory(userId, { limit: 1000 }),
  ]);
  const showNutritionNumbers = !settings.hideAllNumbers;

  const allLogs = await repository.listHabitLogs(userId, { from: addDays(today, -365), to: today });
  const habitProgress = habits.map((entry) => {
    const logs = allLogs
      .filter((log) => log.habitId === entry.habit.id)
      .sort((a, b) => a.localDate.localeCompare(b.localDate));
    const byDate = new Map(logs.map((log) => [log.localDate, log]));
    const first = logs[0]?.localDate ?? today;
    const series = Array.from({ length: daysBetween(first, today) + 1 }, (_, offset) => {
      const date = addDays(first, offset);
      return { localDate: date, scheduled: true, log: byDate.get(date) ?? null };
    });
    return {
      id: entry.habit.id,
      title: entry.habit.title,
      streak: streakFrom(entry.habit, series, today),
      rolling: rollingConsistency(entry.habit, series, {
        endingOn: today,
        windowDays: range,
        today,
      }),
    };
  });

  const details = await Promise.all(goals.map((goal) => repository.getGoal(userId, goal.id)));
  const milestones = details.flatMap((detail) =>
    (detail?.milestones ?? [])
      .filter((milestone) => milestone.completedAt !== null)
      .map((milestone) => ({
        goal: detail!.goal.title,
        title: milestone.title,
        completedOn: milestone.completedAt!.toISOString().slice(0, 10),
      }))
      .filter((milestone) => milestone.completedOn >= from && milestone.completedOn <= today),
  );

  const drillMap = new Map<string, { sessions: number; minutes: number }>();
  for (const entry of mind) {
    if (entry.kind !== 'cognitive' || entry.status !== 'completed') continue;
    if (entry.localDate < from || entry.localDate > today) continue;
    const key = entry.drill ?? entry.practiceSlug;
    const current = drillMap.get(key) ?? { sessions: 0, minutes: 0 };
    drillMap.set(key, { sessions: current.sessions + 1, minutes: current.minutes + entry.minutes });
  }

  return {
    today,
    range,
    from,
    to: today,
    days,
    consistency: consistency(days),
    nutrition: nutritionSummary(days),
    showNutritionNumbers,
    narrative: narrative(days, previous, { showNutritionNumbers }),
    observations: observations(days),
    observationsPending: observationsPending(days),
    habits: habitProgress,
    milestones,
    drills: [...drillMap.entries()].map(([drill, value]) => ({ drill, ...value })),
  };
}
