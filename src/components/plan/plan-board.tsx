'use client';

import { useState } from 'react';
import { SegmentedControl } from '@/components/ui';
import type { TaskView } from '@/persistence/repository';
import { GoalsPanel, type GoalsPanelProps } from './goals-panel';
import { HabitsPanel, type HabitsPanelProps } from './habits-panel';
import { TasksPanel, type TasksPanelProps } from './tasks-panel';

/**
 * Three panels behind one control.
 *
 * Phone-first: goals, tasks and habits are three different questions and
 * stacking all of them makes a page nobody scrolls to the bottom of. The tab
 * is client state rather than a route, because switching it should not cost a
 * navigation — and the task *view* inside the tab is separate state for the
 * same reason.
 */
type Tab = 'goals' | 'tasks' | 'habits';

export interface PlanBoardProps {
  readonly goals: GoalsPanelProps['goals'];
  readonly habits: HabitsPanelProps['habits'];
  readonly tasksByView: Readonly<Record<TaskView, TasksPanelProps['tasks']>>;
  readonly counts: Readonly<Record<string, number>>;
  readonly today: string;
  readonly tomorrow: string;
  readonly goalHandlers: Pick<
    GoalsPanelProps,
    'onCreate' | 'onMeasure' | 'onToggleMilestone' | 'onAddMilestone' | 'onArchive' | 'onReview'
  >;
  readonly taskHandlers: Pick<TasksPanelProps, 'onCreate' | 'onSetStatus' | 'onSchedule'>;
  readonly habitHandlers: Pick<HabitsPanelProps, 'onCreate' | 'onLog'>;
}

export function PlanBoard({
  goals,
  habits,
  tasksByView,
  counts,
  today,
  tomorrow,
  goalHandlers,
  taskHandlers,
  habitHandlers,
}: PlanBoardProps) {
  const [tab, setTab] = useState<Tab>('tasks');
  const [view, setView] = useState<TaskView>('inbox');

  return (
    <div className="space-y-4">
      <SegmentedControl
        legend="What to plan"
        hideLegend
        options={[
          { value: 'tasks' as const, label: 'Tasks' },
          { value: 'habits' as const, label: 'Habits' },
          { value: 'goals' as const, label: 'Goals' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'tasks' ? (
        <TasksPanel
          tasks={tasksByView[view]}
          view={view}
          counts={counts}
          onChangeView={setView}
          today={today}
          tomorrow={tomorrow}
          {...taskHandlers}
        />
      ) : null}

      {tab === 'habits' ? <HabitsPanel habits={habits} {...habitHandlers} /> : null}

      {tab === 'goals' ? <GoalsPanel goals={goals} today={today} {...goalHandlers} /> : null}
    </div>
  );
}
