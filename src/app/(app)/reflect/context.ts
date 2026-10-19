import {
  addDays,
  daysBetween,
  weekStart,
  type IsoDate,
  type WeekFacts,
  type WeeklyPromptKey,
} from '@/domain';
import type { AreteRepository, JournalDay } from '@/persistence/repository';

/**
 * The weekly review: what happened, from the records, beside what the person
 * makes of it. Weeks run Monday to Sunday in the person's own local days.
 */
export interface ReflectContext {
  readonly today: IsoDate;
  readonly week: IsoDate;
  readonly facts: WeekFacts;
  readonly answers: Partial<Record<WeeklyPromptKey, string>>;
  readonly journal: readonly JournalDay[];
  readonly previousWeek: IsoDate;
  readonly nextWeek: IsoDate | null;
}

/** A week the client asked for, if it is a Monday within the last year and not in the future. */
export function acceptWeek(requested: string | undefined, today: IsoDate): IsoDate {
  const current = weekStart(today);
  if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested) || Number.isNaN(Date.parse(requested)))
    return current;
  const monday = weekStart(requested);
  const back = daysBetween(monday, current);
  return back >= 0 && back <= 371 ? monday : current;
}

export async function weekFacts(
  repository: AreteRepository,
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<WeekFacts> {
  const dates = Array.from({ length: daysBetween(from, to) + 1 }, (_, index) =>
    addDays(from, index),
  );
  const [days, framings, focus, workouts, mind, food, resetDone, contrast, journal] =
    await Promise.all([
      repository.listDays(userId, { from, to }),
      Promise.all(dates.map((date) => repository.getFraming(userId, date))),
      Promise.all(dates.map((date) => repository.listFocusSessions(userId, date))),
      repository.listWorkouts(userId, { limit: 60 }),
      repository.listMindHistory(userId, { limit: 200 }),
      repository.listFoodEntries(userId, { from, to }),
      repository.countResetDone(userId, { from, to }),
      repository.listContrastSessions(userId, { from, to }),
      repository.listJournal(userId, { from, to }),
    ]);
  const inWeek = (date: string) => date >= from && date <= to;
  const planned = days.filter((day) => day.commitments.length > 0);
  return {
    from,
    to,
    daysPlanned: planned.length,
    commitmentsDone: planned.reduce(
      (sum, day) => sum + day.commitments.filter((item) => item.status === 'done').length,
      0,
    ),
    commitmentsTotal: planned.reduce((sum, day) => sum + day.commitments.length, 0),
    minimumDays: framings.filter((framing) => framing.minimumMode).length,
    focusMinutes: Math.round(
      focus.flat().reduce((sum, session) => sum + session.actualSeconds, 0) / 60,
    ),
    workouts: workouts.filter(
      (workout) => workout.status === 'completed' && inWeek(workout.localDate),
    ).length,
    mindSessions: mind.filter((entry) => entry.status === 'completed' && inWeek(entry.localDate))
      .length,
    foodDays: new Set(food.map((entry) => entry.localDate)).size,
    resetItemsDone: resetDone,
    contrastSessions: contrast.length,
    journalDays: journal.length,
  };
}

export async function loadReflectContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
  requestedWeek?: string,
): Promise<ReflectContext> {
  const week = acceptWeek(requestedWeek, today);
  const end = addDays(week, 6);
  const to = end < today ? end : today;
  const [facts, answers, journal] = await Promise.all([
    weekFacts(repository, userId, week, to),
    repository.getWeeklyReview(userId, week),
    repository.listJournal(userId, { from: week, to }),
  ]);
  const next = addDays(week, 7);
  return {
    today,
    week,
    facts,
    answers,
    journal: [...journal].reverse(),
    previousWeek: addDays(week, -7),
    nextWeek: next <= weekStart(today) ? next : null,
  };
}
