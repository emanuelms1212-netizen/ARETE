import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { DemoBadge } from '@/components/demo-badge';
import {
  Card,
  EmptyState,
  FocusTimer,
  ListRow,
  Metric,
  PageHeader,
  Section,
  StatusDot,
} from '@/components/ui';
import {
  computeDayProgress,
  describeDay,
  toLocalDate,
  type Commitment,
  type Day,
  type DayProgress,
} from '@/domain';
import { DEMO_TODAY, withUser } from '@/persistence';

export const metadata: Metadata = { title: 'Today' };

/**
 * Today is the user's own day, read per request. Prerendering it would bake one
 * account's data into the build — harmless in demo mode and wrong in live mode,
 * so it is dynamic in both rather than depending on which mode built it.
 */
export const dynamic = 'force-dynamic';

const statusLabel: Record<Commitment['status'], string> = {
  done: 'Done',
  pending: 'Open',
  skipped: 'Skipped',
};

const statusTone: Record<Commitment['status'], 'done' | 'open' | 'skipped'> = {
  done: 'done',
  pending: 'open',
  skipped: 'skipped',
};

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

function Commitments({ day, progress }: { day: Day; progress: DayProgress }) {
  return (
    <Section
      title="Today"
      hint={`${progress.done} done · ${progress.pending} open · ${progress.skipped} skipped`}
    >
      {day.commitments.length === 0 ? (
        <EmptyState title="Nothing planned yet." body="Pick one thing." />
      ) : (
        <ul>
          {day.commitments.map((commitment) => (
            <ListRow
              key={commitment.id}
              leading={<StatusDot tone={statusTone[commitment.status]} />}
              title={commitment.title}
              detail={commitment.skipReason}
              muted={commitment.status === 'skipped'}
              trailing={
                <>
                  {commitment.isMinimum ? (
                    <span className="mr-2 rounded-full bg-accent-soft px-2 py-0.5 text-label text-accent">
                      Minimum
                    </span>
                  ) : null}
                  {statusLabel[commitment.status]}
                </>
              }
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

export default async function TodayPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Signing in arrives with onboarding in stage 5. Until then, demo mode is the way in."
      />
    );
  }

  // The day is the user's local day, in the zone their account records in —
  // never the server's.
  const { day, timeZone, onboarded } = await withUser(user.id, async (repository) => {
    const zone = await repository.getTimeZone(user.id);
    const { progress } = await repository.getOnboarding(user.id);
    const today = toLocalDate(new Date(), zone);

    // Once a plan has been accepted, today is today. Before that, the demo
    // account falls back to its fixed sample day so that screenshots and tests
    // keep agreeing on what Today looks like.
    const real = await repository.getDay(user.id, today);
    const fallback =
      real === null && user.isDemo ? await repository.getDay(user.id, DEMO_TODAY) : null;

    return {
      day: real ?? fallback,
      timeZone: zone,
      onboarded: progress.completedAt !== null,
    };
  });

  if (!day) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow={longDate(toLocalDate(new Date(), timeZone))}
          title="Nothing planned yet."
        />
        <SetUpFirstWeek onboarded={onboarded} />
      </div>
    );
  }

  const progress = computeDayProgress(day);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={longDate(day.date)}
        title={describeDay(day, progress)}
        meta={<DemoBadge />}
      />

      {onboarded ? null : <SetUpFirstWeek onboarded={onboarded} />}
      <MinimumDay progress={progress} />
      <Commitments day={day} progress={progress} />

      <Section
        title="Focus"
        hint="One task, one block. The timer runs on wall-clock time, so backgrounding the app does not lose it."
      >
        <div className="py-2">
          <FocusTimer totalSeconds={25 * 60} />
        </div>
        <p className="mt-4 text-body-sm text-ink-muted">
          The timer works, and the database can record a session idempotently. Attaching one to a
          task and keeping its history arrives in stage 6 — nothing you run here is recorded yet.
        </p>
      </Section>

      <Card className="p-4">
        <p className="text-body-sm text-ink-muted">
          Checking items off, committing to the day and the evening review arrive in stage 6. This
          screen reads real data through the repository layer — the same contract the Postgres
          adapter is held to.
        </p>
      </Card>
    </div>
  );
}
