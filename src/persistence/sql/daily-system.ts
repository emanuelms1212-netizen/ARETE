import {
  expand,
  finishPatch,
  goalSchema,
  pausePatch,
  resumePatch,
  type Commitment,
  type Day,
  type FocusSession as FocusTimerSession,
  type Goal,
  type Habit,
  type HabitLog,
  type IsoDate,
  type Measurement,
  type Milestone,
  type Recurrence,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type DayFraming,
  type DayReview,
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
import type { SqlExecutor } from '../sql-executor';

/**
 * The SQL half of the daily system.
 *
 * Every statement here runs through row-level security as the signed-in user,
 * which is why none of them carries a `user_id` filter *as the security
 * boundary* — the filters that are present are for selectivity, and the policy
 * is what makes them safe. The contract suite runs this adapter as the
 * `authenticated` role precisely so that a policy which is too strict fails as
 * loudly as one that is too loose.
 */
interface GoalRow {
  id: string;
  title: string;
  why: string | null;
  success_measure: string | null;
  measure_unit: string | null;
  start_value: string | number | null;
  target_value: string | number | null;
  status: Goal['status'];
  target_date: string | null;
  maintenance_date: string | null;
  review_day: number | null;
  archived_at: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: Task['status'];
  scheduled_date: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  priority: number;
  energy: Task['energy'];
  context: string | null;
  project_id: string | null;
  goal_id: string | null;
  parent_task_id: string | null;
  recurrence: Recurrence | null;
  recurrence_anchor: string | null;
  completed_at: string | null;
  archived_at: string | null;
}

interface HabitRow {
  id: string;
  title: string;
  kind: Habit['kind'];
  unit: string | null;
  target_value: string | number | null;
  minimum_target: string | number | null;
  goal_id: string | null;
  paused_at: string | null;
  archived_at: string | null;
  rule: Recurrence | null;
}

interface FocusRow {
  id: string;
  kind: FocusTimerSession['kind'];
  status: FocusTimerSession['status'];
  planned_minutes: number;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  accumulated_seconds: number;
  interruptions: number;
  task_id: string | null;
  task_title_snapshot: string | null;
  goal_id: string | null;
  goal_title_snapshot: string | null;
  preset: string | null;
  reflection: string | null;
}

/** Postgres returns `numeric` as a string, to avoid lying about precision. */
function num(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : Number(value);
}

function date(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function toGoal(row: GoalRow): Goal {
  return goalSchema.parse({
    id: row.id,
    title: row.title,
    why: row.why,
    successMeasure: row.success_measure,
    measureUnit: row.measure_unit,
    startValue: num(row.start_value),
    targetValue: num(row.target_value),
    status: row.status,
    targetDate: row.target_date,
    maintenanceDate: row.maintenance_date,
    reviewDay: row.review_day,
    archivedAt: date(row.archived_at),
  });
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    scheduledDate: row.scheduled_date,
    dueDate: row.due_date,
    estimateMinutes: row.estimate_minutes,
    priority: row.priority,
    energy: row.energy,
    context: row.context,
    projectId: row.project_id,
    goalId: row.goal_id,
    parentTaskId: row.parent_task_id,
    recurrence: row.recurrence,
    recurrenceAnchor: row.recurrence_anchor,
    completedAt: date(row.completed_at),
    archivedAt: date(row.archived_at),
    subtasks: [],
  };
}

function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    unit: row.unit,
    targetValue: num(row.target_value),
    minimumTarget: num(row.minimum_target),
    goalId: row.goal_id,
    pausedAt: date(row.paused_at),
    archivedAt: date(row.archived_at),
  };
}

function toFocus(row: FocusRow): FocusTimerSession {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    plannedMinutes: row.planned_minutes,
    startedAt: new Date(row.started_at),
    endedAt: date(row.ended_at),
    pausedAt: date(row.paused_at),
    accumulatedSeconds: row.accumulated_seconds,
    interruptions: row.interruptions,
    taskId: row.task_id,
    taskTitleSnapshot: row.task_title_snapshot,
    goalId: row.goal_id,
    goalTitleSnapshot: row.goal_title_snapshot,
    preset: row.preset,
    reflection: row.reflection,
  };
}

const GOAL_COLUMNS = `id, title, why, success_measure, measure_unit, start_value, target_value,
  status, target_date::text, maintenance_date::text, review_day, archived_at`;

const TASK_COLUMNS = `id, title, notes, status, scheduled_date::text, due_date::text,
  estimate_minutes, priority, energy, context, project_id, goal_id, parent_task_id,
  recurrence, recurrence_anchor::text, completed_at, archived_at`;

const FOCUS_COLUMNS = `id, kind, status, planned_minutes, started_at, ended_at, paused_at,
  accumulated_seconds, interruptions, task_id, task_title_snapshot, goal_id,
  goal_title_snapshot, preset, reflection`;

export interface SqlDayAccess {
  loadDay(userId: string, localDate: IsoDate): Promise<Day | null>;
  requireDay(userId: string, localDate: IsoDate): Promise<Day>;
  /** Returns the plan row's id, creating the plan if the day has none yet. */
  ensurePlan(userId: string, localDate: IsoDate, timeZone: string): Promise<string>;
}

export function createSqlDailySystem(executor: SqlExecutor, access: SqlDayAccess) {
  async function requireGoalRow(userId: string, goalId: string): Promise<GoalRow> {
    const result = await executor.query<GoalRow>(
      `select ${GOAL_COLUMNS} from public.goals where id = $1 and user_id = $2`,
      [goalId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new RecordNotFoundError(`No goal ${goalId} for this account`);
    return row;
  }

  async function loadMeasurements(goalId: string): Promise<Measurement[]> {
    const result = await executor.query<{ local_date: string; value: string | number }>(
      `select local_date::text, value from public.goal_measurements
        where goal_id = $1 order by local_date`,
      [goalId],
    );
    return result.rows.map((row) => ({ localDate: row.local_date, value: Number(row.value) }));
  }

  async function loadMilestones(goalId: string): Promise<Milestone[]> {
    const result = await executor.query<{
      id: string;
      title: string;
      due_date: string | null;
      completed_at: string | null;
    }>(
      `select id, title, due_date::text, completed_at from public.milestones
        where goal_id = $1 and archived_at is null order by position, created_at`,
      [goalId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      completedAt: date(row.completed_at),
    }));
  }

  async function loadSubtasks(userId: string, parentIds: readonly string[]) {
    if (parentIds.length === 0) return new Map<string, Task[]>();

    const result = await executor.query<TaskRow>(
      `select ${TASK_COLUMNS} from public.tasks
        where user_id = $1 and parent_task_id = any($2::uuid[]) and archived_at is null
        order by title`,
      [userId, parentIds],
    );

    const byParent = new Map<string, Task[]>();
    for (const row of result.rows) {
      const parent = row.parent_task_id;
      if (parent === null) continue;
      const list = byParent.get(parent) ?? [];
      list.push(toTask(row));
      byParent.set(parent, list);
    }
    return byParent;
  }

  async function runningSession(userId: string): Promise<FocusRow | null> {
    const result = await executor.query<FocusRow>(
      `select ${FOCUS_COLUMNS} from public.focus_sessions
        where user_id = $1 and status = 'running' limit 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  return {
    // -----------------------------------------------------------------------
    // Goals
    // -----------------------------------------------------------------------
    async listGoals(userId: string, options?: { includeArchived?: boolean }) {
      const result = await executor.query<GoalRow>(
        `select ${GOAL_COLUMNS} from public.goals
          where user_id = $1 and ($2::boolean or archived_at is null)
          order by title`,
        [userId, options?.includeArchived ?? false],
      );
      return result.rows.map(toGoal);
    },

    async getGoal(userId: string, goalId: string): Promise<GoalDetail | null> {
      const result = await executor.query<GoalRow>(
        `select ${GOAL_COLUMNS} from public.goals where id = $1 and user_id = $2`,
        [goalId, userId],
      );
      const row = result.rows[0];
      if (!row) return null;

      const reviews = await executor.query<{
        week_start: string;
        progress_note: string | null;
        friction_note: string | null;
        next_commitment: string | null;
        verdict: GoalReview['verdict'];
      }>(
        `select week_start::text, progress_note, friction_note, next_commitment, verdict
           from public.goal_reviews where goal_id = $1 order by week_start desc limit 1`,
        [goalId],
      );
      const latest = reviews.rows[0];

      return {
        goal: toGoal(row),
        measurements: await loadMeasurements(goalId),
        milestones: await loadMilestones(goalId),
        latestReview:
          latest === undefined
            ? null
            : {
                goalId,
                weekStart: latest.week_start,
                progressNote: latest.progress_note,
                frictionNote: latest.friction_note,
                nextCommitment: latest.next_commitment,
                verdict: latest.verdict,
              },
      };
    },

    async createGoal(userId: string, input: GoalInput): Promise<Goal> {
      const result = await executor.query<GoalRow>(
        `insert into public.goals
           (user_id, title, why, success_measure, measure_unit, start_value, target_value,
            target_date, maintenance_date, review_day)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning ${GOAL_COLUMNS}`,
        [
          userId,
          input.title,
          input.why ?? null,
          input.successMeasure ?? null,
          input.measureUnit ?? null,
          input.startValue ?? null,
          input.targetValue ?? null,
          input.targetDate ?? null,
          input.maintenanceDate ?? null,
          input.reviewDay ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The goal was refused by the database.');
      return toGoal(row);
    },

    async updateGoal(userId: string, goalId: string, input: Partial<GoalInput>): Promise<Goal> {
      const current = toGoal(await requireGoalRow(userId, goalId));
      const merged = { ...current, ...input };
      // Parsed before writing, so demo mode and production refuse the same
      // things for the same reasons rather than one discovering it later.
      goalSchema.parse(merged);

      const result = await executor.query<GoalRow>(
        `update public.goals set
           title = $3, why = $4, success_measure = $5, measure_unit = $6,
           start_value = $7, target_value = $8, target_date = $9,
           maintenance_date = $10, review_day = $11
         where id = $1 and user_id = $2
         returning ${GOAL_COLUMNS}`,
        [
          goalId,
          userId,
          merged.title,
          merged.why,
          merged.successMeasure,
          merged.measureUnit,
          merged.startValue,
          merged.targetValue,
          merged.targetDate,
          merged.maintenanceDate,
          merged.reviewDay,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No goal ${goalId} for this account`);
      return toGoal(row);
    },

    async setGoalStatus(userId: string, goalId: string, status: Goal['status']): Promise<Goal> {
      const result = await executor.query<GoalRow>(
        `update public.goals set status = $3 where id = $1 and user_id = $2
         returning ${GOAL_COLUMNS}`,
        [goalId, userId, status],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No goal ${goalId} for this account`);
      return toGoal(row);
    },

    async archiveGoal(userId: string, goalId: string, at: Date): Promise<void> {
      await executor.query(
        `update public.goals set archived_at = $3 where id = $1 and user_id = $2`,
        [goalId, userId, at.toISOString()],
      );
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
      await requireGoalRow(userId, input.goalId);

      // One reading per goal per local day. A retry with the same token, and a
      // correction later the same day, both land on the same row.
      await executor.query(
        `insert into public.goal_measurements
           (user_id, goal_id, local_date, timezone, value, note, client_token)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, goal_id, local_date)
         do update set value = excluded.value, note = excluded.note`,
        [
          userId,
          input.goalId,
          input.localDate,
          input.timeZone,
          input.value,
          input.note ?? null,
          input.clientToken,
        ],
      );

      return loadMeasurements(input.goalId);
    },

    async addMilestone(
      userId: string,
      input: { goalId: string; title: string; dueDate?: IsoDate | null },
    ): Promise<Milestone> {
      await requireGoalRow(userId, input.goalId);
      const result = await executor.query<{
        id: string;
        title: string;
        due_date: string | null;
        completed_at: string | null;
      }>(
        `insert into public.milestones (user_id, goal_id, title, due_date, position)
         values ($1, $2, $3, $4,
           coalesce((select max(position) + 1 from public.milestones where goal_id = $2), 0))
         returning id, title, due_date::text, completed_at`,
        [userId, input.goalId, input.title, input.dueDate ?? null],
      );
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The milestone was refused by the database.');
      return {
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
        completedAt: date(row.completed_at),
      };
    },

    async setMilestoneDone(userId: string, milestoneId: string, at: Date | null) {
      const result = await executor.query<{ goal_id: string }>(
        `update public.milestones set completed_at = $3
          where id = $1 and user_id = $2 returning goal_id`,
        [milestoneId, userId, at?.toISOString() ?? null],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No milestone ${milestoneId} for this account`);
      return loadMilestones(row.goal_id);
    },

    async saveGoalReview(userId: string, input: GoalReview & { timeZone: string }) {
      await requireGoalRow(userId, input.goalId);

      await executor.query(
        `insert into public.goal_reviews
           (user_id, goal_id, week_start, timezone, progress_note, friction_note,
            next_commitment, verdict)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, goal_id, week_start) do update set
           progress_note = excluded.progress_note,
           friction_note = excluded.friction_note,
           next_commitment = excluded.next_commitment,
           verdict = excluded.verdict`,
        [
          userId,
          input.goalId,
          input.weekStart,
          input.timeZone,
          input.progressNote,
          input.frictionNote,
          input.nextCommitment,
          input.verdict,
        ],
      );

      // The verdict moves the goal. A review that changes nothing is a form.
      const statusFor: Partial<Record<GoalReview['verdict'], Goal['status']>> = {
        pause: 'paused',
        drop: 'abandoned',
        done: 'done',
      };
      const next = statusFor[input.verdict];
      if (next !== undefined) {
        await executor.query(`update public.goals set status = $2 where id = $1`, [
          input.goalId,
          next,
        ]);
      } else if (input.verdict === 'continue') {
        await executor.query(
          `update public.goals set status = 'active' where id = $1 and status = 'paused'`,
          [input.goalId],
        );
      }

      return {
        goalId: input.goalId,
        weekStart: input.weekStart,
        progressNote: input.progressNote,
        frictionNote: input.frictionNote,
        nextCommitment: input.nextCommitment,
        verdict: input.verdict,
      };
    },

    async listGoalReviews(userId: string, goalId: string) {
      await requireGoalRow(userId, goalId);
      const result = await executor.query<{
        week_start: string;
        progress_note: string | null;
        friction_note: string | null;
        next_commitment: string | null;
        verdict: GoalReview['verdict'];
      }>(
        `select week_start::text, progress_note, friction_note, next_commitment, verdict
           from public.goal_reviews where goal_id = $1 order by week_start desc`,
        [goalId],
      );
      return result.rows.map((row) => ({
        goalId,
        weekStart: row.week_start,
        progressNote: row.progress_note,
        frictionNote: row.friction_note,
        nextCommitment: row.next_commitment,
        verdict: row.verdict,
      }));
    },

    // -----------------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------------
    async listTasks(
      userId: string,
      options: { view: TaskView; today: IsoDate; horizonDays?: number },
    ) {
      const horizon = options.horizonDays ?? 7;

      // The views are expressed in SQL rather than filtered in memory so that
      // a long task list does not become a full table read on every screen.
      //
      // Each view declares the parameters it actually uses: Postgres counts the
      // highest `$n` a statement references and rejects a bind that supplies
      // more, so `inbox` cannot be handed the date and horizon it never reads.
      const views: Record<TaskView, { where: string; params: readonly unknown[] }> = {
        all: { where: 'true', params: [] },
        inbox: {
          where: `status = 'open' and scheduled_date is null and due_date is null`,
          params: [],
        },
        today: {
          where: `status = 'open' and (scheduled_date <= $2::date or due_date <= $2::date)`,
          params: [options.today],
        },
        upcoming: {
          where: `status = 'open'
            and coalesce(scheduled_date, due_date) > $2::date
            and coalesce(scheduled_date, due_date) <= $2::date + $3::int`,
          params: [options.today, horizon],
        },
        someday: {
          where: `status = 'open'
            and coalesce(scheduled_date, due_date) > $2::date + $3::int`,
          params: [options.today, horizon],
        },
      };

      const view = views[options.view];
      const result = await executor.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks
          where user_id = $1 and archived_at is null and parent_task_id is null
            and (${view.where})
          order by priority desc, coalesce(scheduled_date, due_date, '9999-12-31'::date), title`,
        [userId, ...view.params],
      );

      const roots = result.rows.map(toTask);
      const subtasks = await loadSubtasks(
        userId,
        roots.map((task) => task.id),
      );
      return roots.map((task) => ({ ...task, subtasks: subtasks.get(task.id) ?? [] }));
    },

    async getTask(userId: string, taskId: string): Promise<Task | null> {
      const result = await executor.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks where id = $1 and user_id = $2`,
        [taskId, userId],
      );
      const row = result.rows[0];
      if (!row) return null;

      const subtasks = await loadSubtasks(userId, [taskId]);
      return { ...toTask(row), subtasks: subtasks.get(taskId) ?? [] };
    },

    async createTask(userId: string, input: TaskInput): Promise<Task> {
      const result = await executor.query<TaskRow>(
        `insert into public.tasks
           (user_id, title, notes, scheduled_date, due_date, estimate_minutes, priority,
            energy, context, project_id, goal_id, parent_task_id, recurrence, recurrence_anchor)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         returning ${TASK_COLUMNS}`,
        [
          userId,
          input.title,
          input.notes ?? null,
          input.scheduledDate ?? null,
          input.dueDate ?? null,
          input.estimateMinutes ?? null,
          input.priority ?? 0,
          input.energy ?? null,
          input.context ?? null,
          input.projectId ?? null,
          input.goalId ?? null,
          input.parentTaskId ?? null,
          input.recurrence ?? null,
          (input.recurrence ?? null) !== null ? (input.scheduledDate ?? null) : null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The task was refused by the database.');
      return toTask(row);
    },

    async updateTask(userId: string, taskId: string, input: Partial<TaskInput>): Promise<Task> {
      const existing = await executor.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks where id = $1 and user_id = $2`,
        [taskId, userId],
      );
      const current = existing.rows[0];
      if (!current) throw new RecordNotFoundError(`No task ${taskId} for this account`);

      const merged = { ...toTask(current), ...input };
      const result = await executor.query<TaskRow>(
        `update public.tasks set
           title = $3, notes = $4, scheduled_date = $5, due_date = $6, estimate_minutes = $7,
           priority = $8, energy = $9, context = $10, project_id = $11, goal_id = $12,
           recurrence = $13
         where id = $1 and user_id = $2
         returning ${TASK_COLUMNS}`,
        [
          taskId,
          userId,
          merged.title,
          merged.notes,
          merged.scheduledDate,
          merged.dueDate,
          merged.estimateMinutes,
          merged.priority,
          merged.energy,
          merged.context,
          merged.projectId,
          merged.goalId,
          merged.recurrence,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No task ${taskId} for this account`);

      const subtasks = await loadSubtasks(userId, [taskId]);
      return { ...toTask(row), subtasks: subtasks.get(taskId) ?? [] };
    },

    async setTaskStatus(
      userId: string,
      input: { taskId: string; status: Task['status']; at: Date; today: IsoDate },
    ): Promise<Task> {
      const existing = await executor.query<TaskRow>(
        `select ${TASK_COLUMNS} from public.tasks where id = $1 and user_id = $2`,
        [input.taskId, userId],
      );
      const current = existing.rows[0];
      if (!current) throw new RecordNotFoundError(`No task ${input.taskId} for this account`);

      const task = toTask(current);

      if (input.status === 'done' && task.recurrence !== null) {
        // Advance the series rather than ending it, counted from the anchor so
        // finishing late does not shift every future occurrence.
        const anchor = task.recurrenceAnchor ?? task.scheduledDate ?? input.today;
        const after = task.scheduledDate ?? input.today;
        const upcoming = expand(
          task.recurrence,
          anchor,
          addDaysIso(after, 1),
          addDaysIso(after, 400),
        );
        const next = upcoming[0] ?? null;

        const advanced = await executor.query<TaskRow>(
          `update public.tasks
              set scheduled_date = $3,
                  status = case when $3::date is null then 'done' else 'open' end,
                  completed_at = case when $3::date is null then $4::timestamptz else null end
            where id = $1 and user_id = $2
            returning ${TASK_COLUMNS}`,
          [input.taskId, userId, next, input.at.toISOString()],
        );
        const row = advanced.rows[0];
        if (!row) throw new RecordNotFoundError(`No task ${input.taskId} for this account`);
        return toTask(row);
      }

      const result = await executor.query<TaskRow>(
        `update public.tasks set status = $3, completed_at = $4
          where id = $1 and user_id = $2 returning ${TASK_COLUMNS}`,
        [
          input.taskId,
          userId,
          input.status,
          input.status === 'done' ? input.at.toISOString() : null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No task ${input.taskId} for this account`);

      const subtasks = await loadSubtasks(userId, [input.taskId]);
      return { ...toTask(row), subtasks: subtasks.get(input.taskId) ?? [] };
    },

    async archiveTask(userId: string, taskId: string, at: Date): Promise<void> {
      // Children go with the parent: an orphaned subtask is a task nobody will
      // ever see again that still counts in every total.
      await executor.query(
        `update public.tasks set archived_at = $3
          where user_id = $2 and (id = $1 or parent_task_id = $1)`,
        [taskId, userId, at.toISOString()],
      );
    },

    // -----------------------------------------------------------------------
    // Habits
    // -----------------------------------------------------------------------
    async listHabits(userId: string, options?: { includeArchived?: boolean }) {
      const result = await executor.query<HabitRow>(
        `select h.id, h.title, h.kind, h.unit, h.target_value, h.minimum_target,
                h.goal_id, h.paused_at, h.archived_at,
                (select s.rule from public.habit_schedules s
                  where s.habit_id = h.id and s.effective_to is null
                  order by s.effective_from desc limit 1) as rule
           from public.habits h
          where h.user_id = $1 and ($2::boolean or h.archived_at is null)
          order by h.title`,
        [userId, options?.includeArchived ?? false],
      );
      return result.rows.map((row): HabitWithSchedule => ({
        habit: toHabit(row),
        schedule: row.rule,
      }));
    },

    async createHabit(userId: string, input: HabitInput): Promise<Habit> {
      const result = await executor.query<HabitRow>(
        `insert into public.habits
           (user_id, title, kind, unit, target_value, minimum_target, goal_id)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, title, kind, unit, target_value, minimum_target, goal_id,
                   paused_at, archived_at, null::jsonb as rule`,
        [
          userId,
          input.title,
          input.kind,
          input.unit ?? null,
          input.targetValue ?? null,
          input.minimumTarget ?? null,
          input.goalId ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The habit was refused by the database.');

      if ((input.schedule ?? null) !== null) {
        await executor.query(
          `insert into public.habit_schedules (user_id, habit_id, rule, effective_from)
           values ($1, $2, $3, current_date)`,
          [userId, row.id, input.schedule],
        );
      }

      return toHabit(row);
    },

    async updateHabit(userId: string, habitId: string, input: Partial<HabitInput>): Promise<Habit> {
      const existing = await executor.query<HabitRow>(
        `select id, title, kind, unit, target_value, minimum_target, goal_id,
                paused_at, archived_at, null::jsonb as rule
           from public.habits where id = $1 and user_id = $2`,
        [habitId, userId],
      );
      const current = existing.rows[0];
      if (!current) throw new RecordNotFoundError(`No habit ${habitId} for this account`);

      const merged = { ...toHabit(current), ...input };
      const result = await executor.query<HabitRow>(
        `update public.habits set
           title = $3, kind = $4, unit = $5, target_value = $6, minimum_target = $7, goal_id = $8
         where id = $1 and user_id = $2
         returning id, title, kind, unit, target_value, minimum_target, goal_id,
                   paused_at, archived_at, null::jsonb as rule`,
        [
          habitId,
          userId,
          merged.title,
          merged.kind,
          merged.unit,
          merged.targetValue,
          merged.minimumTarget,
          merged.goalId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No habit ${habitId} for this account`);

      if ('schedule' in input) {
        // Changing a schedule closes the old row and opens a new one, so past
        // days still expand with the rule that applied then.
        await executor.query(
          `update public.habit_schedules set effective_to = current_date
            where habit_id = $1 and effective_to is null`,
          [habitId],
        );
        if ((input.schedule ?? null) !== null) {
          await executor.query(
            `insert into public.habit_schedules (user_id, habit_id, rule, effective_from)
             values ($1, $2, $3, current_date)`,
            [userId, habitId, input.schedule],
          );
        }
      }

      return toHabit(row);
    },

    async setHabitPaused(userId: string, habitId: string, at: Date | null): Promise<Habit> {
      const result = await executor.query<HabitRow>(
        `update public.habits set paused_at = $3 where id = $1 and user_id = $2
         returning id, title, kind, unit, target_value, minimum_target, goal_id,
                   paused_at, archived_at, null::jsonb as rule`,
        [habitId, userId, at?.toISOString() ?? null],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No habit ${habitId} for this account`);
      return toHabit(row);
    },

    async archiveHabit(userId: string, habitId: string, at: Date): Promise<void> {
      await executor.query(
        `update public.habits set archived_at = $3 where id = $1 and user_id = $2`,
        [habitId, userId, at.toISOString()],
      );
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
      const owned = await executor.query<{ id: string }>(
        `select id from public.habits where id = $1 and user_id = $2`,
        [input.habitId, userId],
      );
      if (!owned.rows[0]) {
        throw new RecordNotFoundError(`No habit ${input.habitId} for this account`);
      }

      const result = await executor.query<{
        habit_id: string;
        local_date: string;
        status: HabitLog['status'];
        value: string | number | null;
        skip_reason: string | null;
      }>(
        `insert into public.habit_logs
           (user_id, habit_id, local_date, timezone, status, value, skip_reason, client_token)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, habit_id, local_date) do update set
           status = excluded.status, value = excluded.value, skip_reason = excluded.skip_reason
         returning habit_id, local_date::text, status, value, skip_reason`,
        [
          userId,
          input.habitId,
          input.localDate,
          input.timeZone,
          input.status,
          input.value ?? null,
          input.skipReason ?? null,
          input.clientToken,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The habit log was refused by the database.');

      return {
        habitId: row.habit_id,
        localDate: row.local_date,
        status: row.status,
        value: num(row.value),
        skipReason: row.skip_reason,
      };
    },

    async listHabitLogs(userId: string, range: { from: IsoDate; to: IsoDate }) {
      const result = await executor.query<{
        habit_id: string;
        local_date: string;
        status: HabitLog['status'];
        value: string | number | null;
        skip_reason: string | null;
      }>(
        `select habit_id, local_date::text, status, value, skip_reason
           from public.habit_logs
          where user_id = $1 and local_date between $2 and $3
          order by local_date`,
        [userId, range.from, range.to],
      );
      return result.rows.map((row) => ({
        habitId: row.habit_id,
        localDate: row.local_date,
        status: row.status,
        value: num(row.value),
        skipReason: row.skip_reason,
      }));
    },

    // -----------------------------------------------------------------------
    // The day's framing, edits and review
    // -----------------------------------------------------------------------
    async getFraming(userId: string, localDate: IsoDate): Promise<DayFraming> {
      const result = await executor.query<{
        intention: string | null;
        in_my_control: string | null;
        not_my_control: string | null;
        minimum_mode: boolean;
      }>(
        `select intention, in_my_control, not_my_control, minimum_mode
           from public.daily_plans where user_id = $1 and local_date = $2`,
        [userId, localDate],
      );
      const row = result.rows[0];
      return {
        intention: row?.intention ?? null,
        inMyControl: row?.in_my_control ?? null,
        notMyControl: row?.not_my_control ?? null,
        minimumMode: row?.minimum_mode ?? false,
      };
    },

    async setFraming(
      userId: string,
      input: {
        localDate: IsoDate;
        timeZone: string;
        intention?: string | null;
        inMyControl?: string | null;
        notMyControl?: string | null;
      },
    ): Promise<DayFraming> {
      await access.ensurePlan(userId, input.localDate, input.timeZone);

      const result = await executor.query<{
        intention: string | null;
        in_my_control: string | null;
        not_my_control: string | null;
        minimum_mode: boolean;
      }>(
        `update public.daily_plans set
           intention = case when $3 then $4 else intention end,
           in_my_control = case when $5 then $6 else in_my_control end,
           not_my_control = case when $7 then $8 else not_my_control end
         where user_id = $1 and local_date = $2
         returning intention, in_my_control, not_my_control, minimum_mode`,
        [
          userId,
          input.localDate,
          'intention' in input,
          input.intention ?? null,
          'inMyControl' in input,
          input.inMyControl ?? null,
          'notMyControl' in input,
          input.notMyControl ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new RecordNotFoundError(`No day ${input.localDate} for this account`);

      return {
        intention: row.intention,
        inMyControl: row.in_my_control,
        notMyControl: row.not_my_control,
        minimumMode: row.minimum_mode,
      };
    },

    async setMinimumMode(
      userId: string,
      input: { localDate: IsoDate; timeZone: string; on: boolean; at: Date },
    ): Promise<Day> {
      await access.ensurePlan(userId, input.localDate, input.timeZone);

      // Nothing here touches an item's status. Minimum mode changes what the
      // day asks for, never the verdict on what was done.
      await executor.query(
        `update public.daily_plans set minimum_mode = $3, minimum_mode_at = $4
          where user_id = $1 and local_date = $2`,
        [userId, input.localDate, input.on, input.on ? input.at.toISOString() : null],
      );

      return access.requireDay(userId, input.localDate);
    },

    async addCommitment(
      userId: string,
      input: {
        localDate: IsoDate;
        timeZone: string;
        commitment: {
          kind: Commitment['kind'];
          title: string;
          isMinimum?: boolean;
          refId?: string;
        };
      },
    ): Promise<Day> {
      const planId = await access.ensurePlan(userId, input.localDate, input.timeZone);

      await executor.query(
        `insert into public.daily_plan_items
           (user_id, daily_plan_id, kind, ref_id, title_snapshot, is_minimum, position)
         values ($1, $2, $3, $4, $5, $6,
           coalesce((select max(position) + 1 from public.daily_plan_items
                      where daily_plan_id = $2), 0))`,
        [
          userId,
          planId,
          input.commitment.kind,
          input.commitment.refId ?? null,
          input.commitment.title,
          input.commitment.isMinimum ?? false,
        ],
      );

      return access.requireDay(userId, input.localDate);
    },

    async reorderCommitments(
      userId: string,
      input: { localDate: IsoDate; orderedIds: readonly string[] },
    ): Promise<Day> {
      const day = await access.requireDay(userId, input.localDate);

      // Anything the caller did not mention keeps its relative place after the
      // ones that were, so a stale list from a slow client cannot drop an item.
      const mentioned = new Set(input.orderedIds);
      const order = [
        ...input.orderedIds.filter((id) => day.commitments.some((item) => item.id === id)),
        ...day.commitments.filter((item) => !mentioned.has(item.id)).map((item) => item.id),
      ];

      await executor.query(
        `update public.daily_plan_items as item
            set position = ordering.index
           from unnest($2::uuid[]) with ordinality as ordering(id, index)
          where item.id = ordering.id and item.user_id = $1`,
        [userId, order],
      );

      return access.requireDay(userId, input.localDate);
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

      const source = await executor.query<{
        kind: Commitment['kind'];
        ref_id: string | null;
        title_snapshot: string;
        is_minimum: boolean;
      }>(
        `select kind, ref_id, title_snapshot, is_minimum
           from public.daily_plan_items where id = $1 and user_id = $2`,
        [input.commitmentId, userId],
      );
      const moving = source.rows[0];
      if (!moving) {
        throw new RecordNotFoundError(`No commitment ${input.commitmentId} on ${input.localDate}`);
      }

      const targetPlan = await access.ensurePlan(userId, input.to, input.timeZone);
      await executor.query(
        `insert into public.daily_plan_items
           (user_id, daily_plan_id, kind, ref_id, title_snapshot, is_minimum, position)
         values ($1, $2, $3, $4, $5, $6,
           coalesce((select max(position) + 1 from public.daily_plan_items
                      where daily_plan_id = $2), 0))`,
        [userId, targetPlan, moving.kind, moving.ref_id, moving.title_snapshot, moving.is_minimum],
      );

      // The original stays where it was, marked with where it went: "I moved
      // this" must stay distinguishable from "I ignored this".
      await executor.query(
        `update public.daily_plan_items set snoozed_to = $3, snoozed_at = $4
          where id = $1 and user_id = $2`,
        [input.commitmentId, userId, input.to, input.at.toISOString()],
      );

      return access.requireDay(userId, input.localDate);
    },

    async getDayReview(userId: string, localDate: IsoDate): Promise<DayReview | null> {
      const result = await executor.query<{
        local_date: string;
        went_well: string | null;
        friction: string | null;
        tomorrow_one_thing: string | null;
        energy: DayReview['energy'];
        met_minimum: boolean | null;
      }>(
        `select local_date::text, went_well, friction, tomorrow_one_thing, energy, met_minimum
           from public.day_reviews where user_id = $1 and local_date = $2`,
        [userId, localDate],
      );
      const row = result.rows[0];
      if (!row) return null;

      return {
        localDate: row.local_date,
        wentWell: row.went_well,
        friction: row.friction,
        tomorrowOneThing: row.tomorrow_one_thing,
        energy: row.energy,
        metMinimum: row.met_minimum,
      };
    },

    async saveDayReview(
      userId: string,
      input: DayReview & { timeZone: string },
    ): Promise<DayReview> {
      await executor.query(
        `insert into public.day_reviews
           (user_id, local_date, timezone, went_well, friction, tomorrow_one_thing,
            energy, met_minimum)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, local_date) do update set
           went_well = excluded.went_well,
           friction = excluded.friction,
           tomorrow_one_thing = excluded.tomorrow_one_thing,
           energy = excluded.energy,
           met_minimum = excluded.met_minimum`,
        [
          userId,
          input.localDate,
          input.timeZone,
          input.wentWell,
          input.friction,
          input.tomorrowOneThing,
          input.energy,
          input.metMinimum,
        ],
      );

      return {
        localDate: input.localDate,
        wentWell: input.wentWell,
        friction: input.friction,
        tomorrowOneThing: input.tomorrowOneThing,
        energy: input.energy,
        metMinimum: input.metMinimum,
      };
    },

    // -----------------------------------------------------------------------
    // The live focus timer
    // -----------------------------------------------------------------------
    async startFocusSession(userId: string, input: StartFocusInput): Promise<FocusTimerSession> {
      // Idempotent: a retried start returns the session it already made. The
      // unique index on `client_token` is what makes this safe under a retry
      // storm rather than merely usually correct.
      const seen = await executor.query<FocusRow>(
        `select ${FOCUS_COLUMNS} from public.focus_sessions
          where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );
      const already = seen.rows[0];
      if (already) return toFocus(already);

      const running = await runningSession(userId);
      if (running !== null) throw new InvalidWriteError('A focus session is already running.');

      const result = await executor.query<FocusRow>(
        `insert into public.focus_sessions
           (user_id, kind, local_date, timezone, planned_minutes, started_at, status,
            task_id, goal_id, preset, client_token,
            task_title_snapshot, goal_title_snapshot)
         values ($1, $2, $3, $4, $5, $6, 'running', $7, $8, $9, $10,
           (select title from public.tasks where id = $7),
           (select title from public.goals where id = $8))
         returning ${FOCUS_COLUMNS}`,
        [
          userId,
          input.kind,
          input.localDate,
          input.timeZone,
          input.plannedMinutes,
          input.startedAt.toISOString(),
          input.taskId ?? null,
          input.goalId ?? null,
          input.preset ?? null,
          input.clientToken,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The focus session was refused by the database.');
      return toFocus(row);
    },

    async getRunningFocusSession(userId: string): Promise<FocusTimerSession | null> {
      const row = await runningSession(userId);
      return row === null ? null : toFocus(row);
    },

    async pauseFocusSession(userId: string, at: Date): Promise<FocusTimerSession> {
      const row = await runningSession(userId);
      if (row === null) throw new RecordNotFoundError('No focus session is running.');

      const session = toFocus(row);
      if (session.pausedAt !== null) return session;

      // The arithmetic lives in the domain, so the number written here and the
      // number the UI shows cannot disagree.
      const patch = pausePatch(session, at);
      const result = await executor.query<FocusRow>(
        `update public.focus_sessions
            set accumulated_seconds = $2, paused_at = $3, interruptions = $4
          where id = $1 returning ${FOCUS_COLUMNS}`,
        [session.id, patch.accumulatedSeconds, patch.pausedAt.toISOString(), patch.interruptions],
      );
      const updated = result.rows[0];
      if (!updated) throw new RecordNotFoundError('No focus session is running.');
      return toFocus(updated);
    },

    async resumeFocusSession(userId: string, at: Date): Promise<FocusTimerSession> {
      const row = await runningSession(userId);
      if (row === null) throw new RecordNotFoundError('No focus session is running.');

      const session = toFocus(row);
      if (session.pausedAt === null) return session;

      const patch = resumePatch(at);
      const result = await executor.query<FocusRow>(
        `update public.focus_sessions set started_at = $2, paused_at = null
          where id = $1 returning ${FOCUS_COLUMNS}`,
        [session.id, patch.startedAt.toISOString()],
      );
      const updated = result.rows[0];
      if (!updated) throw new RecordNotFoundError('No focus session is running.');
      return toFocus(updated);
    },

    async finishFocusSession(
      userId: string,
      input: { at: Date; status: 'completed' | 'abandoned'; reflection?: string | null },
    ): Promise<FocusTimerSession | null> {
      const row = await runningSession(userId);
      if (row === null) return null;

      const session = toFocus(row);
      const patch = finishPatch(session, input.at, input.status);

      const result = await executor.query<FocusRow>(
        `update public.focus_sessions
            set accumulated_seconds = $2, actual_seconds = $2, ended_at = $3,
                paused_at = null, status = $4, reflection = $5
          where id = $1 returning ${FOCUS_COLUMNS}`,
        [
          session.id,
          patch.accumulatedSeconds,
          patch.endedAt.toISOString(),
          patch.status,
          input.reflection ?? null,
        ],
      );
      const updated = result.rows[0];
      return updated ? toFocus(updated) : null;
    },
  };
}

/** Local-date arithmetic without constructing a zoned instant. */
function addDaysIso(localDate: IsoDate, days: number): IsoDate {
  const [year, month, day] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}
