import type { Commitment, Day, DayMark, IsoDate } from '@/domain';
import {
  RecordNotFoundError,
  type AccountExport,
  type AreteRepository,
  type RecordFocusSessionInput,
  type SetCommitmentStatusInput,
  type UpsertDayInput,
} from './repository';
import type { SqlExecutor } from './sql-executor';

interface PlanRow {
  id: string;
  local_date: string;
  mark: DayMark | 'not_today';
  committed_at: string | null;
}

interface ItemRow {
  id: string;
  kind: Commitment['kind'];
  title_snapshot: string;
  is_minimum: boolean;
  status: Commitment['status'];
  skip_reason: string | null;
}

interface FocusRow {
  id: string;
  local_date: string;
  planned_minutes: number;
  actual_seconds: number;
  interruptions: number;
  status: 'running' | 'completed' | 'abandoned';
  client_token: string;
}

/** The schema stores `not_today`; the domain reads `not-today`. */
function toDomainMark(mark: PlanRow['mark']): DayMark {
  return mark === 'not_today' ? 'not-today' : mark;
}

function toStoredMark(mark: DayMark): string {
  return mark === 'not-today' ? 'not_today' : mark;
}

function toCommitment(row: ItemRow): Commitment {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title_snapshot,
    isMinimum: row.is_minimum,
    status: row.status,
    ...(row.skip_reason === null ? {} : { skipReason: row.skip_reason }),
  };
}

/**
 * The production repository: plain SQL against the schema in supabase/migrations.
 *
 * Every statement also filters on `user_id`, even though row-level security
 * already does. That is deliberate belt and braces — a query that somehow runs
 * with the wrong session identity still returns nothing rather than someone
 * else's day.
 */
export function createSqlRepository(executor: SqlExecutor): AreteRepository {
  async function loadDay(userId: string, localDate: IsoDate): Promise<Day | null> {
    const plans = await executor.query<PlanRow>(
      `select id, local_date::text, mark, committed_at
         from public.daily_plans
        where user_id = $1 and local_date = $2`,
      [userId, localDate],
    );

    const plan = plans.rows[0];
    if (!plan) return null;

    const items = await executor.query<ItemRow>(
      `select id, kind, title_snapshot, is_minimum, status, skip_reason
         from public.daily_plan_items
        where user_id = $1 and daily_plan_id = $2
        order by position, created_at`,
      [userId, plan.id],
    );

    return {
      date: plan.local_date,
      mark: toDomainMark(plan.mark),
      committedAt: plan.committed_at,
      commitments: items.rows.map(toCommitment),
    };
  }

  async function requireDay(userId: string, localDate: IsoDate): Promise<Day> {
    const day = await loadDay(userId, localDate);
    if (!day) throw new RecordNotFoundError(`No day ${localDate} for this account`);
    return day;
  }

  return {
    kind: 'sql',

    async getTimeZone(userId) {
      const rows = await executor.query<{ timezone: string }>(
        `select timezone from public.profiles where id = $1`,
        [userId],
      );
      // UTC only as a last resort: a missing profile is a bug, not a location.
      return rows.rows[0]?.timezone ?? 'UTC';
    },

    getDay: loadDay,

    async listDays(userId, range) {
      const plans = await executor.query<{ local_date: string }>(
        `select local_date::text
           from public.daily_plans
          where user_id = $1 and local_date between $2 and $3
          order by local_date desc`,
        [userId, range.from, range.to],
      );

      const days: Day[] = [];
      for (const row of plans.rows) {
        const day = await loadDay(userId, row.local_date);
        if (day) days.push(day);
      }
      return days;
    },

    async upsertDay(userId, input: UpsertDayInput) {
      const plans = await executor.query<{ id: string }>(
        `insert into public.daily_plans (user_id, local_date, timezone)
         values ($1, $2, $3)
         on conflict (user_id, local_date) do update set timezone = excluded.timezone
         returning id`,
        [userId, input.localDate, input.timeZone],
      );
      const planId = plans.rows[0]?.id;
      if (!planId) throw new Error('daily_plans upsert returned no row');

      // Items are reconciled by (kind, title) rather than replaced wholesale,
      // so editing a day keeps the status of the items that survive the edit.
      const titles = input.commitments.map((commitment) => commitment.title);
      const kinds = input.commitments.map((commitment) => commitment.kind);

      await executor.query(
        `delete from public.daily_plan_items
          where user_id = $1 and daily_plan_id = $2
            and (title_snapshot, kind) <> all (
              select unnest($3::text[]), unnest($4::text[])
            )`,
        [userId, planId, titles, kinds],
      );

      for (const [index, commitment] of input.commitments.entries()) {
        await executor.query(
          `insert into public.daily_plan_items
             (user_id, daily_plan_id, kind, ref_id, title_snapshot, is_minimum, position)
           select $1, $2, $3, $4, $5, $6, $7
            where not exists (
              select 1 from public.daily_plan_items
               where user_id = $1 and daily_plan_id = $2
                 and kind = $3 and title_snapshot = $5
            )`,
          [
            userId,
            planId,
            commitment.kind,
            commitment.refId ?? null,
            commitment.title,
            commitment.isMinimum ?? false,
            index,
          ],
        );
        await executor.query(
          `update public.daily_plan_items
              set position = $4, is_minimum = $5
            where user_id = $1 and daily_plan_id = $2 and title_snapshot = $3`,
          [userId, planId, commitment.title, index, commitment.isMinimum ?? false],
        );
      }

      return requireDay(userId, input.localDate);
    },

    async commitDay(userId, localDate, at) {
      const updated = await executor.query(
        `update public.daily_plans set committed_at = $3
          where user_id = $1 and local_date = $2 returning id`,
        [userId, localDate, at.toISOString()],
      );
      if (updated.rows.length === 0) {
        throw new RecordNotFoundError(`No day ${localDate} for this account`);
      }
      return requireDay(userId, localDate);
    },

    async markDay(userId, localDate, mark, reason) {
      const updated = await executor.query(
        `update public.daily_plans set mark = $3, mark_reason = $4
          where user_id = $1 and local_date = $2 returning id`,
        [userId, localDate, toStoredMark(mark), reason ?? null],
      );
      if (updated.rows.length === 0) {
        throw new RecordNotFoundError(`No day ${localDate} for this account`);
      }
      return requireDay(userId, localDate);
    },

    async setCommitmentStatus(userId, input: SetCommitmentStatusInput) {
      if (input.status === 'skipped' && !input.skipReason) {
        throw new Error(
          'A skipped commitment needs a reason — that is what makes it not a failure',
        );
      }

      const updated = await executor.query(
        `update public.daily_plan_items
            set status = $3,
                skip_reason = $4,
                completed_at = case when $3 = 'done' then $5::timestamptz else null end
          where user_id = $1 and id = $2
          returning id`,
        [
          userId,
          input.commitmentId,
          input.status,
          input.skipReason ?? null,
          input.at.toISOString(),
        ],
      );
      if (updated.rows.length === 0) {
        throw new RecordNotFoundError(`No commitment ${input.commitmentId}`);
      }

      return requireDay(userId, input.localDate);
    },

    async recordFocusSession(userId, input: RecordFocusSessionInput) {
      // The unique (user_id, client_token) index is what makes a retry a no-op.
      await executor.query(
        `insert into public.focus_sessions
           (user_id, task_id, local_date, timezone, planned_minutes, started_at, ended_at,
            actual_seconds, interruptions, status, client_token)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (user_id, client_token) do nothing`,
        [
          userId,
          input.taskId ?? null,
          input.localDate,
          input.timeZone,
          input.plannedMinutes,
          input.startedAt.toISOString(),
          input.endedAt.toISOString(),
          input.actualSeconds,
          input.interruptions ?? 0,
          input.status,
          input.clientToken,
        ],
      );

      const found = await executor.query<FocusRow>(
        `select id, local_date::text, planned_minutes, actual_seconds, interruptions, status, client_token
           from public.focus_sessions
          where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );

      const row = found.rows[0];
      if (!row) throw new Error('focus session insert returned nothing');

      return {
        id: row.id,
        localDate: row.local_date,
        plannedMinutes: Number(row.planned_minutes),
        actualSeconds: Number(row.actual_seconds),
        interruptions: Number(row.interruptions),
        status: row.status === 'running' ? 'abandoned' : row.status,
        clientToken: row.client_token,
      };
    },

    async listFocusSessions(userId, localDate) {
      const found = await executor.query<FocusRow>(
        `select id, local_date::text, planned_minutes, actual_seconds, interruptions, status, client_token
           from public.focus_sessions
          where user_id = $1 and local_date = $2
          order by started_at`,
        [userId, localDate],
      );

      return found.rows.map((row) => ({
        id: row.id,
        localDate: row.local_date,
        plannedMinutes: Number(row.planned_minutes),
        actualSeconds: Number(row.actual_seconds),
        interruptions: Number(row.interruptions),
        status: row.status === 'running' ? ('abandoned' as const) : row.status,
        clientToken: row.client_token,
      }));
    },

    async exportEverything(): Promise<AccountExport> {
      // The function runs as the caller, so row-level security still applies and
      // it cannot be aimed at another account.
      const result = await executor.query<{ export_my_data: Record<string, unknown> }>(
        `select public.export_my_data()`,
      );
      const document = result.rows[0]?.export_my_data ?? {};
      const { exportedAt, schemaVersion, profile, ...tables } = document as Record<string, unknown>;

      return {
        exportedAt: String(exportedAt ?? ''),
        schemaVersion: Number(schemaVersion ?? 0),
        profile: (profile as Record<string, unknown> | null) ?? null,
        tables: tables as AccountExport['tables'],
      };
    },

    async deleteEverything() {
      await executor.query(`select public.delete_my_account()`);
    },
  };
}
