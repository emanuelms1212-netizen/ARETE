import {
  expand,
  goalSchema,
  pausePatch,
  resumePatch,
  finishPatch,
  type Day,
  type FocusSession as FocusTimerSession,
  type Goal,
  type Habit,
  type HabitLog,
  type IsoDate,
  type Measurement,
  type Milestone,
  type Recurrence,
  type Virtue,
} from '@/domain';
import type { DemoSeed } from '../demo-data';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type DayFraming,
  type DayReview,
  type FocusSession as FocusSessionRecord,
  type GoalDetail,
  type GoalInput,
  type GoalReview,
  type HabitInput,
  type HabitWithSchedule,
  type StartFocusInput,
  type Task,
  type TaskInput,
  type TaskView,
} from '../repository';

/**
 * The in-memory half of the daily system.
 *
 * Kept beside the demo repository rather than inside it because the day loop
 * added five entities at once, and a single eight-hundred-line file is harder
 * to hold in the head than two. The behaviour is the contract's, not this
 * file's: `repository-contract.ts` runs identically against this and against
 * the SQL adapter, and anything that passes here and fails there is a bug in
 * one of them rather than a difference of opinion.
 *
 * Deterministic ids, because screenshots and tests both depend on the same
 * seed producing the same screen.
 */
export interface DayAccess {
  /**
   * A finished timer, as the record the SQL adapter keeps in the same table,
   * so both adapters answer `listFocusSessions` the same way.
   */
  onFocusFinished?(userId: string, session: FocusSessionRecord): void;
  getDay(userId: string, localDate: IsoDate): Day | undefined;
  requireDay(userId: string, localDate: IsoDate): Day;
  saveDay(userId: string, day: Day): Day;
  emptyDay(localDate: IsoDate): Day;
}

interface GoalRecord {
  goal: Goal;
  measurements: Measurement[];
  milestones: Milestone[];
  reviews: GoalReview[];
}

export function createMemoryDailySystem(access: DayAccess) {
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  const goals = new Map<string, Map<string, GoalRecord>>();
  const tasks = new Map<string, Map<string, Task>>();
  const habits = new Map<string, Map<string, { habit: Habit; schedule: Recurrence | null }>>();
  const habitLogs = new Map<string, Map<string, HabitLog>>();
  const framings = new Map<string, DayFraming>();
  const focusStarts = new Map<string, { localDate: IsoDate; clientToken: string }>();
  const reviews = new Map<string, DayReview>();
  const focus = new Map<string, FocusTimerSession>();
  const focusTokens = new Map<string, string>();

  function bucket<T>(store: Map<string, Map<string, T>>, userId: string): Map<string, T> {
    let found = store.get(userId);
    if (!found) {
      found = new Map<string, T>();
      store.set(userId, found);
    }
    return found;
  }

  const dayKey = (userId: string, localDate: IsoDate) => `${userId}::${localDate}`;

  function requireGoal(userId: string, goalId: string): GoalRecord {
    const record = bucket(goals, userId).get(goalId);
    if (!record) throw new RecordNotFoundError(`No goal ${goalId} for this account`);
    return record;
  }

  function requireTask(userId: string, taskId: string): Task {
    const task = bucket(tasks, userId).get(taskId);
    if (!task) throw new RecordNotFoundError(`No task ${taskId} for this account`);
    return task;
  }

  function withSubtasks(userId: string, task: Task): Task {
    const subtasks = [...bucket(tasks, userId).values()]
      .filter((candidate) => candidate.parentTaskId === task.id && candidate.archivedAt === null)
      .sort((a, b) => a.title.localeCompare(b.title));
    return { ...task, subtasks };
  }

  /**
   * Fills the demo account so the Plan screen has something real in it.
   *
   * Writes straight into the maps rather than going through the public methods
   * so that seeded history can carry past dates, which `logHabit` deliberately
   * will not accept from a caller.
   */
  function seed(userId: string, data: DemoSeed): void {
    for (const entry of data.goals) {
      const goal = goalSchema.parse({
        id: nextId('goal'),
        title: entry.title,
        why: entry.why ?? null,
        successMeasure: entry.successMeasure ?? null,
        measureUnit: entry.measureUnit ?? null,
        startValue: entry.startValue ?? null,
        targetValue: entry.targetValue ?? null,
        status: 'active',
        targetDate: entry.targetDate ?? null,
        maintenanceDate: null,
        reviewDay: null,
        archivedAt: null,
      });

      bucket(goals, userId).set(goal.id, {
        goal,
        measurements: (entry.readings ?? []).map(([localDate, value]) => ({ localDate, value })),
        milestones: (entry.milestones ?? []).map((title) => ({
          id: nextId('milestone'),
          title,
          dueDate: null,
          completedAt: null,
        })),
        reviews: [],
      });
    }

    for (const entry of data.tasks) {
      const task: Task = {
        id: nextId('task'),
        title: entry.title,
        notes: null,
        status: 'open',
        scheduledDate: entry.scheduledDate ?? null,
        dueDate: null,
        estimateMinutes: entry.estimateMinutes ?? null,
        priority: 0,
        energy: entry.energy ?? null,
        context: entry.context ?? null,
        projectId: null,
        goalId: null,
        parentTaskId: null,
        recurrence: null,
        recurrenceAnchor: null,
        completedAt: null,
        archivedAt: null,
        subtasks: [],
      };
      bucket(tasks, userId).set(task.id, task);

      for (const childTitle of entry.subtasks ?? []) {
        const child: Task = {
          ...task,
          id: nextId('task'),
          title: childTitle,
          parentTaskId: task.id,
          subtasks: [],
        };
        bucket(tasks, userId).set(child.id, child);
      }
    }

    for (const entry of data.habits) {
      const habit: Habit = {
        id: nextId('habit'),
        title: entry.title,
        kind: entry.kind,
        unit: entry.unit ?? null,
        targetValue: entry.targetValue ?? null,
        minimumTarget: entry.minimumTarget ?? null,
        goalId: null,
        pausedAt: null,
        archivedAt: null,
      };
      bucket(habits, userId).set(habit.id, { habit, schedule: null });

      for (const [localDate, status, value] of entry.logs ?? []) {
        bucket(habitLogs, userId).set(`${habit.id}::${localDate}`, {
          habitId: habit.id,
          localDate,
          status,
          value: value ?? null,
          skipReason: status === 'skipped' ? 'Not today' : null,
        });
      }
    }
  }

  const mine = (key: string, userId: string) => key.startsWith(`${userId}::`);

  return {
    seed,

    /** Deletion helpers for the repository; not part of the repository interface. */
    admin: {
      /** The journal's daily pages: framing words and evening reviews. Switches stay. */
      forgetJournal(userId: string) {
        for (const [key, framing] of [...framings.entries()]) {
          if (!mine(key, userId)) continue;
          framings.set(key, {
            ...framing,
            intention: null,
            inMyControl: null,
            notMyControl: null,
            virtue: null,
            obstacle: null,
          });
        }
        for (const key of [...reviews.keys()]) if (mine(key, userId)) reviews.delete(key);
      },
      forgetFocus(userId: string) {
        const running = focus.get(userId);
        if (running) focusStarts.delete(running.id);
        focus.delete(userId);
        for (const key of [...focusTokens.keys()]) if (mine(key, userId)) focusTokens.delete(key);
      },
      forgetEverything(userId: string) {
        this.forgetFocus(userId);
        goals.delete(userId);
        tasks.delete(userId);
        habits.delete(userId);
        habitLogs.delete(userId);
        for (const key of [...framings.keys()]) if (mine(key, userId)) framings.delete(key);
        for (const key of [...reviews.keys()]) if (mine(key, userId)) reviews.delete(key);
      },
    },

    // -----------------------------------------------------------------------
    // Goals
    // -----------------------------------------------------------------------
    async listGoals(userId: string, options?: { includeArchived?: boolean }) {
      return [...bucket(goals, userId).values()]
        .map((record) => record.goal)
        .filter((goal) => (options?.includeArchived ?? false) || goal.archivedAt === null)
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    async getGoal(userId: string, goalId: string): Promise<GoalDetail | null> {
      const record = bucket(goals, userId).get(goalId);
      if (!record) return null;
      return {
        goal: record.goal,
        measurements: [...record.measurements].sort((a, b) =>
          a.localDate.localeCompare(b.localDate),
        ),
        milestones: [...record.milestones],
        latestReview:
          [...record.reviews].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] ?? null,
      };
    },

    async createGoal(userId: string, input: GoalInput): Promise<Goal> {
      // Parsed rather than trusted: the schema is what refuses half a measure,
      // and refusing it here means the SQL adapter is not the only guard.
      const goal = goalSchema.parse({
        id: nextId('goal'),
        title: input.title,
        why: input.why ?? null,
        successMeasure: input.successMeasure ?? null,
        measureUnit: input.measureUnit ?? null,
        startValue: input.startValue ?? null,
        targetValue: input.targetValue ?? null,
        status: 'active',
        targetDate: input.targetDate ?? null,
        maintenanceDate: input.maintenanceDate ?? null,
        reviewDay: input.reviewDay ?? null,
        archivedAt: null,
      });

      bucket(goals, userId).set(goal.id, {
        goal,
        measurements: [],
        milestones: [],
        reviews: [],
      });
      return goal;
    },

    async updateGoal(userId: string, goalId: string, input: Partial<GoalInput>): Promise<Goal> {
      const record = requireGoal(userId, goalId);
      record.goal = goalSchema.parse({ ...record.goal, ...input });
      return record.goal;
    },

    async setGoalStatus(userId: string, goalId: string, status: Goal['status']): Promise<Goal> {
      const record = requireGoal(userId, goalId);
      record.goal = { ...record.goal, status };
      return record.goal;
    },

    async archiveGoal(userId: string, goalId: string, at: Date): Promise<void> {
      const record = requireGoal(userId, goalId);
      record.goal = { ...record.goal, archivedAt: at };
    },

    async recordMeasurement(
      userId: string,
      input: {
        goalId: string;
        localDate: IsoDate;
        timeZone: string;
        value: number;
        note?: string | null;
        clientToken: string;
      },
    ) {
      const record = requireGoal(userId, input.goalId);
      // One reading per day: a second reading for the same day replaces the
      // first rather than making the series lumpy.
      const existing = record.measurements.findIndex((m) => m.localDate === input.localDate);
      const measurement: Measurement = { localDate: input.localDate, value: input.value };
      if (existing >= 0) record.measurements[existing] = measurement;
      else record.measurements.push(measurement);

      return [...record.measurements].sort((a, b) => a.localDate.localeCompare(b.localDate));
    },

    async addMilestone(
      userId: string,
      input: { goalId: string; title: string; dueDate?: IsoDate | null },
    ): Promise<Milestone> {
      const record = requireGoal(userId, input.goalId);
      const milestone: Milestone = {
        id: nextId('milestone'),
        title: input.title,
        dueDate: input.dueDate ?? null,
        completedAt: null,
      };
      record.milestones.push(milestone);
      return milestone;
    },

    async setMilestoneDone(userId: string, milestoneId: string, at: Date | null) {
      for (const record of bucket(goals, userId).values()) {
        const index = record.milestones.findIndex((m) => m.id === milestoneId);
        if (index < 0) continue;
        const current = record.milestones[index];
        if (current === undefined) continue;
        record.milestones[index] = { ...current, completedAt: at };
        return [...record.milestones];
      }
      throw new RecordNotFoundError(`No milestone ${milestoneId} for this account`);
    },

    async saveGoalReview(userId: string, input: GoalReview & { timeZone: string }) {
      const record = requireGoal(userId, input.goalId);
      const review: GoalReview = {
        goalId: input.goalId,
        weekStart: input.weekStart,
        progressNote: input.progressNote,
        frictionNote: input.frictionNote,
        nextCommitment: input.nextCommitment,
        verdict: input.verdict,
      };

      const index = record.reviews.findIndex((r) => r.weekStart === input.weekStart);
      if (index >= 0) record.reviews[index] = review;
      else record.reviews.push(review);

      // The verdict is the user's decision about the goal, so it moves the
      // goal. A review that changes nothing is a form, not a review.
      if (input.verdict === 'pause') record.goal = { ...record.goal, status: 'paused' };
      if (input.verdict === 'drop') record.goal = { ...record.goal, status: 'abandoned' };
      if (input.verdict === 'done') record.goal = { ...record.goal, status: 'done' };
      if (input.verdict === 'continue' && record.goal.status === 'paused') {
        record.goal = { ...record.goal, status: 'active' };
      }

      return review;
    },

    async listGoalReviews(userId: string, goalId: string) {
      return [...requireGoal(userId, goalId).reviews].sort((a, b) =>
        b.weekStart.localeCompare(a.weekStart),
      );
    },

    // -----------------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------------
    async listTasks(
      userId: string,
      options: { view: TaskView; today: IsoDate; horizonDays?: number },
    ) {
      const horizon = options.horizonDays ?? 7;
      const all = [...bucket(tasks, userId).values()].filter((task) => task.archivedAt === null);

      // Subtasks are returned nested inside their parent, never alongside it.
      const roots = all.filter((task) => task.parentTaskId === null);

      const matches = roots.filter((task) => {
        if (options.view === 'all') return true;
        if (task.status !== 'open') return false;

        switch (options.view) {
          case 'inbox':
            // Captured, not yet decided: no date of any kind.
            return task.scheduledDate === null && task.dueDate === null;
          case 'today':
            return (
              (task.scheduledDate !== null && task.scheduledDate <= options.today) ||
              (task.dueDate !== null && task.dueDate <= options.today)
            );
          case 'upcoming': {
            const date = task.scheduledDate ?? task.dueDate;
            if (date === null) return false;
            const limit = addDaysIso(options.today, horizon);
            return date > options.today && date <= limit;
          }
          case 'someday': {
            const date = task.scheduledDate ?? task.dueDate;
            return date !== null && date > addDaysIso(options.today, horizon);
          }
        }
      });

      return matches
        .map((task) => withSubtasks(userId, task))
        .sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          const aDate = a.scheduledDate ?? a.dueDate ?? '9999-12-31';
          const bDate = b.scheduledDate ?? b.dueDate ?? '9999-12-31';
          if (aDate !== bDate) return aDate.localeCompare(bDate);
          return a.title.localeCompare(b.title);
        });
    },

    async getTask(userId: string, taskId: string) {
      const task = bucket(tasks, userId).get(taskId);
      return task ? withSubtasks(userId, task) : null;
    },

    async createTask(userId: string, input: TaskInput): Promise<Task> {
      const parentId = input.parentTaskId ?? null;
      if (parentId !== null) {
        const parent = requireTask(userId, parentId);
        // Mirrors the database trigger, so demo mode refuses what production
        // refuses instead of discovering it later.
        if (parent.parentTaskId !== null) {
          throw new InvalidWriteError(
            'Subtasks are one level deep. This parent is already a subtask.',
          );
        }
        if ((input.recurrence ?? null) !== null) {
          throw new InvalidWriteError('A subtask cannot recur. Put the recurrence on the parent.');
        }
      }

      const task: Task = {
        id: nextId('task'),
        title: input.title,
        notes: input.notes ?? null,
        status: 'open',
        scheduledDate: input.scheduledDate ?? null,
        dueDate: input.dueDate ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        priority: input.priority ?? 0,
        energy: input.energy ?? null,
        context: input.context ?? null,
        projectId: input.projectId ?? null,
        goalId: input.goalId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        recurrence: input.recurrence ?? null,
        recurrenceAnchor:
          (input.recurrence ?? null) !== null ? (input.scheduledDate ?? null) : null,
        completedAt: null,
        archivedAt: null,
        subtasks: [],
      };

      bucket(tasks, userId).set(task.id, task);
      return task;
    },

    async updateTask(userId: string, taskId: string, input: Partial<TaskInput>): Promise<Task> {
      const task = requireTask(userId, taskId);
      if ((input.recurrence ?? null) !== null && task.parentTaskId !== null) {
        throw new InvalidWriteError('A subtask cannot recur. Put the recurrence on the parent.');
      }
      const updated: Task = { ...task, ...input, subtasks: [] };
      bucket(tasks, userId).set(taskId, updated);
      return withSubtasks(userId, updated);
    },

    async setTaskStatus(
      userId: string,
      input: { taskId: string; status: Task['status']; at: Date; today: IsoDate },
    ): Promise<Task> {
      const task = requireTask(userId, input.taskId);

      // Completing a recurring task advances the series rather than ending it.
      // Without this, "water the plants, every Tuesday" is done forever the
      // first time it is ticked.
      if (input.status === 'done' && task.recurrence !== null) {
        // Counted from the series' own anchor, not from the day it was ticked,
        // so finishing late does not shift every future occurrence.
        const anchor = task.recurrenceAnchor ?? task.scheduledDate ?? input.today;
        const after = task.scheduledDate ?? input.today;
        const upcoming = expand(
          task.recurrence,
          anchor,
          addDaysIso(after, 1),
          addDaysIso(after, 400),
        );
        const next = upcoming[0] ?? null;

        const advanced: Task = {
          ...task,
          scheduledDate: next,
          status: next === null ? 'done' : 'open',
          completedAt: next === null ? input.at : null,
          subtasks: [],
        };
        bucket(tasks, userId).set(task.id, advanced);
        return withSubtasks(userId, advanced);
      }

      const updated: Task = {
        ...task,
        status: input.status,
        completedAt: input.status === 'done' ? input.at : null,
        subtasks: [],
      };
      bucket(tasks, userId).set(task.id, updated);
      return withSubtasks(userId, updated);
    },

    async archiveTask(userId: string, taskId: string, at: Date): Promise<void> {
      const task = requireTask(userId, taskId);
      bucket(tasks, userId).set(taskId, { ...task, archivedAt: at });
      // Archiving a parent archives its children; an orphaned subtask is a
      // task nobody will ever see again but which still counts in totals.
      for (const [id, candidate] of bucket(tasks, userId)) {
        if (candidate.parentTaskId === taskId) {
          bucket(tasks, userId).set(id, { ...candidate, archivedAt: at });
        }
      }
    },

    // -----------------------------------------------------------------------
    // Habits
    // -----------------------------------------------------------------------
    async listHabits(userId: string, options?: { includeArchived?: boolean }) {
      return [...bucket(habits, userId).values()]
        .filter((entry) => (options?.includeArchived ?? false) || entry.habit.archivedAt === null)
        .map((entry): HabitWithSchedule => ({ habit: entry.habit, schedule: entry.schedule }))
        .sort((a, b) => a.habit.title.localeCompare(b.habit.title));
    },

    async createHabit(userId: string, input: HabitInput): Promise<Habit> {
      if (input.kind !== 'binary' && (input.targetValue ?? null) === null) {
        throw new InvalidWriteError(`A ${input.kind} habit needs a target value.`);
      }

      const habit: Habit = {
        id: nextId('habit'),
        title: input.title,
        kind: input.kind,
        unit: input.unit ?? null,
        targetValue: input.targetValue ?? null,
        minimumTarget: input.minimumTarget ?? null,
        goalId: input.goalId ?? null,
        pausedAt: null,
        archivedAt: null,
      };

      bucket(habits, userId).set(habit.id, { habit, schedule: input.schedule ?? null });
      return habit;
    },

    async updateHabit(userId: string, habitId: string, input: Partial<HabitInput>): Promise<Habit> {
      const entry = bucket(habits, userId).get(habitId);
      if (!entry) throw new RecordNotFoundError(`No habit ${habitId} for this account`);

      const habit: Habit = {
        ...entry.habit,
        ...('title' in input && input.title !== undefined ? { title: input.title } : {}),
        ...('kind' in input && input.kind !== undefined ? { kind: input.kind } : {}),
        ...('unit' in input ? { unit: input.unit ?? null } : {}),
        ...('targetValue' in input ? { targetValue: input.targetValue ?? null } : {}),
        ...('minimumTarget' in input ? { minimumTarget: input.minimumTarget ?? null } : {}),
        ...('goalId' in input ? { goalId: input.goalId ?? null } : {}),
      };

      bucket(habits, userId).set(habitId, {
        habit,
        schedule: 'schedule' in input ? (input.schedule ?? null) : entry.schedule,
      });
      return habit;
    },

    async setHabitPaused(userId: string, habitId: string, at: Date | null): Promise<Habit> {
      const entry = bucket(habits, userId).get(habitId);
      if (!entry) throw new RecordNotFoundError(`No habit ${habitId} for this account`);
      entry.habit = { ...entry.habit, pausedAt: at };
      return entry.habit;
    },

    async archiveHabit(userId: string, habitId: string, at: Date): Promise<void> {
      const entry = bucket(habits, userId).get(habitId);
      if (!entry) throw new RecordNotFoundError(`No habit ${habitId} for this account`);
      entry.habit = { ...entry.habit, archivedAt: at };
    },

    async logHabit(
      userId: string,
      input: {
        habitId: string;
        localDate: IsoDate;
        timeZone: string;
        status: HabitLog['status'];
        value?: number | null;
        skipReason?: string | null;
        clientToken: string;
      },
    ): Promise<HabitLog> {
      if (!bucket(habits, userId).has(input.habitId)) {
        throw new RecordNotFoundError(`No habit ${input.habitId} for this account`);
      }
      if (input.status === 'skipped' && (input.skipReason ?? null) === null) {
        throw new InvalidWriteError('A skip needs a reason — that is what makes it not a failure.');
      }
      if (input.status === 'partial' && (input.value ?? null) === null) {
        throw new InvalidWriteError('A partial log needs the value that made it partial.');
      }

      const log: HabitLog = {
        habitId: input.habitId,
        localDate: input.localDate,
        status: input.status,
        value: input.value ?? null,
        skipReason: input.skipReason ?? null,
      };

      // One log per habit per day: logging twice replaces rather than stacking.
      bucket(habitLogs, userId).set(`${input.habitId}::${input.localDate}`, log);
      return log;
    },

    async listHabitLogs(userId: string, range: { from: IsoDate; to: IsoDate }) {
      return [...bucket(habitLogs, userId).values()]
        .filter((log) => log.localDate >= range.from && log.localDate <= range.to)
        .sort((a, b) => a.localDate.localeCompare(b.localDate));
    },

    // -----------------------------------------------------------------------
    // The day's framing, edits and review
    // -----------------------------------------------------------------------
    async getFraming(userId: string, localDate: IsoDate): Promise<DayFraming> {
      return (
        framings.get(dayKey(userId, localDate)) ?? {
          intention: null,
          inMyControl: null,
          notMyControl: null,
          virtue: null,
          obstacle: null,
          minimumMode: false,
        }
      );
    },

    async setFraming(
      userId: string,
      input: {
        localDate: IsoDate;
        timeZone: string;
        intention?: string | null;
        inMyControl?: string | null;
        notMyControl?: string | null;
        virtue?: Virtue | null;
        obstacle?: string | null;
      },
    ): Promise<DayFraming> {
      const current = framings.get(dayKey(userId, input.localDate)) ?? {
        intention: null,
        inMyControl: null,
        notMyControl: null,
        virtue: null,
        obstacle: null,
        minimumMode: false,
      };

      const next: DayFraming = {
        intention: 'intention' in input ? (input.intention ?? null) : current.intention,
        inMyControl: 'inMyControl' in input ? (input.inMyControl ?? null) : current.inMyControl,
        notMyControl: 'notMyControl' in input ? (input.notMyControl ?? null) : current.notMyControl,
        virtue: 'virtue' in input ? (input.virtue ?? null) : current.virtue,
        obstacle: 'obstacle' in input ? (input.obstacle ?? null) : current.obstacle,
        minimumMode: current.minimumMode,
      };

      framings.set(dayKey(userId, input.localDate), next);
      return next;
    },

    async setMinimumMode(
      userId: string,
      input: { localDate: IsoDate; timeZone: string; on: boolean; at: Date },
    ): Promise<Day> {
      const current = framings.get(dayKey(userId, input.localDate)) ?? {
        intention: null,
        inMyControl: null,
        notMyControl: null,
        virtue: null,
        obstacle: null,
        minimumMode: false,
      };
      framings.set(dayKey(userId, input.localDate), { ...current, minimumMode: input.on });

      // Minimum mode changes what is asked of the day, never the verdict on it:
      // no status is touched here, and nothing is marked skipped or failed.
      const day = access.getDay(userId, input.localDate) ?? access.emptyDay(input.localDate);
      return access.saveDay(userId, day);
    },

    async addCommitment(
      userId: string,
      input: {
        localDate: IsoDate;
        timeZone: string;
        commitment: {
          kind: Day['commitments'][number]['kind'];
          title: string;
          isMinimum?: boolean;
          refId?: string;
        };
      },
    ): Promise<Day> {
      const day = access.getDay(userId, input.localDate) ?? access.emptyDay(input.localDate);
      const commitment = {
        id: nextId('commitment'),
        kind: input.commitment.kind,
        title: input.commitment.title,
        isMinimum: input.commitment.isMinimum ?? false,
        status: 'pending' as const,
        ...(input.commitment.refId !== undefined ? { refId: input.commitment.refId } : {}),
      };

      return access.saveDay(userId, {
        ...day,
        commitments: [...day.commitments, commitment],
      });
    },

    async reorderCommitments(
      userId: string,
      input: { localDate: IsoDate; orderedIds: readonly string[] },
    ): Promise<Day> {
      const day = access.requireDay(userId, input.localDate);
      const byId = new Map(day.commitments.map((item) => [item.id, item]));

      const ordered = input.orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is Day['commitments'][number] => item !== undefined);

      // Anything the caller did not mention keeps its relative place at the end,
      // so a stale list from a slow client cannot silently drop an item.
      const mentioned = new Set(input.orderedIds);
      const rest = day.commitments.filter((item) => !mentioned.has(item.id));

      return access.saveDay(userId, { ...day, commitments: [...ordered, ...rest] });
    },

    async snoozeCommitment(
      userId: string,
      input: {
        localDate: IsoDate;
        commitmentId: string;
        to: IsoDate;
        timeZone: string;
        at: Date;
      },
    ): Promise<Day> {
      if (input.to <= input.localDate) {
        throw new InvalidWriteError('A commitment can only be moved to a later day.');
      }

      const day = access.requireDay(userId, input.localDate);
      const moving = day.commitments.find((item) => item.id === input.commitmentId);
      if (!moving)
        throw new RecordNotFoundError(`No commitment ${input.commitmentId} on ${input.localDate}`);

      const target = access.getDay(userId, input.to) ?? access.emptyDay(input.to);
      access.saveDay(userId, {
        ...target,
        commitments: [
          ...target.commitments,
          { ...moving, id: nextId('commitment'), status: 'pending' as const },
        ],
      });

      // The original stays on the day it was moved off, marked with where it
      // went: "I moved this" must stay distinguishable from "I ignored this".
      return access.saveDay(userId, {
        ...day,
        commitments: day.commitments.map((item) =>
          item.id === input.commitmentId ? { ...item, snoozedTo: input.to } : item,
        ),
      });
    },

    async getDayReview(userId: string, localDate: IsoDate): Promise<DayReview | null> {
      return reviews.get(dayKey(userId, localDate)) ?? null;
    },

    async saveDayReview(
      userId: string,
      input: DayReview & { timeZone: string },
    ): Promise<DayReview> {
      const review: DayReview = {
        localDate: input.localDate,
        wentWell: input.wentWell,
        friction: input.friction,
        tomorrowOneThing: input.tomorrowOneThing,
        learned:
          'learned' in input
            ? (input.learned ?? null)
            : (reviews.get(dayKey(userId, input.localDate))?.learned ?? null),
        energy: input.energy,
        metMinimum: input.metMinimum,
      };
      reviews.set(dayKey(userId, input.localDate), review);
      return review;
    },

    // -----------------------------------------------------------------------
    // The live focus timer
    // -----------------------------------------------------------------------
    async startFocusSession(userId: string, input: StartFocusInput): Promise<FocusTimerSession> {
      // Idempotency is checked before the one-at-a-time rule, because a retry
      // of the start that succeeded must return that session rather than be
      // rejected for having succeeded.
      const seen = focusTokens.get(`${userId}::${input.clientToken}`);
      if (seen !== undefined) {
        const existing = focus.get(userId);
        if (existing !== undefined && existing.id === seen) return existing;
      }

      const running = focus.get(userId);
      if (running !== undefined && running.status === 'running') {
        throw new InvalidWriteError('A focus session is already running.');
      }

      const taskId = input.taskId ?? null;
      const goalId = input.goalId ?? null;

      const session: FocusTimerSession = {
        id: nextId('focus'),
        kind: input.kind,
        status: 'running',
        plannedMinutes: input.plannedMinutes,
        startedAt: input.startedAt,
        endedAt: null,
        pausedAt: null,
        accumulatedSeconds: 0,
        interruptions: 0,
        taskId,
        // Snapshots, so a deleted task does not blank the history of the work
        // done on it.
        taskTitleSnapshot:
          taskId === null ? null : (bucket(tasks, userId).get(taskId)?.title ?? null),
        goalId,
        goalTitleSnapshot:
          goalId === null ? null : (bucket(goals, userId).get(goalId)?.goal.title ?? null),
        preset: input.preset ?? null,
        reflection: null,
      };

      focus.set(userId, session);
      focusTokens.set(`${userId}::${input.clientToken}`, session.id);
      focusStarts.set(session.id, { localDate: input.localDate, clientToken: input.clientToken });
      return session;
    },

    async getRunningFocusSession(userId: string): Promise<FocusTimerSession | null> {
      const session = focus.get(userId);
      return session !== undefined && session.status === 'running' ? session : null;
    },

    async pauseFocusSession(userId: string, at: Date): Promise<FocusTimerSession> {
      const session = focus.get(userId);
      if (session === undefined || session.status !== 'running') {
        throw new RecordNotFoundError('No focus session is running.');
      }
      if (session.pausedAt !== null) return session;

      const updated = { ...session, ...pausePatch(session, at) };
      focus.set(userId, updated);
      return updated;
    },

    async resumeFocusSession(userId: string, at: Date): Promise<FocusTimerSession> {
      const session = focus.get(userId);
      if (session === undefined || session.status !== 'running') {
        throw new RecordNotFoundError('No focus session is running.');
      }
      if (session.pausedAt === null) return session;

      const updated = { ...session, ...resumePatch(at) };
      focus.set(userId, updated);
      return updated;
    },

    async finishFocusSession(
      userId: string,
      input: { at: Date; status: 'completed' | 'abandoned'; reflection?: string | null },
    ): Promise<FocusTimerSession | null> {
      const session = focus.get(userId);
      if (session === undefined || session.status !== 'running') return null;

      const updated: FocusTimerSession = {
        ...session,
        ...finishPatch(session, input.at, input.status),
        reflection: input.reflection ?? null,
      };
      focus.set(userId, updated);
      const start = focusStarts.get(session.id);
      if (start) {
        access.onFocusFinished?.(userId, {
          id: updated.id,
          localDate: start.localDate,
          plannedMinutes: updated.plannedMinutes,
          actualSeconds: updated.accumulatedSeconds,
          interruptions: updated.interruptions,
          status: input.status,
          clientToken: start.clientToken,
        });
      }
      return updated;
    },
  };
}

/** Local-date arithmetic without constructing a zoned instant. */
function addDaysIso(localDate: IsoDate, days: number): IsoDate {
  const [year, month, day] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}
