import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const metadata: Metadata = { title: 'Plan' };

export default function PlanPage() {
  return (
    <ModulePlaceholder
      title="Plan"
      question="What are my goals, tasks and habits?"
      arrivesIn="stage 6 (Today, habits, goals, tasks and Pomodoro)"
      contains={[
        'Goals with milestones and projects',
        'Habits with schedules and minimums',
        'Tasks with recurrence',
        'Calendar-aware daily planning',
      ]}
    />
  );
}
