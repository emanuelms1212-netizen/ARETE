import type { Metadata } from 'next';
import { DemoBadge } from '@/components/demo-badge';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import { computeDayProgress, describeDay, type Commitment } from '@/domain';
import { DEMO_TODAY, getDayRepository } from '@/persistence';

export const metadata: Metadata = { title: 'Today' };

const statusLabel: Record<Commitment['status'], string> = {
  done: 'Done',
  pending: 'Open',
  skipped: 'Skipped',
};

function CommitmentRow({ commitment }: { commitment: Commitment }) {
  const isDone = commitment.status === 'done';
  const isSkipped = commitment.status === 'skipped';

  return (
    <li className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            isDone ? 'bg-[var(--accent)]' : isSkipped ? 'bg-[var(--line)]' : 'bg-[var(--ink-muted)]'
          }`}
        />
        <span className="min-w-0">
          <span
            className={`block text-sm break-words ${isSkipped ? 'text-[var(--ink-muted)]' : 'text-[var(--ink)]'}`}
          >
            {commitment.title}
          </span>
          {commitment.skipReason ? (
            <span className="block text-xs text-[var(--ink-muted)]">{commitment.skipReason}</span>
          ) : null}
        </span>
      </span>
      <span className="shrink-0 text-xs text-[var(--ink-muted)]">
        {commitment.isMinimum ? 'Minimum · ' : ''}
        {statusLabel[commitment.status]}
      </span>
    </li>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-wide text-[var(--ink-muted)] uppercase">{day.date}</p>
          <h1 className="text-xl font-semibold text-[var(--ink)]">{describeDay(day, progress)}</h1>
        </div>
        <DemoBadge />
      </div>

      <Card>
        <CardHeader
          title="Minimum day"
          hint={
            progress.minimumDayMet
              ? 'Met. Anything further today is a choice, not a debt.'
              : `${progress.minimumDone} of ${progress.minimumTotal} done.`
          }
        />
        <p className="text-sm text-[var(--ink-muted)]">
          The minimum is what you decided a real day looks like. Missing the rest does not erase it.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Today"
          hint={`${progress.done} done · ${progress.pending} open · ${progress.skipped} skipped`}
        />
        {day.commitments.length === 0 ? (
          <EmptyState title="Nothing planned yet." body="Pick one thing." />
        ) : (
          <ul>
            {day.commitments.map((commitment) => (
              <CommitmentRow key={commitment.id} commitment={commitment} />
            ))}
          </ul>
        )}
      </Card>

      <p className="px-1 text-xs text-[var(--ink-muted)]">
        Checking items off, committing to the day, and the evening review arrive in stage 6. This
        shell reads real data through the repository layer — nothing here is a mock control.
      </p>
    </div>
  );
}
