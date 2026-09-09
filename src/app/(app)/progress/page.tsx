import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const metadata: Metadata = { title: 'Progress' };

export default function ProgressPage() {
  return (
    <ModulePlaceholder
      title="Progress"
      question="What patterns are actually there?"
      arrivesIn="stage 12 (progress, weekly review and quiet notifications)"
      contains={[
        'Plan-to-actual ratio across the week',
        'Focus minutes and sessions by type',
        'Habit history without streak pressure',
        'One observation, only when the data supports one',
      ]}
    />
  );
}
