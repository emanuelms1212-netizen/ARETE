import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { PlanBoard } from '@/components/plan/plan-board';
import { EmptyState, PageHeader } from '@/components/ui';
import { addDays, rollingConsistency, type HabitDay, type HabitLog, type IsoDate } from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../current-day';
import type { TaskView } from '@/persistence/repository';
import {
  addMilestoneAction,
  archiveGoalAction,
  createGoalAction,
  createHabitAction,
  createTaskAction,
  logHabitAction,
  recordMeasurementAction,
  saveGoalReviewAction,
  scheduleTaskAction,
  setTaskStatusAction,
  toggleMilestoneAction,
} from './actions';

export const metadata: Metadata = { title: 'Plan' };

/** Per-user data, read per request — never prerendered into the build. */
export const dynamic = 'force-dynamic';

const HISTORY_DAYS = 30;

/**
 * Builds the day-by-day history a streak is computed from.
 *
 * Every day in the window is included, logged or not, because `outcomeFor`
 * needs the difference between "not scheduled", "not yet" and "missed" — only
 * the caller knows which days were actually asked for.
 *
 * Days before the habit's first activity are marked unscheduled rather than
 * missed. Without that, a habit kept every day since it was created a week ago
 * reports single-digit consistency, because the twenty-three days before it
 * existed count against it. The first log stands in for a creation date; when
 * habit schedules arrive, the schedule in force on each day replaces this.
 */
function historyFor(
  habitId: string,
  logs: readonly HabitLog[],
  from: IsoDate,
  to: IsoDate,
): HabitDay[] {
  const own = logs.filter((log) => log.habitId === habitId);
  const byDate = new Map(own.map((log) => [log.localDate, log]));
  const begins = own.reduce<IsoDate | null>(
    (earliest, log) => (earliest === null || log.localDate < earliest ? log.localDate : earliest),
    null,
  );

  const days: HabitDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push({
      localDate: date,
      scheduled: begins !== null && date >= begins,
      log: byDate.get(date) ?? null,
    });
  }
  return days;
}

export default async function PlanPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }

  const data = await withUser(user.id, async (repository) => {
    // The same answer Today uses, so the demo account's seeded history is not
    // rendered as months stale while Today shows it as current.
    const { localDate: today } = await resolveCurrentDay(repository, user);
    const windowStart = addDays(today, -(HISTORY_DAYS - 1));

    const views: TaskView[] = ['inbox', 'today', 'upcoming', 'someday'];
    const tasksByView = {} as Record<TaskView, Awaited<ReturnType<typeof repository.listTasks>>>;
    const counts: Record<string, number> = {};
    for (const view of views) {
      const list = await repository.listTasks(user.id, { view, today });
      tasksByView[view] = list;
      counts[view] = list.length;
    }
    tasksByView.all = [];

    const goalList = await repository.listGoals(user.id);
    const goals = await Promise.all(
      goalList.map(async (goal) => {
        const detail = await repository.getGoal(user.id, goal.id);
        return {
          goal,
          measurements: detail?.measurements ?? [],
          milestones: detail?.milestones ?? [],
          // Due when this week has not been reviewed yet.
          reviewDue: detail?.latestReview === null || detail?.latestReview === undefined,
        };
      }),
    );

    const habitList = await repository.listHabits(user.id);
    const logs = await repository.listHabitLogs(user.id, { from: windowStart, to: today });
    const habits = habitList.map(({ habit }) => {
      const history = historyFor(habit.id, logs, windowStart, today);
      return {
        habit,
        todayLog: history[history.length - 1]?.log ?? null,
        streak: rollingConsistency(habit, history, {
          endingOn: today,
          windowDays: HISTORY_DAYS,
          today,
        }),
        history,
      };
    });

    return { goals, habits, tasksByView, counts, today, tomorrow: addDays(today, 1) };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plan"
        lede="What you are working towards, what is on the list, and what you do most days."
      />
      <nav aria-label="More in Plan" className="grid grid-cols-2 gap-3">
        <Link
          href="/programs"
          className="rounded-xl border border-line bg-surface p-3 hover:border-line-strong"
        >
          <span className="block text-body font-semibold text-ink">Programmes</span>
          <span className="block text-body-sm text-ink-muted">60-Day Reset and more</span>
        </Link>
        <Link
          href="/reflect"
          className="rounded-xl border border-line bg-surface p-3 hover:border-line-strong"
        >
          <span className="block text-body font-semibold text-ink">Journal</span>
          <span className="block text-body-sm text-ink-muted">Days and the weekly review</span>
        </Link>
      </nav>

      <PlanBoard
        goals={data.goals}
        habits={data.habits}
        tasksByView={data.tasksByView}
        counts={data.counts}
        today={data.today}
        tomorrow={data.tomorrow}
        goalHandlers={{
          onCreate: createGoalAction,
          onMeasure: recordMeasurementAction,
          onToggleMilestone: toggleMilestoneAction,
          onAddMilestone: addMilestoneAction,
          onArchive: archiveGoalAction,
          onReview: saveGoalReviewAction,
        }}
        taskHandlers={{
          onCreate: createTaskAction,
          onSetStatus: setTaskStatusAction,
          onSchedule: scheduleTaskAction,
        }}
        habitHandlers={{ onCreate: createHabitAction, onLog: logHabitAction }}
      />
    </div>
  );
}
