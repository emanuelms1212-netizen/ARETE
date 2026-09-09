import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const metadata: Metadata = { title: 'Train' };

export default function TrainPage() {
  return (
    <ModulePlaceholder
      title="Train"
      question="Workout, flexibility and the body log."
      arrivesIn="stages 8 to 10 (workouts, flexibility, nutrition)"
      contains={[
        'Adaptive workout sessions with vector exercise animations',
        'Four-week mobility programs with pain-aware adaptation',
        'Manual food and macro logging',
        'Optional body log',
      ]}
    />
  );
}
