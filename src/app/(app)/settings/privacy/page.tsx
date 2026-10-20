import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { FeatureDeletion } from '@/components/settings-privacy';
import { EmptyState, PageHeader, Section } from '@/components/ui';
import { AUDIT_ACTION_LABEL, DATA_FEATURES, DATA_FEATURE_INFO, formatLocalDate } from '@/domain';
import { withUser } from '@/persistence';
import { deleteFeatureAction } from '../data/actions';

export const metadata: Metadata = { title: 'Privacy' };

export const dynamic = 'force-dynamic';

const sensitive = DATA_FEATURES.filter((feature) => DATA_FEATURE_INFO[feature].sensitive).map(
  (feature) => DATA_FEATURE_INFO[feature].label.toLowerCase(),
);

export default async function PrivacyPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }
  const events = await withUser(user.id, (repository) => repository.listAuditEvents(user.id, 20));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
        }
        title="Privacy"
        lede="What ARETE keeps, where it goes, how long it stays — and how to delete any part of it."
      />

      <Section title="Where your data goes">
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink-muted">
          <li>
            Into your account and nowhere else. No advertising, no data brokers, and no third party
            reads it.
          </li>
          <li>
            Usage analytics are off: events are checked and then dropped on your device. If they are
            ever turned on, it will be your choice, and they will still never include your{' '}
            {sensitive.join(', ')}, or anything religious.
          </li>
          <li>
            ARETE asks only what a module needs. Religion, ethnicity and body weight are never part
            of onboarding.
          </li>
        </ul>
      </Section>

      <Section title="How long it stays">
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink-muted">
          <li>Your entries stay until you delete them, here or all at once.</li>
          <li>Deleting is immediate. Nothing waits in a queue.</li>
          <li>
            The record of sensitive actions below is kept for 400 days, then removed. It records
            what happened and when, never what it contained.
          </li>
          <li>
            Backups held by the database host expire on the host’s schedule; deleted data is not
            restored from them into your account.
          </li>
        </ul>
      </Section>

      <Section title="Delete one part" hint="The rest of your account is left as it is.">
        <FeatureDeletion onDelete={deleteFeatureAction} />
        <p className="mt-3 text-body-sm text-ink-muted">
          To take a copy first, or delete everything, go to{' '}
          <Link href="/settings/data" className="text-accent underline underline-offset-2">
            Your data
          </Link>
          .
        </p>
      </Section>

      <Section
        title="Recent sensitive actions"
        hint="Exports, deletions, health answers, safety notices."
      >
        {events.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-body-sm" data-testid="audit-trail">
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex justify-between gap-4">
                <span className="text-ink">
                  {AUDIT_ACTION_LABEL[event.action]}
                  {event.action === 'delete_feature' &&
                  event.detail &&
                  event.detail in DATA_FEATURE_INFO
                    ? `: ${DATA_FEATURE_INFO[event.detail as keyof typeof DATA_FEATURE_INFO].label}`
                    : ''}
                </span>
                <span className="shrink-0 text-ink-muted">
                  {formatLocalDate(event.at.slice(0, 10), 'short')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
