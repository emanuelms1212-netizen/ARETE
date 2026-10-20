'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { CheckIcon } from '@/components/icons';
import {
  Button,
  Dialog,
  FormField,
  TextArea,
  TextInput,
  useToast,
  StopGuidance,
} from '@/components/ui';
import {
  BLOCK_LABEL,
  restRemaining,
  type Block,
  type WorkoutItem,
  type WorkoutSession,
  type WorkoutSetLog,
} from '@/domain';
import { ExerciseGuide } from './exercise-guide';
import { formatKg, formatSeconds, nameOf, prescriptionLine, requireExercise } from './format';

/**
 * A workout in progress.
 *
 * Everything shown comes from the workout the server returned: the
 * prescription is the snapshot taken at the start, and each logged set is a
 * row that exists. Nothing is marked done until the server has said so. The
 * rest timer is derived from when the last set was logged, so a reload or a
 * locked phone does not lose it, and it is advisory — skipping it is a tap.
 */
type Result = { ok: true; value: WorkoutSession } | { ok: false; message: string };

export interface WorkoutRunnerProps {
  readonly workout: WorkoutSession;
  readonly onLog: (input: {
    workoutId: string;
    exerciseSlug: string;
    setIndex: number;
    reps?: number | null;
    loadKg?: number | null;
    seconds?: number | null;
    rpe?: number | null;
    pain?: number | null;
    formOk?: boolean | null;
    completed?: boolean;
  }) => Promise<Result>;
  readonly onSubstitute: (input: {
    workoutId: string;
    fromSlug: string;
    toSlug: string;
  }) => Promise<Result>;
  readonly onFinish: (input: {
    workoutId: string;
    status: 'completed' | 'abandoned';
    notes?: string | null;
  }) => Promise<Result>;
  readonly onUpdated: (workout: WorkoutSession) => void;
  readonly onFinished: (workout: WorkoutSession) => void;
}

const BLOCK_ORDER: readonly Block[] = ['warmup', 'primary', 'accessory', 'cooldown'];

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function setsFor(workout: WorkoutSession, slug: string): WorkoutSetLog[] {
  return workout.sets
    .filter((set) => set.exerciseSlug === slug)
    .sort((a, b) => a.setIndex - b.setIndex);
}

function describeSet(set: WorkoutSetLog): string {
  if (!set.completed) return 'Skipped';
  const parts: string[] = [];
  if (set.reps !== null) parts.push(`${set.reps} reps`);
  if (set.seconds !== null) parts.push(formatSeconds(set.seconds));
  if (set.loadKg !== null && set.loadKg > 0) parts.push(formatKg(set.loadKg));
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`);
  if (set.pain !== null && set.pain > 0) parts.push(`pain ${set.pain}/10`);
  return parts.join(' · ') || 'Done';
}

const RPE_OPTIONS = [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function SetEntry({
  item,
  setIndex,
  previous,
  pending,
  onSubmit,
}: {
  item: WorkoutItem;
  setIndex: number;
  previous: WorkoutSetLog | undefined;
  pending: boolean;
  onSubmit: (values: {
    reps: number | null;
    loadKg: number | null;
    seconds: number | null;
    rpe: number | null;
    pain: number;
    formOk: boolean | null;
  }) => void;
}) {
  const exercise = requireExercise(item.exerciseSlug);
  const timed = exercise.measure !== 'reps';
  const [reps, setReps] = useState(
    String(previous?.reps ?? item.target.repsGoal ?? item.reps?.min ?? ''),
  );
  const [load, setLoad] = useState(
    previous?.loadKg !== null && previous?.loadKg !== undefined
      ? String(previous.loadKg)
      : item.target.loadKg !== null
        ? String(item.target.loadKg)
        : '',
  );
  const [seconds, setSeconds] = useState(
    String(previous?.seconds ?? item.target.seconds ?? item.seconds ?? ''),
  );
  const [rpe, setRpe] = useState(
    previous?.rpe !== null && previous?.rpe !== undefined ? String(previous.rpe) : '',
  );
  const [pain, setPain] = useState('0');
  const [formOk, setFormOk] = useState(previous?.formOk ?? true);

  const label = `${exercise.name}, set ${setIndex}`;

  return (
    <form
      aria-label={label}
      className="mt-3 rounded-lg border border-line bg-sunken p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          reps: timed ? null : reps === '' ? null : Number(reps),
          loadKg: load === '' ? null : Number(load),
          seconds: timed ? (seconds === '' ? null : Number(seconds)) : null,
          rpe: rpe === '' ? null : Number(rpe),
          pain: Number(pain),
          formOk,
        });
      }}
    >
      <p className="text-body-sm font-medium text-ink">
        Set {setIndex} of {item.target.sets}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {timed ? (
          <FormField label="Seconds">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={0}
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
              />
            )}
          </FormField>
        ) : (
          <FormField label="Reps">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={0}
                value={reps}
                onChange={(event) => setReps(event.target.value)}
              />
            )}
          </FormField>
        )}
        {exercise.loadable ? (
          <FormField label="Load (kg)">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={load}
                onChange={(event) => setLoad(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
        <FormField label="Effort (RPE)">
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={rpe}
              onChange={(event) => setRpe(event.target.value)}
              className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-2 text-body text-ink"
            >
              <option value="">Not sure</option>
              {RPE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} · {10 - value} in reserve
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Pain (0–10)">
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={pain}
              onChange={(event) => setPain(event.target.value)}
              className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-2 text-body text-ink"
            >
              {Array.from({ length: 11 }, (_, value) => (
                <option key={value} value={value}>
                  {value === 0 ? '0 · none' : value >= 4 ? `${value} · stop` : String(value)}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      {Number(pain) >= 4 ? (
        <p role="alert" className="mt-2 text-body-sm text-warn">
          Pain at 4 or more: log this set, then stop this exercise. Next time it will be lighter.
        </p>
      ) : null}
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 text-body-sm text-ink">
        <input
          type="checkbox"
          checked={formOk}
          onChange={(event) => setFormOk(event.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        Form held on this set
      </label>
      <Button type="submit" size="sm" loading={pending} className="mt-2">
        Log set {setIndex}
      </Button>
    </form>
  );
}

function ExerciseCard({
  item,
  workout,
  pending,
  onLog,
  onGuide,
  onSwap,
}: {
  item: WorkoutItem;
  workout: WorkoutSession;
  pending: boolean;
  onLog: (
    item: WorkoutItem,
    setIndex: number,
    values: Parameters<Parameters<typeof SetEntry>[0]['onSubmit']>[0],
  ) => void;
  onGuide: (slug: string) => void;
  onSwap: (item: WorkoutItem) => void;
}) {
  const exercise = requireExercise(item.exerciseSlug);
  const logged = setsFor(workout, item.exerciseSlug);
  const done = logged.filter((set) => set.completed).length;
  const complete = logged.length >= item.target.sets;
  const nextIndex = Math.min(item.target.sets, logged.length + 1);
  const simple = item.block === 'warmup' || item.block === 'cooldown';
  const stopped = logged.some((set) => (set.pain ?? 0) >= 4);

  return (
    <li className="py-4" data-testid={`exercise-${item.exerciseSlug}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-ink">
            {exercise.name}
            {complete ? (
              <span className="ml-2 inline-flex items-center gap-1 text-body-sm font-normal text-success">
                <CheckIcon size={14} /> Done
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            {prescriptionLine(item, item.target)}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 whitespace-nowrap"
          onClick={() => onGuide(item.exerciseSlug)}
        >
          How to
        </Button>
      </div>

      {item.note ? <p className="mt-2 text-body-sm text-ink-muted">{item.note}</p> : null}
      {!simple ? (
        <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-body-sm text-ink">
          <span className="font-medium">Why this target: </span>
          {item.rule}
        </p>
      ) : null}

      {logged.length > 0 ? (
        <ol className="mt-2 space-y-1 text-body-sm text-ink">
          {logged.map((set) => (
            <li key={set.setIndex}>
              <span className="text-ink-muted">Set {set.setIndex}:</span> {describeSet(set)}
            </li>
          ))}
        </ol>
      ) : null}

      {!complete && !stopped ? (
        simple ? (
          <Button
            size="sm"
            variant="quiet"
            className="mt-3"
            loading={pending}
            onClick={() =>
              onLog(item, nextIndex, {
                reps: item.reps ? item.reps.max : null,
                loadKg: null,
                seconds: item.reps ? null : (item.seconds ?? 30),
                rpe: null,
                pain: 0,
                formOk: null,
              })
            }
          >
            Mark {exercise.name.toLowerCase()} done
          </Button>
        ) : (
          <SetEntry
            key={`${item.exerciseSlug}-${nextIndex}`}
            item={item}
            setIndex={nextIndex}
            previous={logged[logged.length - 1]}
            pending={pending}
            onSubmit={(values) => onLog(item, nextIndex, values)}
          />
        )
      ) : null}

      {stopped && !complete ? (
        <p className="mt-2 text-body-sm text-warn">
          Stopped for pain. That was the right call; move on to the next exercise.
        </p>
      ) : null}

      {!simple && done === 0 && item.substitutes.length > 0 ? (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => onSwap(item)}>
          Swap for something similar
        </Button>
      ) : null}
    </li>
  );
}

export function WorkoutRunner({
  workout,
  onLog,
  onSubstitute,
  onFinish,
  onUpdated,
  onFinished,
}: WorkoutRunnerProps) {
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const [guide, setGuide] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<WorkoutItem | null>(null);
  const [ending, setEnding] = useState<'completed' | 'abandoned' | null>(null);
  const [notes, setNotes] = useState('');
  const [restSkippedFor, setRestSkippedFor] = useState<string | null>(null);
  const { show } = useToast();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now.getTime() - Date.parse(workout.startedAt)) / 1000));
  const lastSet = useMemo(
    () => [...workout.sets].sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0] ?? null,
    [workout.sets],
  );
  const lastItem = lastSet
    ? workout.snapshot.items.find((item) => item.exerciseSlug === lastSet.exerciseSlug)
    : undefined;
  const rest =
    lastSet && lastItem && restSkippedFor !== lastSet.performedAt
      ? restRemaining(lastItem.restSeconds, new Date(lastSet.performedAt), now)
      : 0;

  function apply(result: Result, failure: string) {
    if (result.ok) onUpdated(result.value);
    else show(result.message || failure, 'warn');
  }

  function log(
    item: WorkoutItem,
    setIndex: number,
    values: {
      reps: number | null;
      loadKg: number | null;
      seconds: number | null;
      rpe: number | null;
      pain: number;
      formOk: boolean | null;
    },
  ) {
    start(async () => {
      try {
        apply(
          await onLog({
            workoutId: workout.id,
            exerciseSlug: item.exerciseSlug,
            setIndex,
            ...values,
            completed: true,
          }),
          'Could not log that set.',
        );
      } catch {
        show('Could not log that set. Nothing was saved.', 'warn');
      }
    });
  }

  const byBlock = BLOCK_ORDER.map((block) => ({
    block,
    items: workout.snapshot.items.filter((item) => item.block === block),
  })).filter((group) => group.items.length > 0);

  const logged = workout.sets.filter((set) => set.completed).length;
  const guided = guide ? requireExercise(guide) : null;

  return (
    <div className="space-y-4" data-testid="workout-runner">
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-label uppercase text-ink-muted">In progress</p>
        <h2 className="font-display mt-1 text-display-3 font-semibold text-ink">{workout.title}</h2>
        <p className="mt-1 text-body-sm text-ink-muted tabular-nums">
          {clock(elapsed)} elapsed · {logged} set{logged === 1 ? '' : 's'} logged
        </p>
        {workout.snapshot.readinessNote ? (
          <p className="mt-2 text-body-sm text-ink">{workout.snapshot.readinessNote}</p>
        ) : null}
      </div>

      {rest > 0 ? (
        <div
          role="timer"
          aria-label="Rest"
          className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent-soft px-4 py-3"
        >
          <p className="text-body text-ink">
            Rest <span className="font-semibold tabular-nums">{clock(rest)}</span>
            <span className="block text-body-sm text-ink-muted">
              Start the next set when you are ready.
            </span>
          </p>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setRestSkippedFor(lastSet?.performedAt ?? null)}
          >
            Skip rest
          </Button>
        </div>
      ) : null}

      {byBlock.map((group) => (
        <section
          key={group.block}
          aria-labelledby={`block-${group.block}`}
          className="rounded-xl border border-line bg-surface px-4"
        >
          <h2 id={`block-${group.block}`} className="pt-4 text-label uppercase text-ink-muted">
            {BLOCK_LABEL[group.block]}
          </h2>
          <ul className="divide-y divide-line">
            {group.items.map((item) => (
              <ExerciseCard
                key={item.exerciseSlug}
                item={item}
                workout={workout}
                pending={pending}
                onLog={log}
                onGuide={setGuide}
                onSwap={setSwapping}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEnding('completed')}>Finish workout</Button>
        <Button variant="quiet" onClick={() => setEnding('abandoned')}>
          Stop here
        </Button>
      </div>
      <StopGuidance module="workout" />

      <Dialog open={guided !== null} onClose={() => setGuide(null)} title={guided?.name ?? ''}>
        {guided ? <ExerciseGuide exercise={guided} headingLevel={3} /> : null}
      </Dialog>

      <Dialog
        open={swapping !== null}
        onClose={() => setSwapping(null)}
        title={swapping ? `Instead of ${nameOf(swapping.exerciseSlug)}` : ''}
        description="Each of these trains the same movement, so the session keeps its purpose."
      >
        <ul className="space-y-2">
          {swapping?.substitutes.map((slug) => (
            <li key={slug}>
              <Button
                variant="quiet"
                className="w-full justify-between"
                loading={pending}
                onClick={() => {
                  const from = swapping.exerciseSlug;
                  setSwapping(null);
                  start(async () => {
                    try {
                      apply(
                        await onSubstitute({ workoutId: workout.id, fromSlug: from, toSlug: slug }),
                        'Could not swap.',
                      );
                    } catch {
                      show('Could not swap. The workout is unchanged.', 'warn');
                    }
                  });
                }}
              >
                {nameOf(slug)}
              </Button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={ending === 'completed' ? 'Finish the workout?' : 'Stop here?'}
        description={
          ending === 'completed'
            ? `${logged} set${logged === 1 ? '' : 's'} logged. Anything not logged is simply not counted.`
            : 'What you logged is kept. Stopping when you need to is part of training.'
        }
      >
        {ending === 'abandoned' ? (
          <div className="mb-4">
            <StopGuidance module="workout" summary="Stopping because you feel unwell?" open />
          </div>
        ) : null}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const status = ending ?? 'completed';
            start(async () => {
              try {
                const result = await onFinish({ workoutId: workout.id, status, notes });
                if (result.ok) {
                  setEnding(null);
                  onFinished(result.value);
                } else show(result.message, 'warn');
              } catch {
                show('Could not finish. The workout is still running.', 'warn');
              }
            });
          }}
        >
          <FormField label="Notes for next time" hint="Optional.">
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Left knee felt better than last week"
              />
            )}
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              {ending === 'completed' ? 'Finish' : 'Stop and save'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEnding(null)}>
              Keep going
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
