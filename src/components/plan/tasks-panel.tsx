'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { CheckIcon } from '@/components/icons';
import {
  Button,
  EmptyState,
  FormField,
  SegmentedControl,
  Section,
  TextInput,
  useToast,
} from '@/components/ui';
import { describeRecurrence } from '@/domain';
import type { Task, TaskView } from '@/persistence/repository';

/**
 * Tasks, in the four views that make a list usable.
 *
 * Inbox is the one that matters most: a task with no date is captured, not
 * forgotten. The difference between a system you trust with a thought and one
 * you have to think before using is whether it lets you write something down
 * without first deciding when you will do it.
 *
 * Energy and context are shown rather than hidden behind a filter, because
 * what you actually need at nine in the evening is to see which of these is
 * small, not to go and configure a view.
 */
export interface TasksPanelProps {
  readonly tasks: readonly Task[];
  readonly view: TaskView;
  readonly counts: Readonly<Record<string, number>>;
  readonly onChangeView: (view: TaskView) => void;
  readonly onCreate: (input: {
    title: string;
    scheduledDate?: string | null;
    energy?: 'low' | 'medium' | 'high' | null;
    parentTaskId?: string | null;
  }) => Promise<void>;
  readonly onSetStatus: (input: {
    taskId: string;
    status: 'open' | 'done' | 'dropped';
  }) => Promise<void>;
  readonly onSchedule: (input: { taskId: string; scheduledDate: string | null }) => Promise<void>;
  readonly today: string;
  readonly tomorrow: string;
}

const ENERGY_LABEL = { low: 'Low energy', medium: 'Medium energy', high: 'High energy' } as const;

function TaskRow({
  task,
  depth,
  today,
  tomorrow,
  pending,
  onSetStatus,
  onSchedule,
}: {
  task: Task;
  depth: number;
  today: string;
  tomorrow: string;
  pending: boolean;
} & Pick<TasksPanelProps, 'onSetStatus' | 'onSchedule'>) {
  const done = task.status === 'done';
  const date = task.scheduledDate ?? task.dueDate;
  const overdue = date !== null && date < today && !done;

  return (
    <li className={depth > 0 ? 'border-t border-line py-2 pl-8' : 'border-t border-line py-3'}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-pressed={done}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          disabled={pending}
          onClick={() => onSetStatus({ taskId: task.id, status: done ? 'open' : 'done' })}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'
          }`}
        >
          {done ? <CheckIcon size={12} /> : null}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-body ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>
            {task.title}
          </p>
          {/* One joined string rather than spans with their own separators:
              a flex gap plus a leading "·" in each span reads as a double
              space at every boundary. */}
          <p className="mt-0.5 text-body-sm text-ink-muted">
            {[
              date === null ? 'No date' : overdue ? `${date} · carried` : date,
              task.estimateMinutes === null ? null : `${task.estimateMinutes} min`,
              task.energy === null ? null : ENERGY_LABEL[task.energy],
              task.context,
              task.recurrence === null ? null : describeRecurrence(task.recurrence),
            ]
              .filter((part): part is string => part !== null && part !== undefined)
              .join(' · ')}
          </p>
        </div>

        {done || depth > 0 ? null : (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => onSchedule({ taskId: task.id, scheduledDate: today })}
              className="min-h-11 px-2 text-body-sm text-ink-muted hover:text-ink disabled:opacity-40"
            >
              Today
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSchedule({ taskId: task.id, scheduledDate: tomorrow })}
              className="min-h-11 px-2 text-body-sm text-ink-muted hover:text-ink disabled:opacity-40"
            >
              Tomorrow
            </button>
          </div>
        )}
      </div>

      {task.subtasks.length === 0 ? null : (
        <ul className="mt-1">
          {task.subtasks.map((subtask) => (
            <TaskRow
              key={subtask.id}
              task={subtask}
              depth={depth + 1}
              today={today}
              tomorrow={tomorrow}
              pending={pending}
              onSetStatus={onSetStatus}
              onSchedule={onSchedule}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const VIEWS: readonly { value: TaskView; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'someday', label: 'Someday' },
];

const EMPTY: Record<string, { title: string; body: string }> = {
  inbox: { title: 'Inbox is empty.', body: 'Write something down without deciding when yet.' },
  today: { title: 'Nothing due today.', body: 'That is allowed.' },
  upcoming: { title: 'Nothing in the next week.', body: 'Also allowed.' },
  someday: { title: 'Nothing parked.', body: 'Things you want to do eventually land here.' },
};

export function TasksPanel({
  tasks,
  view,
  counts,
  onChangeView,
  onCreate,
  onSetStatus,
  onSchedule,
  today,
  tomorrow,
}: TasksPanelProps) {
  const [optimisticTasks, patchTask] = useOptimistic(
    tasks,
    (current: readonly Task[], patch: { id: string; status: Task['status'] }) =>
      current.map((task) => (task.id === patch.id ? { ...task, status: patch.status } : task)),
  );
  const [title, setTitle] = useState('');
  const [pending, start] = useTransition();
  const { show } = useToast();

  const empty = EMPTY[view] ?? EMPTY['inbox']!;

  return (
    <Section title="Tasks" hint={`${counts[view] ?? 0} here`}>
      <div className="mb-3">
        <SegmentedControl
          legend="Which tasks"
          hideLegend
          options={VIEWS}
          value={view}
          onChange={onChangeView}
        />
      </div>

      <form
        className="mb-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = title.trim();
          if (next.length === 0) return;
          setTitle('');
          start(async () => {
            try {
              // Added to whichever view is open: in the Inbox it gets no date,
              // in Today it gets today's. Capturing should not require a
              // decision the user has not made yet.
              await onCreate({
                title: next,
                scheduledDate: view === 'today' ? today : view === 'upcoming' ? tomorrow : null,
              });
            } catch {
              show(`Could not add “${next}”.`, 'warn');
            }
          });
        }}
      >
        <div className="flex-1">
          <FormField label="Add a task">
            {({ id }) => (
              <TextInput
                id={id}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Something on your mind"
              />
            )}
          </FormField>
        </div>
        <Button type="submit" disabled={pending}>
          Add
        </Button>
      </form>

      {optimisticTasks.length === 0 ? (
        <EmptyState title={empty.title} body={empty.body} />
      ) : (
        <ul>
          {optimisticTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              depth={0}
              today={today}
              tomorrow={tomorrow}
              pending={pending}
              onSetStatus={(input) =>
                new Promise<void>((resolve) => {
                  start(async () => {
                    patchTask({ id: input.taskId, status: input.status });
                    try {
                      await onSetStatus(input);
                    } catch {
                      show('Could not update that task. It is unchanged.', 'warn');
                    }
                    resolve();
                  });
                })
              }
              onSchedule={(input) =>
                new Promise<void>((resolve) => {
                  start(async () => {
                    try {
                      await onSchedule(input);
                    } catch {
                      show('Could not move that task.', 'warn');
                    }
                    resolve();
                  });
                })
              }
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
