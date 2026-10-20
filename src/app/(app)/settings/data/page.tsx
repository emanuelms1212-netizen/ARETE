import type { Metadata } from 'next';
import Link from 'next/link';
import { DeleteEverything } from '@/components/settings-data';
import { PageHeader, Section } from '@/components/ui';
import { isDemoMode } from '@/lib/env';
import { deleteEverythingAction } from './actions';

const DELETE_PHRASE = 'delete everything';

export const metadata: Metadata = { title: 'Your data' };

export const dynamic = 'force-dynamic';

export default function DataPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
        }
        title="Your data"
        lede="It is yours: take a copy whenever you like, or delete it all at once."
      />
      <Section
        title="Export"
        hint="One JSON file with everything this account holds, and nobody else's."
      >
        <a
          href="/api/export"
          download
          className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 text-body text-ink hover:bg-sunken"
        >
          Download everything
        </a>
        <p className="mt-2 text-body-sm text-ink-muted">
          For a date range, use Export on the Progress page. To delete just one part, such as the
          journal or the food log, use{' '}
          <Link href="/settings/privacy" className="text-accent underline underline-offset-2">
            Privacy
          </Link>
          .
        </p>
      </Section>
      <Section title="Delete" hint="Immediate and complete. There is no queue and no recovery.">
        {isDemoMode ? (
          <p className="mb-3 text-body-sm text-ink-muted">
            In demo mode this clears the shared demo account until the server restarts.
          </p>
        ) : null}
        <DeleteEverything phrase={DELETE_PHRASE} onDelete={deleteEverythingAction} />
      </Section>
    </div>
  );
}
