import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { EmptyState, PageHeader } from '@/components/ui';
import { phaseFor } from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../current-day';
import { loadContrastContext } from './contrast/context';
import { loadResetContext } from './reset/context';

export const metadata: Metadata = { title: 'Programmes' };

export const dynamic = 'force-dynamic';

const card = 'block rounded-xl border border-line bg-surface p-4 hover:border-line-strong';

export default async function ProgramsPage() {
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
    const [reset, contrast] = await Promise.all([
      loadResetContext(repository, user.id, localDate),
      loadContrastContext(repository, user.id, localDate),
    ]);
    return { reset, contrast };
  });

  const state = data.reset.state;
  const resetLine = !data.reset.enrolment
    ? 'Not started. Look through the whole programme first.'
    : state?.kind === 'active'
      ? `Day ${state.programDay} of ${data.reset.length} · ${phaseFor(state.programDay).name}`
      : state?.kind === 'paused'
        ? 'Paused'
        : state?.kind === 'sick'
          ? 'On a sick or injury break'
          : state?.kind === 'complete'
            ? 'All days done — choose what next'
            : 'Starts soon';
  const contrastLine = data.contrast.minor
    ? 'Not offered under 18'
    : !data.contrast.offered
      ? 'Not offered with your health answers'
      : data.contrast.eligibility.kind === 'ok'
        ? 'Set up. Optional on recovery days.'
        : data.contrast.eligibility.kind === 'needs_clearance'
          ? 'Waiting on a doctor’s clearance'
          : 'Off. Screening first.';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Programmes"
        lede="Structured plans you choose. Every one is optional, editable and survives a missed day."
      />
      <nav aria-label="Programmes" className="grid gap-3 sm:grid-cols-2">
        <Link href="/programs/reset" className={card}>
          <span className="block text-body font-semibold text-ink">60-Day Reset</span>
          <span className="block text-body-sm text-ink-muted">{resetLine}</span>
        </Link>
        <Link href="/train/flexibility" className={card}>
          <span className="block text-body font-semibold text-ink">Flexibility</span>
          <span className="block text-body-sm text-ink-muted">Hamstrings, four weeks</span>
        </Link>
        <Link href="/reflect" className={card}>
          <span className="block text-body font-semibold text-ink">Journal and weekly review</span>
          <span className="block text-body-sm text-ink-muted">
            Morning and evening pages, and the week
          </span>
        </Link>
        <Link href="/programs/contrast" className={card}>
          <span className="block text-body font-semibold text-ink">Contrast therapy</span>
          <span className="block text-body-sm text-ink-muted">{contrastLine}</span>
        </Link>
      </nav>
    </div>
  );
}
