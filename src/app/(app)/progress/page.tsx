import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { BarChart, type Bar } from '@/components/progress/bar-chart';
import { EmptyState, PageHeader, Section } from '@/components/ui';
import {
  PROGRESS_RANGES,
  buckets,
  describeStreak,
  formatLocalDate,
  sumOf,
  thousands,
  type DayRecord,
} from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../current-day';
import { loadProgressContext } from './context';

export const metadata: Metadata = { title: 'Progress' };

export const dynamic = 'force-dynamic';

type Key = Parameters<typeof sumOf>[1];

function series(days: readonly DayRecord[], value: (days: readonly DayRecord[]) => number): Bar[] {
  return buckets(days).map((bucket) => ({
    label: bucket.label,
    span: bucket.span,
    value: value(bucket.days),
  }));
}
const sum = (key: Key) => (days: readonly DayRecord[]) => sumOf(days, key);
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
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
    return loadProgressContext(repository, user.id, localDate, params.range);
  });
  const { days } = data;
  const per = days.length <= 7 ? 'day' : 'week';

  const focus = sumOf(days, 'focusMinutes');
  const workouts = sumOf(days, 'workouts');
  const volume = sumOf(days, 'volumeKg');
  const cardio = sumOf(days, 'cardioMinutes');
  const mobility = sumOf(days, 'mobilitySessions');
  const mind = sumOf(days, 'meditationMinutes') + sumOf(days, 'breathworkMinutes');
  const c = data.consistency;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Progress"
        lede="What actually happened, module by module. No combined score, and a missed day never erases the month around it."
      />

      <nav aria-label="Date range" className="flex flex-wrap items-center gap-1">
        {PROGRESS_RANGES.map((range) => (
          <Link
            key={range}
            href={`/progress?range=${range}`}
            aria-current={range === data.range ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-full px-4 text-body-sm ${
              range === data.range
                ? 'bg-accent-soft font-semibold text-accent'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {range === 7 ? 'Last 7 days' : `Last ${range} days`}
          </Link>
        ))}
        <span className="ml-auto text-body-sm text-ink-muted" data-testid="progress-span">
          {formatLocalDate(data.from, 'short')} – {formatLocalDate(data.to, 'short')}
        </span>
      </nav>

      <Section title="In plain words">
        <ul className="space-y-1 text-body text-ink" data-testid="progress-narrative">
          {data.narrative.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section
        title="Consistency"
        hint="A run of days with something done, beside the share done — so one gap never hides the rest."
      >
        <BarChart
          title={`Things done per ${per}`}
          unit="done"
          bars={series(days, sum('commitmentsDone'))}
          summary={
            c.rate === null
              ? 'Nothing was planned in this range.'
              : `${Math.round(c.rate * 100)}% of planned things done across ${plural(c.plannedDays, 'planned day')}. Current run ${plural(c.currentRun, 'day')}, longest ${plural(c.longestRun, 'day')}.`
          }
        />
        {data.habits.length > 0 ? (
          <ul className="mt-3 space-y-2" aria-label="Habits">
            {data.habits.map((habit) => (
              <li key={habit.id} className="text-body-sm">
                <span className="font-medium text-ink">{habit.title}</span>
                <span className="block text-ink-muted">
                  Over this range: {describeStreak(habit.rolling)} Current run{' '}
                  {plural(habit.streak.current, 'day')}.
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Focus">
        <BarChart
          title={`Focus minutes per ${per}`}
          unit="min"
          bars={series(days, sum('focusMinutes'))}
          summary={`${focus} minutes of focused work in this range.`}
        />
      </Section>

      <Section title="Goals">
        {data.milestones.length === 0 ? (
          <p className="text-body-sm text-ink-muted">No milestones completed in this range.</p>
        ) : (
          <ul className="space-y-1 text-body-sm">
            {data.milestones.map((milestone) => (
              <li key={`${milestone.goal}-${milestone.title}`} className="text-ink">
                {milestone.title}{' '}
                <span className="text-ink-muted">
                  · {milestone.goal} · {formatLocalDate(milestone.completedOn, 'short')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Training">
        <BarChart
          title={`Workouts per ${per}`}
          unit="workouts"
          bars={series(days, sum('workouts'))}
          summary={`${plural(workouts, 'workout')}${volume > 0 ? `, ${thousands(volume)} kg lifted` : ''}${cardio > 0 ? `, ${Math.round(cardio)} minutes of cardio` : ''}.`}
        />
      </Section>

      <Section title="Flexibility">
        <BarChart
          title={`Flexibility sessions per ${per}`}
          unit="sessions"
          bars={series(days, sum('mobilitySessions'))}
          summary={`${plural(mobility, 'flexibility session')}.`}
        />
      </Section>

      <Section title="Meditation and breathing">
        <BarChart
          title={`Meditation and breathing minutes per ${per}`}
          unit="min"
          bars={series(
            days,
            (bucket) => sumOf(bucket, 'meditationMinutes') + sumOf(bucket, 'breathworkMinutes'),
          )}
          summary={`${mind} minutes in this range.`}
        />
      </Section>

      <Section title="Practice drills" hint="A record of practice, not a measure of ability.">
        {data.drills.length === 0 ? (
          <p className="text-body-sm text-ink-muted">No drills practised in this range.</p>
        ) : (
          <ul className="space-y-1 text-body-sm">
            {data.drills.map((drill) => (
              <li key={drill.drill} className="text-ink">
                {drill.drill.replaceAll('_', ' ').replaceAll('-', ' ')}:{' '}
                <span className="text-ink-muted">
                  {plural(drill.sessions, 'session')}, {drill.minutes} minutes
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Food" hint="Averages are over logged days only.">
        {data.nutrition.loggedDays === 0 ? (
          <p className="text-body-sm text-ink-muted">No food logged in this range.</p>
        ) : (
          <BarChart
            title={`Days with food logged, per ${per}`}
            unit="days"
            bars={series(days, (bucket) => bucket.filter((day) => day.foodEntries > 0).length)}
            summary={`Food logged on ${plural(data.nutrition.loggedDays, 'day')}${
              data.showNutritionNumbers && data.nutrition.averageProteinG !== null
                ? `, about ${data.nutrition.averageProteinG} g of protein${data.nutrition.averageFiberG !== null ? ` and ${data.nutrition.averageFiberG} g of fibre` : ''} on those days`
                : ''
            }.`}
          />
        )}
      </Section>

      <Section
        title="Patterns"
        hint="Observations from your own records. They describe what happened together, never what caused what."
      >
        {data.observations.length === 0 ? (
          <p className="text-body-sm text-ink-muted" data-testid="observations-pending">
            {data.observationsPending}
          </p>
        ) : (
          <ul className="space-y-2 text-body">
            {data.observations.map((observation) => (
              <li key={observation.id} className="text-ink">
                {observation.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Your data" hint="Download this range, or manage everything.">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/export?from=${data.from}&to=${data.to}`}
            download
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 text-body-sm text-ink hover:bg-sunken"
          >
            Export this range
          </a>
          <Link
            href="/settings/data"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-body-sm text-accent hover:bg-accent-soft"
          >
            Export everything or delete
          </Link>
        </div>
      </Section>
    </div>
  );
}
