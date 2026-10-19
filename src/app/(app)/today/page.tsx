import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { DemoBadge } from '@/components/demo-badge';
import { DayBoard } from '@/components/today/day-board';
import { EveningReview } from '@/components/today/evening-review';
import { Framing } from '@/components/today/framing';
import { FocusSessionPanel } from '@/components/focus/focus-session';
import { EmptyState, Metric, PageHeader, Section } from '@/components/ui';
import { loadResetContext, type ResetContext } from '../programs/reset/context';
import { computeDayProgress, describeDay, type DayProgress } from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../current-day';
import {
  finishFocusAction,
  pauseFocusAction,
  resumeFocusAction,
  startFocusAction,
} from './focus-actions';
import {
  addCommitmentAction,
  reorderCommitmentsAction,
  saveDayReviewAction,
  setCommitmentStatusAction,
  setFramingAction,
  setMinimumModeAction,
  snoozeCommitmentAction,
} from './actions';

export const metadata: Metadata = { title: 'Today' };

/**
 * Today is the user's own day, read per request. Prerendering it would bake one
 * account's data into the build — harmless in demo mode and wrong in live mode,
 * so it is dynamic in both rather than depending on which mode built it.
 */
export const dynamic = 'force-dynamic';

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * The nudge towards onboarding — a real link to a real flow, shown only while
 * it is still unfinished, and never a wall in front of the app.
 */
function SetUpFirstWeek({ onboarded }: { onboarded: boolean }) {
  if (onboarded) return null;

  return (
    <Section
      title="Set up your first week"
      hint="Four minutes, every question skippable, and nothing is saved until you have seen the whole week."
    >
      <Link
        href="/onboarding"
        className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-body font-medium text-on-accent"
      >
        Start
      </Link>
    </Section>
  );
}

function MinimumDay({ progress }: { progress: DayProgress }) {
  return (
    <Section
      title="Minimum day"
      hint="What you decided a real day looks like. Missing the rest does not erase it."
    >
      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Minimum"
          value={`${progress.minimumDone}/${progress.minimumTotal}`}
          note={progress.minimumDayMet ? 'Met. The rest is a choice.' : 'Still open.'}
          tone={progress.minimumDayMet ? 'success' : 'default'}
        />
        <Metric label="Done" value={progress.done} note={`${progress.pending} still open`} />
        <Metric
          label="Skipped"
          value={progress.skipped}
          note="Left out of the ratio"
          tone="muted"
        />
      </div>
    </Section>
  );
}

function ResetToday({ reset }: { reset: ResetContext }) {
  const state = reset.state;
  if (!reset.enrolment || !state || state.kind === 'not_started') return null;
  const done = reset.todaysLogs.filter((log) => log.status === 'done').length;
  const line =
    state.kind === 'active'
      ? `Day ${state.programDay} of ${reset.length}: ${done} of ${reset.targets.length} done${reset.minimumDay ? ', minimum day' : ''}.`
      : state.kind === 'paused'
        ? 'Paused. The programme waits for you.'
        : state.kind === 'sick'
          ? 'On a sick or injury break. Rest first.'
          : 'All days done. Choose what comes next.';
  return (
    <Section title="60-Day Reset">
      <p className="text-body text-ink" data-testid="today-reset">
        {line}
      </p>
      <Link
        href="/programs/reset"
        className="mt-2 inline-flex min-h-11 items-center text-body-sm text-accent hover:underline"
      >
        Open today’s reset
      </Link>
    </Section>
  );
}

export default async function TodayPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Signing in arrives with the Supabase project. Until then, demo mode is the way in."
      />
    );
  }

  // The page and the actions must agree on which day this screen is about;
  // `resolveCurrentDay` is the one answer both of them use.
  const { day, framing, review, runningFocus, focusTasks, localDate, onboarded, reset } =
    await withUser(user.id, async (repository) => {
      const { localDate: date } = await resolveCurrentDay(repository, user);
      const { progress } = await repository.getOnboarding(user.id);

      return {
        day: await repository.getDay(user.id, date),
        framing: await repository.getFraming(user.id, date),
        review: await repository.getDayReview(user.id, date),
        // Read on the server, so a reload restores a running timer before the
        // page has even hydrated.
        runningFocus: await repository.getRunningFocusSession(user.id),
        focusTasks: (await repository.listTasks(user.id, { view: 'today', today: date })).map(
          (task) => ({ id: task.id, title: task.title }),
        ),
        localDate: date,
        onboarded: progress.completedAt !== null,
        // The reset's day, so Today can say where it stands and link to it.
        reset: await loadResetContext(repository, user.id, date),
      };
    });

  const resolvedDay = day ?? {
    date: localDate,
    mark: 'normal' as const,
    committedAt: null,
    commitments: [],
  };
  const progress = computeDayProgress(resolvedDay);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={longDate(resolvedDay.date)}
        title={describeDay(resolvedDay, progress)}
        meta={<DemoBadge />}
      />

      {onboarded ? null : <SetUpFirstWeek onboarded={onboarded} />}

      <Framing
        intention={framing.intention}
        inMyControl={framing.inMyControl}
        notMyControl={framing.notMyControl}
        virtue={framing.virtue}
        obstacle={framing.obstacle}
        minimumMode={framing.minimumMode}
        onSave={setFramingAction}
        onMinimumMode={setMinimumModeAction}
      />

      <MinimumDay progress={progress} />

      <DayBoard
        day={resolvedDay}
        minimumMode={framing.minimumMode}
        onSetStatus={setCommitmentStatusAction}
        onAdd={addCommitmentAction}
        onReorder={reorderCommitmentsAction}
        onSnooze={snoozeCommitmentAction}
      />

      <FocusSessionPanel
        initialSession={runningFocus}
        tasks={focusTasks}
        onStart={startFocusAction}
        onPause={pauseFocusAction}
        onResume={resumeFocusAction}
        onFinish={finishFocusAction}
      />

      <ResetToday reset={reset} />

      <EveningReview progress={progress} existing={review} onSave={saveDayReviewAction} />

      <p className="text-body-sm text-ink-muted">
        The morning and evening questions are your journal.{' '}
        <Link href="/reflect" className="text-accent hover:underline">
          See the week and write the weekly review
        </Link>
        .
      </p>
    </div>
  );
}
