'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { CheckIcon, ChevronRightIcon, PlusIcon } from '@/components/icons';
import {
  Button,
  Dialog,
  EmptyState,
  FormField,
  Section,
  TextInput,
  useToast,
} from '@/components/ui';
import { computeDayProgress, type Commitment, type CommitmentKind, type Day } from '@/domain';

/**
 * The part of Today that the user actually operates.
 *
 * Every action here is optimistic: the list moves on the next frame and the
 * server catches up. The important half is what happens when the server says
 * no — the optimistic state is dropped, the real state reappears, and a toast
 * says what was refused. Optimism without that is just a lie with better
 * latency.
 *
 * React's `useOptimistic` gives the first half for free: the optimistic value
 * is discarded when the transition ends, so a failed action reverts simply by
 * not being reflected in the server's answer.
 */
export interface DayBoardProps {
  readonly day: Day;
  readonly minimumMode: boolean;
  readonly onSetStatus: (input: {
    commitmentId: string;
    status: Commitment['status'];
    skipReason?: string;
  }) => Promise<void>;
  readonly onAdd: (input: { kind: CommitmentKind; title: string }) => Promise<void>;
  readonly onReorder: (orderedIds: readonly string[]) => Promise<void>;
  readonly onSnooze: (commitmentId: string) => Promise<void>;
}

type Patch =
  | { type: 'status'; id: string; status: Commitment['status']; skipReason?: string }
  | { type: 'add'; title: string; kind: CommitmentKind }
  | { type: 'order'; ids: readonly string[] }
  | { type: 'snooze'; id: string };

function applyPatch(day: Day, patch: Patch): Day {
  switch (patch.type) {
    case 'status':
      return {
        ...day,
        commitments: day.commitments.map((item) =>
          item.id === patch.id
            ? {
                ...item,
                status: patch.status,
                ...(patch.skipReason === undefined ? {} : { skipReason: patch.skipReason }),
              }
            : item,
        ),
      };
    case 'add':
      return {
        ...day,
        commitments: [
          ...day.commitments,
          {
            // A placeholder id that no server row will ever have, so the real
            // row replacing it is obvious rather than ambiguous.
            id: `pending-${day.commitments.length}`,
            kind: patch.kind,
            title: patch.title,
            isMinimum: false,
            status: 'pending',
          },
        ],
      };
    case 'order': {
      const byId = new Map(day.commitments.map((item) => [item.id, item]));
      const ordered = patch.ids
        .map((id) => byId.get(id))
        .filter((item): item is Commitment => item !== undefined);
      const rest = day.commitments.filter((item) => !patch.ids.includes(item.id));
      return { ...day, commitments: [...ordered, ...rest] };
    }
    case 'snooze':
      return {
        ...day,
        commitments: day.commitments.map((item) =>
          item.id === patch.id ? { ...item, snoozedTo: 'tomorrow' } : item,
        ),
      };
  }
}

const KIND_LABEL: Record<CommitmentKind, string> = {
  habit: 'Habit',
  task: 'Task',
  focus: 'Focus',
  workout: 'Training',
  mobility: 'Mobility',
  mind: 'Mind',
  food: 'Food',
  review: 'Review',
};

export function DayBoard({
  day,
  minimumMode,
  onSetStatus,
  onAdd,
  onReorder,
  onSnooze,
}: DayBoardProps) {
  const [optimisticDay, addPatch] = useOptimistic(day, applyPatch);
  const [pending, start] = useTransition();
  const [skipping, setSkipping] = useState<Commitment | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const { show } = useToast();

  const progress = computeDayProgress(optimisticDay);

  /**
   * Runs an action optimistically and reports a refusal in words.
   *
   * The revert is React's: the optimistic patch lives only for the duration of
   * the transition, so when the action throws, the next render is the server's
   * truth again.
   */
  function run(patch: Patch, action: () => Promise<void>, refusal: string) {
    start(async () => {
      addPatch(patch);
      try {
        await action();
      } catch {
        show(refusal, 'warn');
      }
    });
  }

  // Items moved to another day stay visible, greyed, so that "I moved this"
  // reads differently from "this vanished".
  const visible = optimisticDay.commitments;

  return (
    <>
      <Section
        title="Today"
        hint={
          minimumMode
            ? `Running at the minimum · ${progress.minimumDone}/${progress.minimumTotal} done`
            : `${progress.done} done · ${progress.pending} open · ${progress.skipped} skipped`
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            title="Nothing planned yet."
            body="Add one thing. One is a real day when the day is against you."
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((commitment, index) => {
              const isDone = commitment.status === 'done';
              const isSkipped = commitment.status === 'skipped';
              const isMoved = commitment.snoozedTo !== undefined;
              const dimmed = isSkipped || isMoved;

              return (
                <li key={commitment.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-pressed={isDone}
                      aria-label={
                        isDone
                          ? `Mark ${commitment.title} not done`
                          : `Mark ${commitment.title} done`
                      }
                      disabled={isMoved}
                      onClick={() =>
                        run(
                          {
                            type: 'status',
                            id: commitment.id,
                            status: isDone ? 'pending' : 'done',
                          },
                          () =>
                            onSetStatus({
                              commitmentId: commitment.id,
                              status: isDone ? 'pending' : 'done',
                            }),
                          `Could not update “${commitment.title}”. It is unchanged.`,
                        )
                      }
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-40 ${
                        isDone
                          ? 'border-accent bg-accent text-on-accent'
                          : dimmed
                            ? 'border-line-strong border-dashed'
                            : 'border-line-strong'
                      }`}
                    >
                      {/* Skipped and moved are not "not done yet": a dash says
                          a decision was made, where an empty circle says the
                          day is still waiting. */}
                      {isDone ? (
                        <CheckIcon size={14} />
                      ) : dimmed ? (
                        <span aria-hidden="true" className="block h-0.5 w-2.5 bg-line-strong" />
                      ) : null}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-body ${dimmed ? 'text-ink-muted' : 'text-ink'} ${
                          isDone ? 'line-through decoration-ink-muted' : ''
                        }`}
                      >
                        {commitment.title}
                      </p>
                      <p className="mt-0.5 text-body-sm text-ink-muted">
                        {KIND_LABEL[commitment.kind]}
                        {commitment.isMinimum ? ' · Minimum' : ''}
                        {isSkipped && commitment.skipReason ? ` · ${commitment.skipReason}` : ''}
                        {isMoved ? ' · Moved to tomorrow' : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {/* Reorder by one place, with buttons rather than drag:
                          a drag handle is unreachable by keyboard and fiddly
                          with a thumb, which is how this screen is used. */}
                      <button
                        type="button"
                        aria-label={`Move ${commitment.title} up`}
                        disabled={index === 0 || pending}
                        onClick={() => {
                          const ids = visible.map((item) => item.id);
                          const swapped = [...ids];
                          const previous = swapped[index - 1];
                          const current = swapped[index];
                          if (previous === undefined || current === undefined) return;
                          swapped[index - 1] = current;
                          swapped[index] = previous;
                          run(
                            { type: 'order', ids: swapped },
                            () => onReorder(swapped),
                            'Could not reorder. The list is unchanged.',
                          );
                        }}
                        className="min-h-11 rotate-[-90deg] px-1 text-ink-muted disabled:opacity-30"
                      >
                        <ChevronRightIcon size={16} />
                      </button>

                      <button
                        type="button"
                        disabled={isMoved || pending}
                        onClick={() => {
                          setSkipReason('');
                          setSkipping(commitment);
                        }}
                        className="min-h-11 px-2 text-body-sm text-ink-muted hover:text-ink disabled:opacity-30"
                      >
                        Skip
                      </button>

                      <button
                        type="button"
                        disabled={isMoved || pending}
                        onClick={() =>
                          run(
                            { type: 'snooze', id: commitment.id },
                            () => onSnooze(commitment.id),
                            `Could not move “${commitment.title}”. It is still on today.`,
                          )
                        }
                        className="min-h-11 px-2 text-body-sm text-ink-muted hover:text-ink disabled:opacity-30"
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 border-t border-line pt-3">
          {adding ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const title = newTitle.trim();
                if (title.length === 0) return;
                setNewTitle('');
                setAdding(false);
                run(
                  { type: 'add', title, kind: 'task' },
                  () => onAdd({ kind: 'task', title }),
                  `Could not add “${title}”. It was not saved.`,
                );
              }}
              className="flex items-end gap-2"
            >
              <div className="flex-1">
                <FormField label="What else?">
                  {({ id, describedBy }) => (
                    <TextInput
                      id={id}
                      aria-describedby={describedBy}
                      autoFocus
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      placeholder="One thing"
                    />
                  )}
                </FormField>
              </div>
              <Button type="submit">Add</Button>
              <Button type="button" variant="quiet" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-11 items-center gap-2 text-body-sm text-accent hover:underline"
            >
              <PlusIcon size={16} />
              Add something
            </button>
          )}
        </div>
      </Section>

      {/* A skip asks why, because that is what makes it a decision rather than
          a failure — and the reason is what the adaptive engine reads. */}
      <Dialog
        open={skipping !== null}
        onClose={() => setSkipping(null)}
        title={skipping === null ? '' : `Skip “${skipping.title}”?`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const commitment = skipping;
            const reason = skipReason.trim();
            if (commitment === null || reason.length === 0) return;
            setSkipping(null);
            run(
              { type: 'status', id: commitment.id, status: 'skipped', skipReason: reason },
              () =>
                onSetStatus({
                  commitmentId: commitment.id,
                  status: 'skipped',
                  skipReason: reason,
                }),
              `Could not skip “${commitment.title}”. It is unchanged.`,
            );
          }}
          className="space-y-4"
        >
          <p className="text-body-sm text-ink-muted">
            A skip is not a miss. The reason is what lets the week adapt instead of just recording
            that something did not happen.
          </p>
          <FormField label="What got in the way?">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                autoFocus
                required
                value={skipReason}
                onChange={(event) => setSkipReason(event.target.value)}
                placeholder="Slept badly"
              />
            )}
          </FormField>
          <div className="flex gap-2">
            <Button type="submit">Skip it</Button>
            <Button type="button" variant="quiet" onClick={() => setSkipping(null)}>
              Keep it
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
