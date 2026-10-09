import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/ui';
import { appConfig } from '@/lib/app-config';
import { env } from '@/lib/env';
import packageJson from '../../../../package.json';

export const metadata: Metadata = { title: 'Settings' };

const plannedSections: readonly { name: string; stage: string }[] = [
  { name: 'Profile and preferences', stage: 'stage 5' },
  { name: 'Programs — 66-Day Reset, mobility, meditation packs', stage: 'stage 11' },
  { name: 'Modules, including opt-in safety modules', stage: 'stage 13' },
  { name: 'Notifications', stage: 'stage 12' },
  { name: 'Data — export and delete', stage: 'stage 13' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" lede={appConfig.tagline} />

      <Section title="This build">
        <dl className="space-y-2 text-body">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Version</dt>
            <dd className="font-mono text-ink">{packageJson.version}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Mode</dt>
            <dd className="font-mono text-ink">{env.NEXT_PUBLIC_APP_MODE}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Analytics</dt>
            <dd className="font-mono text-ink">{env.NEXT_PUBLIC_ANALYTICS_SINK} (no-op)</dd>
          </div>
        </dl>
        <p className="mt-3 text-body-sm text-ink-muted">
          In demo mode the app reads a fixed, deterministic sample through the same repository
          interface real data will use. No account exists yet and nothing is written anywhere.
        </p>
      </Section>

      <Section
        title="Planned sections"
        hint="Listed as text, not as links, because none of them exist yet."
      >
        <ul className="space-y-2">
          {plannedSections.map((section) => (
            <li key={section.name} className="flex justify-between gap-4 text-body">
              <span className="text-ink">{section.name}</span>
              <span className="shrink-0 text-ink-muted">{section.stage}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
