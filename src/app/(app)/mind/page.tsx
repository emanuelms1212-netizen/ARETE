import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/module-placeholder';
import { BreathingRing, Section } from '@/components/ui';

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
      preview={
        <Section
          title="Breathing pacer"
          hint="Working today. Nothing is recorded until the Mind module is built."
        >
          <div className="py-4">
            <BreathingRing />
          </div>
          <p className="mt-2 text-body-sm text-ink-muted">
            A long exhale is the part of paced breathing the evidence is comfortable with, and that
            is all this claims to be. It is not a treatment for anxiety or anything else. With
            reduced motion on, the ring rests still and the written cue keeps the pacing.
          </p>
        </Section>
      }
    />
  );
}
