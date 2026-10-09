import type { Metadata } from 'next';
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
  type Commitment,
  type Day,
  type DayProgress,
} from '@/domain';
import { DEMO_TODAY, getDayRepository } from '@/persistence';

export const metadata: Metadata = { title: 'Today' };

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
  const day = await getDayRepository().getDay(DEMO_TODAY);

  if (!day) {
    return (
      <EmptyState
        title="Nothing planned yet."
        body="Pick one thing. A day with one thing on it still counts."
      />
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
          The timer works. Attaching a session to a task, and keeping its history, arrives in stage
          6 — nothing you run here is recorded yet.
        </p>
      </Section>

      <Card className="p-4">
        <p className="text-body-sm text-ink-muted">
          Checking items off, committing to the day and the evening review arrive in stage 6. This
          screen reads real data through the repository layer — nothing here is a mock control.
        </p>
      </Card>
    </div>
  );
}
