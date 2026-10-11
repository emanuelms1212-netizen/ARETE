'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertIcon, CheckIcon } from '@/components/icons';
import { Button, Card, Section } from '@/components/ui';
import { countDays, weeklyMinutes, type DraftWeek, type PlanItem } from '@/domain';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const SHAPE_LABEL = { train: 'Training', move: 'Movement', rest: 'Quiet' } as const;

export interface ReviewWeekProps {
  readonly week: DraftWeek;
  readonly onAccept: (edited: DraftWeek) => Promise<void>;
}

/**
 * The last screen before anything is saved.
 *
 * The whole week is here, every item says why it is there, and everything can
 * be removed or demoted before the user agrees to it. That is the point: a plan
 * a person has edited is a plan they chose, and a plan they chose is one they
 * might actually follow.
 */
export function ReviewWeek({ week, onAccept }: ReviewWeekProps) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [minimums, setMinimums] = useState<ReadonlySet<string>>(
    new Set(week.days.flatMap((day) => day.items.filter((i) => i.isMinimum).map((i) => i.id))),
  );
  const [openReasons, setOpenReasons] = useState<ReadonlySet<string>>(new Set());
  const [pending, start] = useTransition();

  const edited = useMemo<DraftWeek>(
    () => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        items: day.items
          .filter((item) => !removed.has(item.id))
          .map((item) => ({ ...item, isMinimum: minimums.has(item.id) })),
      })),
    }),
    [week, removed, minimums],
  );

  function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const totalItems = edited.days.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-label tracking-[0.12em] text-ink-muted uppercase">Your first week</p>
        <h1 className="font-display mt-2 text-display-1 font-semibold text-balance text-ink">
          Change anything. Nothing is saved yet.
        </h1>
      </div>

      <Card className="p-4">
        <ul className="space-y-2">
          {week.notes.map((note) => (
            <li key={note} className="flex gap-2 text-body-sm text-ink-muted">
              <AlertIcon size={16} className="mt-0.5 shrink-0 text-ink-muted" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Section title="At a glance">
        <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
          {[
            ['Training days', countDays(edited, 'train')],
            ['Movement days', countDays(edited, 'move')],
            ['Quiet days', countDays(edited, 'rest')],
            ['Scheduled minutes', weeklyMinutes(edited)],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">{label}</dt>
              <dd className="font-display mt-1 text-display-3 font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {week.habits.length > 0 ? (
        <Section title="Habits you will be tracking" hint="Three at most, on purpose.">
          <ul>
            {week.habits.map((habit) => (
              <li key={habit.title} className="border-b border-line py-3 last:border-b-0">
                <p className="text-body text-ink">{habit.title}</p>
                <p className="mt-0.5 text-body-sm text-ink-muted">{habit.because}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {edited.days.map((day) => {
          const source = week.days.find((candidate) => candidate.date === day.date);
          return (
            <Section
              key={day.date}
              title={`${WEEKDAY_NAMES[day.weekday] ?? day.date} · ${SHAPE_LABEL[day.shape]}`}
              hint={`${day.items.filter((item) => item.isMinimum).length} of ${day.items.length} is the minimum`}
            >
              {source && source.items.length > 0 ? (
                <ul>
                  {source.items.map((item: PlanItem) => {
                    const isRemoved = removed.has(item.id);
                    const isMinimum = minimums.has(item.id);
                    const reasonOpen = openReasons.has(item.id);

                    return (
                      <li key={item.id} className="border-b border-line py-3 last:border-b-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={`text-body ${isRemoved ? 'text-ink-muted line-through' : 'text-ink'}`}
                            >
                              {item.title}
                              {item.minutes ? (
                                <span className="ml-2 text-body-sm whitespace-nowrap text-ink-muted">
                                  {item.minutes} min
                                </span>
                              ) : null}
                            </p>
                            <button
                              type="button"
                              onClick={() => setOpenReasons((current) => toggle(current, item.id))}
                              aria-expanded={reasonOpen}
                              className="mt-1 min-h-11 text-body-sm text-accent hover:underline"
                            >
                              {reasonOpen ? 'Hide why' : 'Why is this here?'}
                            </button>
                            {reasonOpen ? (
                              <p className="mt-1 text-body-sm text-ink-muted">{item.because}</p>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setMinimums((current) => toggle(current, item.id))}
                              disabled={isRemoved}
                              aria-pressed={isMinimum}
                              className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-body-sm disabled:opacity-45 ${
                                isMinimum ? 'bg-accent-soft text-accent' : 'text-ink-muted'
                              }`}
                            >
                              {isMinimum ? <CheckIcon size={14} /> : null}
                              Minimum
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoved((current) => toggle(current, item.id))}
                              className="min-h-11 px-3 text-body-sm text-ink-muted hover:text-ink"
                            >
                              {isRemoved ? 'Put back' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-body-sm text-ink-muted">A quiet day. Nothing scheduled.</p>
              )}
            </Section>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-canvas px-4 py-4 shadow-overlay">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => start(() => void onAccept(edited))} loading={pending}>
            Save this week
          </Button>
          <p className="text-body-sm text-ink-muted">
            {totalItems} things across seven days. You can change any of it afterwards.
          </p>
        </div>
      </div>
    </div>
  );
}
