import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { WeekProposalForm } from '@/components/reflect/week-proposal';
import { WeeklyReviewForm } from '@/components/reflect/weekly-review';
import { EmptyState, PageHeader, Section } from '@/components/ui';
import {
  EVENING_PROMPTS,
  MORNING_PROMPTS,
  VIRTUES,
  addDays,
  formatLocalDate,
  quoteFor,
  weekFactLines,
} from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../current-day';
import { confirmProposalAction, saveWeeklyReviewAction } from './actions';
import { loadReflectContext } from './context';

export const metadata: Metadata = { title: 'Journal' };

export const dynamic = 'force-dynamic';

const longDate = (iso: string) => formatLocalDate(iso, 'long');
const shortDate = (iso: string) => formatLocalDate(iso, 'short').split(' ').slice(1).join(' ');

function Entry({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{value}</dd>
    </div>
  );
}

export default async function ReflectPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }
  const params = await searchParams;
  const data = await withUser(user.id, async (repository) => {
    const { localDate } = await resolveCurrentDay(repository, user);
    return loadReflectContext(repository, user.id, localDate, params.week);
  });
  const quote = quoteFor(data.today);
  const virtueLabel = (value: string | null) =>
    VIRTUES.find((virtue) => virtue.value === value)?.label ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/plan" className="hover:underline">
            Plan
          </Link>
        }
        title="Journal"
        lede="Morning and evening pages are written on Today. Here is the week, with what actually happened beside what you make of it."
      />

      <nav aria-label="Weeks" className="flex items-center justify-between gap-2">
        <Link
          href={`/reflect?week=${data.previousWeek}`}
          className="flex min-h-11 items-center px-2 text-body-sm text-accent"
        >
          ← Week before
        </Link>
        <h2 className="text-body font-semibold text-ink" data-testid="reflect-week">
          {shortDate(data.week)} – {shortDate(addDays(data.week, 6))}
        </h2>
        {data.nextWeek ? (
          <Link
            href={`/reflect?week=${data.nextWeek}`}
            className="flex min-h-11 items-center px-2 text-body-sm text-accent"
          >
            Week after →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <Section title="What happened" hint="From your records: counts, not a score.">
        <ul className="space-y-1 text-body text-ink" data-testid="week-facts">
          {weekFactLines(data.facts).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <WeeklyReviewForm
        key={data.week}
        week={data.week}
        answers={data.answers}
        onSave={saveWeeklyReviewAction}
      />

      {data.proposal ? (
        <WeekProposalForm
          days={data.proposal.days}
          unplaced={data.proposal.unplaced}
          onConfirm={confirmProposalAction}
        />
      ) : null}

      <Section title="The week’s pages">
        {data.journal.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Nothing written this week.{' '}
            <Link href="/today" className="text-accent underline underline-offset-2">
              Today
            </Link>{' '}
            has the morning and evening questions.
          </p>
        ) : (
          <div className="space-y-4">
            {data.journal.map((day) => (
              <article key={day.localDate} aria-labelledby={`day-${day.localDate}`}>
                <h3 id={`day-${day.localDate}`} className="text-body font-semibold text-ink">
                  {longDate(day.localDate)}
                </h3>
                <dl className="mt-1 space-y-2">
                  <Entry label="What the day was for" value={day.framing?.intention} />
                  <Entry label={MORNING_PROMPTS.inMyControl} value={day.framing?.inMyControl} />
                  <Entry label={MORNING_PROMPTS.notMyControl} value={day.framing?.notMyControl} />
                  <Entry
                    label={MORNING_PROMPTS.virtue}
                    value={virtueLabel(day.framing?.virtue ?? null)}
                  />
                  <Entry label={MORNING_PROMPTS.obstacle} value={day.framing?.obstacle} />
                  <Entry label={EVENING_PROMPTS.wentWell} value={day.review?.wentWell} />
                  <Entry label={EVENING_PROMPTS.friction} value={day.review?.friction} />
                  <Entry label={EVENING_PROMPTS.learned} value={day.review?.learned} />
                  <Entry
                    label={EVENING_PROMPTS.tomorrowOneThing}
                    value={day.review?.tomorrowOneThing}
                  />
                </dl>
              </article>
            ))}
          </div>
        )}
      </Section>

      <details className="rounded-lg border border-line bg-surface p-4">
        <summary className="min-h-11 cursor-pointer content-center text-body-sm font-medium text-accent">
          A line from the Stoics (optional)
        </summary>
        <figure className="mt-2">
          <blockquote className="font-display text-body text-ink">“{quote.text}”</blockquote>
          <figcaption className="mt-1 text-body-sm text-ink-muted">
            {quote.author}, {quote.work}, translated by {quote.translator}.{' '}
            <a
              href={quote.sourceUrl}
              className="text-accent underline underline-offset-2"
              rel="noreferrer"
              target="_blank"
            >
              Source
            </a>
          </figcaption>
        </figure>
      </details>
    </div>
  );
}
