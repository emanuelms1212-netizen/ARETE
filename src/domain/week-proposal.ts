import { addDays, weekdayOf } from './local-day';
import type { CommitmentKind, IsoDate } from './types';

/**
 * A proposed week, built from what is already true: unfinished tasks,
 * habits, the training plan's sessions and room to recover. It is only a
 * proposal — nothing is written until the person ticks what they want and
 * confirms — and it is deliberately light: a day never gets more than five
 * things, and tasks are spread rather than stacked.
 */
export const MAX_ITEMS_PER_DAY = 5;
export const MAX_TASKS_PER_DAY = 2;

export interface ProposalInputs {
  readonly weekStart: IsoDate;
  readonly availableWeekdays: readonly number[];
  readonly tasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly dueDate: IsoDate | null;
    readonly priority: number;
  }[];
  readonly habits: readonly { readonly id: string; readonly title: string }[];
  readonly sessions: readonly { readonly weekday: number; readonly title: string }[];
  readonly flexibilityWeekdays: readonly number[];
  /** What is already on each day, so nothing is proposed twice. */
  readonly existing: Readonly<Record<IsoDate, readonly { kind: string; title: string }[]>>;
}

export interface ProposedItem {
  /** Stable: the server recomputes the proposal and adds only items with these ids. */
  readonly id: string;
  readonly kind: CommitmentKind;
  readonly title: string;
  readonly refId: string | null;
  readonly reason: string;
}

export interface ProposedDay {
  readonly localDate: IsoDate;
  readonly items: readonly ProposedItem[];
  readonly note: string | null;
}

export interface WeekProposal {
  readonly days: readonly ProposedDay[];
  /** Tasks with no room this week, named rather than silently dropped. */
  readonly unplaced: readonly string[];
}

export function proposeWeek(input: ProposalInputs): WeekProposal {
  const dates = Array.from({ length: 7 }, (_, offset) => addDays(input.weekStart, offset));
  const available = new Set(
    input.availableWeekdays.length > 0 ? input.availableWeekdays : [0, 1, 2, 3, 4, 5, 6],
  );
  const days = dates.map((localDate) => ({
    localDate,
    items: [] as ProposedItem[],
    note: null as string | null,
  }));
  const exists = (date: IsoDate, kind: string, title: string) =>
    (input.existing[date] ?? []).some(
      (item) =>
        item.kind === kind && item.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );
  const push = (index: number, item: Omit<ProposedItem, 'id'>) => {
    const day = days[index]!;
    if (day.items.length >= MAX_ITEMS_PER_DAY) return false;
    if (exists(day.localDate, item.kind, item.title)) return false;
    day.items.push({ ...item, id: `${day.localDate}:${item.kind}:${item.refId ?? item.title}` });
    return true;
  };

  // Training from the plan, and recovery after back-to-back days.
  const trainingIndexes = new Set<number>();
  dates.forEach((date, index) => {
    const session = input.sessions.find((entry) => entry.weekday === weekdayOf(date));
    if (
      session &&
      push(index, {
        kind: 'workout',
        title: session.title,
        refId: null,
        reason: 'From your training plan.',
      })
    ) {
      trainingIndexes.add(index);
    }
  });
  let recoveries = 0;
  dates.forEach((date, index) => {
    if (trainingIndexes.has(index) || recoveries >= 2) return;
    const afterTwo = trainingIndexes.has(index - 1) && trainingIndexes.has(index - 2);
    const flexDay = input.flexibilityWeekdays.includes(weekdayOf(date));
    if (flexDay) {
      push(index, {
        kind: 'mobility',
        title: 'Flexibility session',
        refId: null,
        reason: 'One of your three flexibility days.',
      });
    } else if (afterTwo) {
      if (
        push(index, {
          kind: 'mobility',
          title: 'Easy walk or mobility',
          refId: null,
          reason: 'Recovery after two training days in a row.',
        })
      ) {
        recoveries += 1;
      }
    }
  });

  // Habits on the days the person is available.
  dates.forEach((date, index) => {
    if (!available.has(weekdayOf(date))) return;
    for (const habit of input.habits) {
      push(index, {
        kind: 'habit',
        title: habit.title,
        refId: habit.id,
        reason: 'A habit you keep.',
      });
    }
  });

  // Unfinished tasks: due soonest and most important first, spread two a day at most.
  const tasks = [...input.tasks].sort(
    (a, b) =>
      (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
      b.priority - a.priority,
  );
  const unplaced: string[] = [];
  const alreadyThisWeek = (title: string) => dates.some((date) => exists(date, 'task', title));
  for (const task of tasks) {
    // A task already on any day of the week is not proposed again.
    if (alreadyThisWeek(task.title)) continue;
    let placed = false;
    const candidates = dates
      .map((date, index) => ({ date, index }))
      .filter(({ date }) => available.has(weekdayOf(date)))
      .filter(
        ({ date }) =>
          task.dueDate === null || date <= task.dueDate || task.dueDate < input.weekStart,
      )
      .sort((a, b) => {
        const load = (index: number) =>
          days[index]!.items.filter((item) => item.kind === 'task').length;
        return load(a.index) - load(b.index) || a.index - b.index;
      });
    for (const { index } of candidates) {
      if (days[index]!.items.filter((item) => item.kind === 'task').length >= MAX_TASKS_PER_DAY)
        continue;
      const reason =
        task.dueDate === null
          ? 'Still open.'
          : task.dueDate < input.weekStart
            ? 'Past its due date — still worth a slot, or dropping.'
            : `Due ${task.dueDate}.`;
      if (push(index, { kind: 'task', title: task.title, refId: task.id, reason })) {
        placed = true;
        break;
      }
    }
    if (
      !placed &&
      !Object.values(input.existing).some((items) =>
        items.some((item) => item.kind === 'task' && item.title === task.title),
      )
    ) {
      unplaced.push(task.title);
    }
  }

  for (const day of days) {
    if (!available.has(weekdayOf(day.localDate)))
      day.note = 'You said you are usually not free this day.';
    else if (day.items.length >= MAX_ITEMS_PER_DAY)
      day.note = 'Full enough. Nothing more is added.';
  }
  return { days, unplaced };
}
