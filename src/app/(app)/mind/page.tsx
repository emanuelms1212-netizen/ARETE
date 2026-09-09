import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const metadata: Metadata = { title: 'Mind' };

export default function MindPage() {
  return (
    <ModulePlaceholder
      title="Mind"
      question="Meditation, breathwork, practice and journal."
      arrivesIn="stage 7 (meditation, breathwork and cognitive practice)"
      contains={[
        'Meditation packs, chosen by you and never assumed',
        'Breathwork with conservative defaults',
        'Cognitive drills that report practice only, never IQ',
        'Stoic journal and evening reflection',
      ]}
    />
  );
}
