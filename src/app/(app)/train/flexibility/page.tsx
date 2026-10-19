import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { FlexBoard } from '@/components/flexibility/flex-board';
import { EmptyState, PageHeader } from '@/components/ui';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../../current-day';
import {
  endFlexProgramAction,
  enrolFlexAction,
  finishFlexSessionAction,
  saveFlexCheckinAction,
  setFlexScheduleAction,
  skipFlexSessionAction,
  startFlexSessionAction,
  updateFlexSessionAction,
} from './actions';
import { loadFlexContext } from './context';

export const metadata: Metadata = { title: 'Flexibility' };

export const dynamic = 'force-dynamic';

export default async function FlexibilityPage() {
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
    return { ...(await loadFlexContext(repository, user.id, localDate)), today: localDate };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/train" className="hover:underline">
            Train
          </Link>
        }
        title="Flexibility"
        lede="Short, regular sessions. Mild tension is the aim; pain is the signal to stop."
      />
      <FlexBoard
        program={data.program}
        rightsStatus={data.rightsStatus}
        eligibility={data.eligibility}
        enrolment={data.enrolment}
        sessions={data.sessions}
        checkins={data.checkins}
        running={data.running}
        state={data.state}
        checkinDue={data.checkinDue}
        afterPain={data.afterPain}
        today={data.today}
        onEnrol={enrolFlexAction}
        onSchedule={setFlexScheduleAction}
        onStart={startFlexSessionAction}
        onUpdate={updateFlexSessionAction}
        onFinish={finishFlexSessionAction}
        onSkip={skipFlexSessionAction}
        onCheckin={saveFlexCheckinAction}
        onEnd={endFlexProgramAction}
      />
    </div>
  );
}
