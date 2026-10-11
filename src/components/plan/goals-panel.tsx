'use client';

import { useState, useTransition } from 'react';
import { Button, Card, EmptyState, FormField, Section, TextInput, useToast } from '@/components/ui';
import {
  describeGoalTiming,
  goalProgress,
  type Goal,
  type GoalVerdict,
  type Measurement,
  type Milestone,
} from '@/domain';

/**
 * Goals, and the one thing this panel must never do.
 *
 * A goal with no measure gets no progress bar. Not a greyed-out bar, not a bar
 * at zero — none. `goalProgress` returns a discriminated union whose `judged`
 * branch has no ratio at all, so the component cannot render one by accident;
 * the type is the guard, and this comment is only here to say why.
 *
 * Counting completed milestones and calling the percentage "progress" is the
 * tempting version, and it is wrong: it rewards making milestones smaller.
 */
export interface GoalWithDetail {
  readonly goal: Goal;
  readonly measurements: readonly Measurement[];
  readonly milestones: readonly Milestone[];
  readonly reviewDue: boolean;
}

export interface GoalsPanelProps {
  readonly goals: readonly GoalWithDetail[];
  readonly today: string;
  readonly onCreate: (input: {
    title: string;
    why?: string | null;
    successMeasure?: string | null;
    measureUnit?: string | null;
    startValue?: number | null;
    targetValue?: number | null;
    targetDate?: string | null;
  }) => Promise<void>;
  readonly onMeasure: (input: { goalId: string; value: number }) => Promise<void>;
  readonly onToggleMilestone: (input: { milestoneId: string; done: boolean }) => Promise<void>;
  readonly onAddMilestone: (input: { goalId: string; title: string }) => Promise<void>;
  readonly onArchive: (goalId: string) => Promise<void>;
  readonly onReview: (input: {
    goalId: string;
    progressNote: string | null;
    frictionNote: string | null;
    nextCommitment: string | null;
    verdict: GoalVerdict;
  }) => Promise<void>;
}

function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-label={label}
      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sunken"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

function GoalCard({
  entry,
  today,
  onMeasure,
  onToggleMilestone,
  onAddMilestone,
  onArchive,
  onReview,
}: {
  entry: GoalWithDetail;
  today: string;
} & Pick<
  GoalsPanelProps,
  'onMeasure' | 'onToggleMilestone' | 'onAddMilestone' | 'onArchive' | 'onReview'
>) {
  const { goal, measurements, milestones, reviewDue } = entry;
  const progress = goalProgress(goal, measurements, milestones);
  const [reading, setReading] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  const [frictionNote, setFrictionNote] = useState('');
  const [nextCommitment, setNextCommitment] = useState('');
  const [pending, start] = useTransition();
  const { show } = useToast();

  function run(work: () => Promise<void>, refusal: string) {
    start(async () => {
      try {
        await work();
      } catch {
        show(refusal, 'warn');
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-display-3 font-semibold text-ink">{goal.title}</h3>
          {goal.why === null ? null : (
            <p className="mt-1 text-body-sm text-ink-muted">{goal.why}</p>
          )}
        </div>
        {goal.status === 'active' ? null : (
          <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-label text-ink-muted">
            {goal.status}
          </span>
        )}
      </div>

      <p className="mt-3 text-body-sm text-ink">{progress.summary}</p>

      {progress.kind === 'measured' && progress.ratio !== null ? (
        <ProgressBar ratio={progress.ratio} label={`Progress towards ${goal.title}`} />
      ) : null}

      <p className="mt-2 text-body-sm text-ink-muted">{describeGoalTiming(goal, today)}</p>

      {goal.successMeasure === null ? null : (
        <p className="mt-2 rounded-md border border-line bg-sunken p-2 text-body-sm text-ink-muted">
          Done when: {goal.successMeasure}
        </p>
      )}

      {progress.kind === 'measured' ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(reading);
            if (!Number.isFinite(value)) return;
            setReading('');
            run(
              () => onMeasure({ goalId: goal.id, value }),
              'Could not record that reading. Nothing was saved.',
            );
          }}
        >
          <div className="w-32">
            <FormField label={`Today (${progress.unit})`}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="decimal"
                  value={reading}
                  onChange={(event) => setReading(event.target.value)}
                />
              )}
            </FormField>
          </div>
          <Button type="submit" variant="quiet" disabled={pending}>
            Record
          </Button>
        </form>
      ) : null}

      {milestones.length === 0 ? null : (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {milestones.map((milestone) => {
            const done = milestone.completedAt !== null;
            return (
              <li key={milestone.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={pending}
                    onChange={() =>
                      run(
                        () => onToggleMilestone({ milestoneId: milestone.id, done: !done }),
                        'Could not update that milestone.',
                      )
                    }
                    className="h-4 w-4 accent-[var(--c-accent)]"
                  />
                  <span className={done ? 'text-ink-muted line-through' : 'text-ink'}>
                    {milestone.title}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = milestoneTitle.trim();
            if (next.length === 0) return;
            setMilestoneTitle('');
            run(
              () => onAddMilestone({ goalId: goal.id, title: next }),
              'Could not add that milestone.',
            );
          }}
        >
          <div className="flex-1">
            <FormField label="Add a milestone" hint="A marker on the way, not a smaller goal.">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={milestoneTitle}
                  onChange={(event) => setMilestoneTitle(event.target.value)}
                />
              )}
            </FormField>
          </div>
          <Button type="submit" variant="quiet" disabled={pending}>
            Add
          </Button>
        </form>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {reviewing ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setReviewing(false);
              run(
                () =>
                  onReview({
                    goalId: goal.id,
                    progressNote: progressNote.trim() || null,
                    frictionNote: frictionNote.trim() || null,
                    nextCommitment: nextCommitment.trim() || null,
                    verdict: 'continue',
                  }),
                'Could not save the review.',
              );
            }}
          >
            <FormField label="What moved?">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={progressNote}
                  onChange={(event) => setProgressNote(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="What got in the way?">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={frictionNote}
                  onChange={(event) => setFrictionNote(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="Next week commits to">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={nextCommitment}
                  onChange={(event) => setNextCommitment(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={pending}>
                Keep going
              </Button>
              {/* The other verdicts are not failure states. Pausing a goal you
                  are not working on is more honest than carrying it. */}
              <Button
                type="button"
                variant="quiet"
                disabled={pending}
                onClick={() => {
                  setReviewing(false);
                  run(
                    () =>
                      onReview({
                        goalId: goal.id,
                        progressNote: progressNote.trim() || null,
                        frictionNote: frictionNote.trim() || null,
                        nextCommitment: nextCommitment.trim() || null,
                        verdict: 'pause',
                      }),
                    'Could not save the review.',
                  );
                }}
              >
                Pause it
              </Button>
              <Button type="button" variant="quiet" onClick={() => setReviewing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="min-h-11 text-body-sm text-accent hover:underline"
            >
              {reviewDue ? 'Weekly review — due' : 'Weekly review'}
            </button>
            {/* Archiving is a soft delete: the readings and reviews attached to
                this goal survive it, because they are a record of what the
                person actually did. */}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => onArchive(goal.id), 'Could not archive that goal.')}
              className="min-h-11 text-body-sm text-ink-muted hover:text-ink disabled:opacity-40"
            >
              Archive
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function GoalsPanel({
  goals,
  today,
  onCreate,
  onMeasure,
  onToggleMilestone,
  onAddMilestone,
  onArchive,
  onReview,
}: GoalsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [unit, setUnit] = useState('');
  const [startValue, setStartValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [pending, start] = useTransition();
  const { show } = useToast();

  return (
    <Section
      title="Goals"
      hint="Three at most is the honest number. A list of twelve is a list of none."
      action={
        adding ? null : (
          <Button variant="quiet" onClick={() => setAdding(true)}>
            Add a goal
          </Button>
        )
      }
    >
      {adding ? (
        <form
          className="mb-4 space-y-3 rounded-md border border-line bg-sunken p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const hasMeasure = unit.trim().length > 0 && targetValue.trim().length > 0;
            start(async () => {
              try {
                await onCreate({
                  title,
                  why: why.trim() || null,
                  // Either both of these or neither: half a measure renders a
                  // bar that cannot be read, and the schema refuses it anyway.
                  measureUnit: hasMeasure ? unit.trim() : null,
                  targetValue: hasMeasure ? Number(targetValue) : null,
                  startValue: hasMeasure && startValue.trim() ? Number(startValue) : null,
                });
                setTitle('');
                setWhy('');
                setUnit('');
                setStartValue('');
                setTargetValue('');
                setAdding(false);
              } catch {
                show('Could not save that goal. Nothing was created.', 'warn');
              }
            });
          }}
        >
          <FormField label="The goal">
            {({ id }) => (
              <TextInput
                id={id}
                autoFocus
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Run 10k without stopping"
              />
            )}
          </FormField>
          <FormField label="Why this, and why now?" hint="Optional, and the one you reread.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={why}
                onChange={(event) => setWhy(event.target.value)}
              />
            )}
          </FormField>

          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-1.5 text-body-sm font-medium text-ink">
              Measured by a number?
            </legend>
            <FormField label="Unit">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder="km"
                />
              )}
            </FormField>
            <FormField label="From">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={startValue}
                  onChange={(event) => setStartValue(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="To">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={targetValue}
                  onChange={(event) => setTargetValue(event.target.value)}
                />
              )}
            </FormField>
          </fieldset>
          <p className="text-body-sm text-ink-muted">
            Leave these blank for a goal you judge at review rather than measure. It will not be
            given a progress bar, because there would be nothing honest to put in it.
          </p>

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

      {goals.length === 0 ? (
        <EmptyState
          title="No goals yet."
          body="A goal is worth adding when you can say how you will know it happened."
        />
      ) : (
        <div className="space-y-3">
          {goals.map((entry) => (
            <GoalCard
              key={entry.goal.id}
              entry={entry}
              today={today}
              onMeasure={onMeasure}
              onToggleMilestone={onToggleMilestone}
              onAddMilestone={onAddMilestone}
              onArchive={onArchive}
              onReview={onReview}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
