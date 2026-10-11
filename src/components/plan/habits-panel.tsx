'use client';

import { useState, useTransition } from 'react';
import { CheckIcon } from '@/components/icons';
import {
  Button,
  Card,
  ChoiceList,
  EmptyState,
  FormField,
  Section,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  describeStreak,
  outcomeFor,
  type Habit,
  type HabitDay,
  type HabitKind,
  type HabitLog,
  type Streak,
} from '@/domain';

/**
 * Habits, and the refusal to use them as a stick.
 *
 * Two things here are deliberate and easy to get wrong:
 *
 * The number on display is the rolling consistency rate, not the streak. A
 * streak answers "how long since I slipped", which gets more frightening to
 * look at the better it gets — and the moment someone most needs to open this
 * screen is the moment a streak punishes them for doing so.
 *
 * A `limit` habit inverts: the target is a ceiling and under it is the win.
 * The tick control says "Under" rather than "Done", because congratulating
 * someone for a personal best in the thing they are cutting down is the exact
 * failure this kind exists to avoid.
 */
export interface HabitWithHistory {
  readonly habit: Habit;
  readonly todayLog: HabitLog | null;
  readonly streak: Streak;
  readonly history: readonly HabitDay[];
}

export interface HabitsPanelProps {
  readonly habits: readonly HabitWithHistory[];
  readonly onCreate: (input: {
    title: string;
    kind: HabitKind;
    unit?: string | null;
    targetValue?: number | null;
    minimumTarget?: number | null;
  }) => Promise<void>;
  readonly onLog: (input: {
    habitId: string;
    status: 'done' | 'partial' | 'skipped' | 'rest';
    value?: number | null;
    skipReason?: string | null;
  }) => Promise<void>;
}

/** The last fourteen days, as marks rather than as a grid of judgement. */
function History({ habit, history }: { habit: Habit; history: readonly HabitDay[] }) {
  const recent = history.slice(-14);
  if (recent.length === 0) return null;

  return (
    <div className="mt-3 flex gap-1" aria-hidden="true">
      {recent.map((day) => {
        const outcome = outcomeFor(habit, day);
        const tone = outcome.neutral
          ? 'bg-sunken'
          : outcome.met
            ? 'bg-accent'
            : outcome.metMinimum
              ? 'bg-accent-soft'
              : 'bg-line';
        return <span key={day.localDate} className={`h-2 flex-1 rounded-sm ${tone}`} />;
      })}
    </div>
  );
}

function HabitCard({
  entry,
  onLog,
}: {
  entry: HabitWithHistory;
} & Pick<HabitsPanelProps, 'onLog'>) {
  const { habit, todayLog, streak, history } = entry;
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  const { show } = useToast();

  const isLimit = habit.kind === 'limit';
  const logged = todayLog !== null;
  const doneToday = todayLog?.status === 'done';

  function log(input: Parameters<HabitsPanelProps['onLog']>[0]) {
    start(async () => {
      try {
        await onLog(input);
      } catch {
        show(`Could not log “${habit.title}”. Nothing was recorded.`, 'warn');
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-medium text-ink">{habit.title}</h3>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            {habit.kind === 'binary'
              ? 'Did it or not'
              : isLimit
                ? `Stay under ${habit.targetValue} ${habit.unit ?? ''}`.trim()
                : `${habit.targetValue} ${habit.unit ?? ''}`.trim()}
            {habit.minimumTarget === null ? '' : ` · minimum ${habit.minimumTarget}`}
            {habit.pausedAt === null ? '' : ' · paused'}
          </p>
        </div>

        {habit.kind === 'binary' ? (
          <button
            type="button"
            aria-pressed={doneToday}
            aria-label={doneToday ? `Undo ${habit.title}` : `Mark ${habit.title} done`}
            disabled={pending}
            onClick={() => log({ habitId: habit.id, status: doneToday ? 'rest' : 'done' })}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
              doneToday ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'
            }`}
          >
            {doneToday ? <CheckIcon size={18} /> : null}
          </button>
        ) : null}
      </div>

      {habit.kind === 'binary' ? null : (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(value);
            if (!Number.isFinite(amount)) return;
            setValue('');
            // Whether it counts is the domain's call, not this form's: the
            // same arithmetic decides the mark and the streak.
            const meetsTarget = isLimit
              ? habit.targetValue === null || amount <= habit.targetValue
              : habit.targetValue === null || amount >= habit.targetValue;
            log({
              habitId: habit.id,
              status: meetsTarget ? 'done' : 'partial',
              value: amount,
            });
          }}
        >
          <div className="w-28">
            <FormField label={isLimit ? 'How many?' : 'How much?'}>
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={habit.unit ?? ''}
                />
              )}
            </FormField>
          </div>
          <Button type="submit" variant="quiet" disabled={pending}>
            Log it
          </Button>
        </form>
      )}

      <History habit={habit} history={history} />

      <p className="mt-2 text-body-sm text-ink-muted">{describeStreak(streak)}</p>

      {logged ? (
        <p className="mt-1 text-body-sm text-ink-muted">
          Today:{' '}
          {
            outcomeFor(habit, { localDate: todayLog.localDate, scheduled: true, log: todayLog })
              .label
          }
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => log({ habitId: habit.id, status: 'rest' })}
            className="min-h-11 text-body-sm text-ink-muted hover:text-ink disabled:opacity-40"
          >
            Rest day
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => log({ habitId: habit.id, status: 'skipped', skipReason: 'Not today' })}
            className="min-h-11 text-body-sm text-ink-muted hover:text-ink disabled:opacity-40"
          >
            Skip today
          </button>
        </div>
      )}
    </Card>
  );
}

export function HabitsPanel({ habits, onCreate, onLog }: HabitsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<HabitKind>('binary');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [minimum, setMinimum] = useState('');
  const [pending, start] = useTransition();
  const { show } = useToast();

  return (
    <Section
      title="Habits"
      hint="Three at most, on purpose. Consistency is the number worth watching, not the streak."
      action={
        adding ? null : (
          <Button variant="quiet" onClick={() => setAdding(true)}>
            Add a habit
          </Button>
        )
      }
    >
      {adding ? (
        <form
          className="mb-4 space-y-3 rounded-md border border-line bg-sunken p-3"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              try {
                await onCreate({
                  title,
                  kind,
                  unit: kind === 'binary' ? null : unit.trim() || null,
                  targetValue: kind === 'binary' ? null : Number(target),
                  minimumTarget: minimum.trim() ? Number(minimum) : null,
                });
                setTitle('');
                setUnit('');
                setTarget('');
                setMinimum('');
                setAdding(false);
              } catch {
                show('Could not save that habit. Nothing was created.', 'warn');
              }
            });
          }}
        >
          <FormField label="The habit">
            {({ id }) => (
              <TextInput
                id={id}
                autoFocus
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Read before bed"
              />
            )}
          </FormField>

          <ChoiceList
            legend="What kind?"
            value={kind}
            onChange={setKind}
            choices={[
              { value: 'binary' as const, label: 'Did it or not' },
              { value: 'count' as const, label: 'A count', hint: 'Pages, reps, glasses.' },
              { value: 'duration' as const, label: 'Minutes' },
              {
                value: 'limit' as const,
                label: 'A limit to stay under',
                hint: 'Lower is better. Nothing here will congratulate you for a bigger number.',
              },
            ]}
          />

          {kind === 'binary' ? null : (
            <div className="grid grid-cols-3 gap-2">
              <FormField label="Unit">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                    placeholder="pages"
                  />
                )}
              </FormField>
              <FormField label={kind === 'limit' ? 'Ceiling' : 'Target'}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    required
                    inputMode="decimal"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Minimum" hint="What still counts.">
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    inputMode="decimal"
                    value={minimum}
                    onChange={(event) => setMinimum(event.target.value)}
                  />
                )}
              </FormField>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Add it
            </Button>
            <Button type="button" variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {habits.length === 0 ? (
        <EmptyState
          title="No habits yet."
          body="Start with one. The smallest version of it that you would still do on a bad day."
        />
      ) : (
        <div className="space-y-3">
          {habits.map((entry) => (
            <HabitCard key={entry.habit.id} entry={entry} onLog={onLog} />
          ))}
        </div>
      )}
    </Section>
  );
}
