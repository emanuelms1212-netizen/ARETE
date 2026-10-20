import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { ContrastBoard, type ContrastActions } from '@/components/programs/contrast-board';
import { EmptyState, PageHeader } from '@/components/ui';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../../current-day';
import { disableContrastAction, recordSessionAction, saveScreeningAction } from './actions';
import { loadContrastContext } from './context';

export const metadata: Metadata = { title: 'Contrast therapy' };

export const dynamic = 'force-dynamic';

const actions: ContrastActions = {
  saveScreening: saveScreeningAction,
  record: recordSessionAction,
  disable: disableContrastAction,
};

export default async function ContrastPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }
  const data = await withUser(user.id, async (repository) => {
    const { localDate } = await resolveCurrentDay(repository, user);
    return loadContrastContext(repository, user.id, localDate);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/programs" className="hover:underline">
            Programmes
          </Link>
        }
        title="Contrast therapy"
        lede="Optional and advanced: alternating heat and cold, with a timer that is easy to stop. Never part of a streak."
      />
      <ContrastBoard
        screening={data.screening}
        eligibility={data.eligibility}
        minor={data.minor}
        offered={data.offered}
        hints={data.hints}
        sessions={data.sessions}
        actions={actions}
      />
    </div>
  );
}
