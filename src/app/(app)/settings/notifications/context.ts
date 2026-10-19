import {
  addDays,
  dueNotifications,
  planNotifications,
  toLocalDate,
  weekdayOf,
  type DayState,
  type IsoDate,
  type NotificationEvent,
  type NotificationPreferences,
  type PlanResult,
  type PlannedNotification,
} from '@/domain';
import type { AreteRepository } from '@/persistence/repository';
import { loadResetContext } from '../../programs/reset/context';

/**
 * Today's reminders, planned from the person's settings and the day's real
 * state, and which of them are due in the in-app inbox now.
 */
export interface NotificationContext {
  readonly today: IsoDate;
  readonly timeZone: string;
  readonly preferences: NotificationPreferences;
  readonly day: DayState;
  readonly plan: PlanResult;
  readonly due: readonly PlannedNotification[];
  readonly events: readonly NotificationEvent[];
}

export async function dayState(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
  timeZone: string,
): Promise<DayState> {
  const [day, review, onboarding, setup, reset] = await Promise.all([
    repository.getDay(userId, today),
    repository.getDayReview(userId, today),
    repository.getOnboarding(userId),
    repository.getTrainingSetup(userId),
    loadResetContext(repository, userId, today),
  ]);
  const pending = day?.commitments.filter((item) => item.status === 'pending') ?? [];
  const completedAt = onboarding.progress.completedAt;
  return {
    localDate: today,
    timeZone,
    hasPlan: (day?.commitments.length ?? 0) > 0,
    reviewWritten: review !== null,
    openItems: pending
      .filter((item) => item.kind === 'habit' || item.kind === 'task')
      .map((item) => ({ id: item.id, title: item.title, kind: item.kind })),
    trainingToday:
      pending.some((item) => item.kind === 'workout') ||
      (setup?.trainingWeekdays.includes(weekdayOf(today)) ?? false),
    programDay: reset.state?.kind === 'active' ? reset.state.programDay : null,
    isWeekReviewDay: weekdayOf(today) === 0,
    firstDay: completedAt !== null && toLocalDate(new Date(completedAt), timeZone) === today,
  };
}

export async function loadNotificationContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
  timeZone: string,
  now: Date,
): Promise<NotificationContext> {
  const [preferences, day, events] = await Promise.all([
    repository.getNotificationPreferences(userId),
    dayState(repository, userId, today, timeZone),
    repository.listNotificationEvents(userId, { from: addDays(today, -7), to: today }),
  ]);
  const plan = planNotifications(preferences, day);
  return {
    today,
    timeZone,
    preferences,
    day,
    plan,
    due: dueNotifications(
      plan.planned,
      events.filter((event) => event.localDate === today),
      now,
    ),
    events,
  };
}
