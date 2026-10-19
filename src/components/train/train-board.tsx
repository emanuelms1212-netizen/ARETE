'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button, EmptyState, Section, SegmentedControl, Switch, useToast } from '@/components/ui';
import {
  BLOCK_LABEL,
  READINESS,
  WEEKDAY_NAMES,
  describeWorkout,
  mondayFirst,
  type PlannedSession,
  type Readiness,
  type TrainingPlan,
  type TrainingSetup,
  type WorkoutSession,
  type WorkoutSnapshot,
} from '@/domain';
import { nameOf, prescriptionLine } from './format';
import { SetupForm } from './setup-form';
import { WorkoutRunner, type WorkoutRunnerProps } from './workout-runner';

/**
 * The Train screen.
 *
 * Three states, decided by what exists rather than by a mode flag: no setup
 * yet (the setup form), a workout running (the runner, and nothing else to
 * distract from it), or neither (today's session, the week, and why the plan
 * is what it is).
 */
type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface TrainBoardProps {
  readonly setup: TrainingSetup | null;
  readonly suggested: TrainingSetup;
  readonly plan: TrainingPlan | null;
  readonly todayWeekday: number;
  /** Today's planned session, already run through progression, for the preview. */
  readonly preview: WorkoutSnapshot | null;
  readonly running: WorkoutSession | null;
  readonly recent: readonly WorkoutSession[];
  readonly onSaveSetup: (setup: TrainingSetup) => Promise<Result<null>>;
  readonly onStart: (input: {
    sessionKey: string;
    readiness: Readiness;
    minimumMode: boolean;
    attemptToken: string;
  }) => Promise<Result<WorkoutSession>>;
  readonly onLog: WorkoutRunnerProps['onLog'];
  readonly onSubstitute: WorkoutRunnerProps['onSubstitute'];
  readonly onFinish: WorkoutRunnerProps['onFinish'];
}

const READINESS_LABEL: Record<Readiness, string> = { low: 'Low', normal: 'Normal', high: 'Good' };

function SessionPreview({ snapshot }: { snapshot: WorkoutSnapshot }) {
  const groups = (['warmup', 'primary', 'accessory', 'cooldown'] as const)
    .map((block) => ({ block, items: snapshot.items.filter((item) => item.block === block) }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.block}>
          <p className="text-label uppercase text-ink-muted">{BLOCK_LABEL[group.block]}</p>
          <ul className="mt-1 space-y-1.5">
            {group.items.map((item) => (
              <li key={item.exerciseSlug} className="text-body text-ink">
                <Link
                  href={`/train/exercises/${item.exerciseSlug}`}
                  className="font-medium hover:underline"
                >
                  {nameOf(item.exerciseSlug)}
                </Link>
                <span className="block text-body-sm text-ink-muted">
                  {prescriptionLine(item, item.target)}
                </span>
                {item.block === 'primary' || item.block === 'accessory' ? (
                  <span className="block text-body-sm text-ink-muted">{item.rule}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function StartPanel({
  session,
  isToday,
  onStart,
}: {
  session: PlannedSession;
  isToday: boolean;
  onStart: TrainBoardProps['onStart'];
}) {
  const [readiness, setReadiness] = useState<Readiness>('normal');
  const [minimum, setMinimum] = useState(false);
  const [pending, start] = useTransition();
  const { show } = useToast();

  return (
    <div className="space-y-4">
      <SegmentedControl
        legend="How do you feel today?"
        value={readiness}
        onChange={setReadiness}
        options={READINESS.map((value) => ({ value, label: READINESS_LABEL[value] }))}
      />
      {readiness === 'low' ? (
        <p className="text-body-sm text-ink-muted">
          Low: one set fewer and an easier effort target. The minimum version counts in full.
        </p>
      ) : null}
      <Switch
        label={`Minimum version (about ${session.minimum.estimatedMinutes} min)`}
        hint="The warm-up and the first main exercise. On a bad day, that is the session."
        checked={minimum}
        onChange={setMinimum}
      />
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            try {
              const result = await onStart({
                sessionKey: session.key,
                readiness,
                minimumMode: minimum,
                attemptToken: crypto.randomUUID(),
              });
              if (!result.ok) show(result.message, 'warn');
            } catch {
              show('Could not start the workout. Nothing was saved.', 'warn');
            }
          })
        }
      >
        {isToday ? `Start ${session.title}` : `Start ${session.title} today`}
      </Button>
    </div>
  );
}

export function TrainBoard(props: TrainBoardProps) {
  const { plan, setup, todayWeekday, preview, recent } = props;
  const [running, setRunning] = useState<WorkoutSession | null>(props.running);
  const [finished, setFinished] = useState<WorkoutSession | null>(null);
  const [editing, setEditing] = useState(false);
  const [chosenKey, setChosenKey] = useState<string | null>(null);

  // A running workout is the whole screen.
  if (running) {
    return (
      <WorkoutRunner
        workout={running}
        onLog={props.onLog}
        onSubstitute={props.onSubstitute}
        onFinish={props.onFinish}
        onUpdated={setRunning}
        onFinished={(workout) => {
          setRunning(null);
          setFinished(workout);
        }}
      />
    );
  }

  if (!setup || !plan || editing) {
    return (
      <Section
        title={setup ? 'Your training setup' : 'Set up your training'}
        hint={
          setup
            ? 'Change anything; the plan is rebuilt from it straight away.'
            : 'Filled in from what you told us when you started. Check it, change what is wrong, and save.'
        }
      >
        <SetupForm
          initial={setup ?? props.suggested}
          firstTime={!setup}
          onSave={async (next) => {
            const result = await props.onSaveSetup(next);
            if (result.ok) setEditing(false);
            return result.ok ? { ok: true } : result;
          }}
          {...(setup ? { onCancel: () => setEditing(false) } : {})}
        />
      </Section>
    );
  }

  const today = plan.sessions.find((session) => session.weekday === todayWeekday) ?? null;
  const chosen = chosenKey
    ? (plan.sessions.find((session) => session.key === chosenKey) ?? null)
    : null;
  const tennisToday = plan.activityDays.some((day) => day.weekday === todayWeekday);
  const week = mondayFirst([0, 1, 2, 3, 4, 5, 6]);

  return (
    <div className="space-y-4">
      {finished ? (
        <Section title="Workout saved" hint={finished.title}>
          <p className="text-body text-ink" data-testid="workout-summary">
            {describeWorkout(finished)}
          </p>
          <Button variant="quiet" size="sm" className="mt-3" onClick={() => setFinished(null)}>
            Close
          </Button>
        </Section>
      ) : null}

      <Section
        title="Today"
        hint={
          today
            ? `${today.title} · about ${today.estimatedMinutes} min`
            : tennisToday
              ? 'Tennis today. Nothing else is planned, on purpose.'
              : 'A rest day. Rest is part of the plan, not a gap in it.'
        }
      >
        {today && preview ? (
          <div className="space-y-5">
            <SessionPreview snapshot={preview} />
            <StartPanel
              session={today}
              isToday
              onStart={async (input) => {
                const result = await props.onStart(input);
                if (result.ok) setRunning(result.value);
                return result;
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-body-sm text-ink-muted">
              Want to train anyway? Pick any session from this week.
            </p>
            <div className="flex flex-wrap gap-2">
              {plan.sessions.map((session) => (
                <Button
                  key={session.key}
                  size="sm"
                  variant={chosenKey === session.key ? 'primary' : 'quiet'}
                  onClick={() => setChosenKey(session.key)}
                >
                  {session.title}
                </Button>
              ))}
            </div>
            {chosen ? (
              <StartPanel
                session={chosen}
                isToday={false}
                onStart={async (input) => {
                  const result = await props.onStart(input);
                  if (result.ok) setRunning(result.value);
                  return result;
                }}
              />
            ) : null}
          </div>
        )}
      </Section>

      <Section
        title="This week"
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit setup
          </Button>
        }
      >
        <ul className="divide-y divide-line">
          {week.map((day) => {
            const session = plan.sessions.find((candidate) => candidate.weekday === day);
            const tennis = plan.activityDays.some((activity) => activity.weekday === day);
            return (
              <li key={day} className="flex items-baseline justify-between gap-3 py-2.5">
                <span
                  className={`text-body ${day === todayWeekday ? 'font-semibold text-ink' : 'text-ink'}`}
                >
                  {WEEKDAY_NAMES[day]}
                  {day === todayWeekday ? <span className="sr-only"> (today)</span> : null}
                </span>
                <span className="text-right text-body-sm text-ink-muted">
                  {session
                    ? `${session.title} · ${session.estimatedMinutes} min`
                    : tennis
                      ? 'Tennis'
                      : 'Rest'}
                  {session && tennis ? ' · tennis' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Why this plan">
        <ul className="list-disc space-y-1.5 pl-5 text-body-sm text-ink">
          {plan.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
          {plan.omissions.map((line) => (
            <li key={line} className="text-warn">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-body-sm text-ink-muted">
          Load goes up only when every set reaches the top of its range, at or under the target
          effort, with form marked as solid. Pain of 4/10 or more makes the next session lighter.
        </p>
      </Section>

      <Section
        title="Recent workouts"
        action={
          <Link href="/train/exercises" className="text-body-sm text-accent hover:underline">
            Exercise library
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing logged yet."
            body="Your first workout will show here, with what it changed for the next one."
          />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((workout) => (
              <li key={workout.id} className="py-2.5">
                <p className="text-body text-ink">
                  {workout.title}{' '}
                  <span className="text-body-sm text-ink-muted">· {workout.localDate}</span>
                </p>
                <p className="text-body-sm text-ink-muted">{describeWorkout(workout)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
