import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { ResetBoard, type ResetActions } from '@/components/programs/reset-board';
import { EmptyState, PageHeader } from '@/components/ui';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../../current-day';
import {
  acknowledgeColdAction,
  addBreakAction,
  endBreakAction,
  finishResetAction,
  logResetItemAction,
  saveCheckinAction,
  startResetAction,
  updateResetAction,
} from './actions';
import { loadResetContext } from './context';

export const metadata: Metadata = { title: '60-Day Reset' };

export const dynamic = 'force-dynamic';

const actions: ResetActions = {
  start: startResetAction,
  update: updateResetAction,
  acknowledgeCold: acknowledgeColdAction,
  log: logResetItemAction,
  addBreak: addBreakAction,
  endBreak: endBreakAction,
  checkin: saveCheckinAction,
  finish: finishResetAction,
};

export default async function ResetPage() {
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
    return loadResetContext(repository, user.id, localDate);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/programs" className="hover:underline">
            Programmes
          </Link>
        }
        title="60-Day Reset"
        lede="Sixty days of small daily habits — water, movement, study, reading, meditation and sleep — at ranges that fit you."
      />
      <p className="text-body-sm text-ink-muted">
        Based on a reset plan whose PDF is titled “60-Day” but runs 66 days. ARETE runs sixty, and
        offers the last six as an optional extension week. Every number is a suggestion you can
        change.
      </p>
      <ResetBoard
        today={data.today}
        person={data.person}
        defaults={data.defaults}
        enrolment={data.enrolment}
        last={data.last}
        state={data.state}
        length={data.length}
        minimumDay={data.minimumDay}
        targets={data.targets}
        todaysLogs={data.todaysLogs}
        checkinDue={data.checkinDue}
        summary={data.summary}
        lastSummary={data.lastSummary}
        contrastAvailable={data.contrastAvailable}
        coldAcknowledged={data.coldAcknowledged}
        coldUnavailable={data.cold.kind === 'unavailable' ? data.cold.reason : null}
        actions={actions}
      />
    </div>
  );
}
