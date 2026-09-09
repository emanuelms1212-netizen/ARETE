import type { Metadata } from 'next';
import { Card, CardHeader } from '@/components/ui';
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
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{appConfig.tagline}</p>
      </div>

      <Card>
        <CardHeader title="This build" />
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--ink-muted)]">Version</dt>
            <dd className="font-mono text-[var(--ink)]">{packageJson.version}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--ink-muted)]">Mode</dt>
            <dd className="font-mono text-[var(--ink)]">{env.NEXT_PUBLIC_APP_MODE}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--ink-muted)]">Analytics</dt>
            <dd className="font-mono text-[var(--ink)]">
              {env.NEXT_PUBLIC_ANALYTICS_SINK} (no-op)
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          In demo mode the app reads a fixed, deterministic sample through the same repository
          interface real data will use. No account exists yet and nothing is written anywhere.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Planned sections"
          hint="Listed as text, not as links, because none of them exist yet."
        />
        <ul className="space-y-2">
          {plannedSections.map((section) => (
            <li key={section.name} className="flex justify-between gap-4 text-sm">
              <span className="text-[var(--ink)]">{section.name}</span>
              <span className="shrink-0 text-[var(--ink-muted)]">{section.stage}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
