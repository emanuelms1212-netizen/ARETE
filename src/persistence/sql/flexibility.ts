import { flexProgram } from '@/content/flexibility/hamstring';
import {
  checkinSchema,
  flexItemSchema,
  flexWeekdaysSchema,
  isProgramOffered,
  sessionKey,
  templateFor,
  type Checkin,
  type FlexEnrolment,
  type FlexItemRecord,
  type FlexSessionRecord,
  type RightsStatus,
  type StoredCheckin,
  type WarmupChoice,
} from '@/domain';
import { InvalidWriteError, RecordNotFoundError, type FlexProgramListing } from '../repository';
import type { SqlExecutor } from '../sql-executor';

/**
 * Flexibility, in SQL.
 *
 * The programme's content lives in code (`content/flexibility`); the database
 * row carries what the product owner controls — above all `rights_status`,
 * which is read from here and never from the code, so clearing a programme
 * is one update and no deploy.
 */
interface EnrolmentRow {
  id: string;
  program_slug: string;
  started_on: string;
  schedule_weekdays: number[];
  status: FlexEnrolment['status'];
  ended_at: string | Date | null;
}

interface SessionRow {
  id: string;
  enrolment_id: string;
  week: number;
  day: number;
  local_date: string;
  status: FlexSessionRecord['status'];
  started_at: string | Date;
  ended_at: string | Date | null;
  warmup: WarmupChoice | null;
  items: FlexItemRecord[];
  notes: string | null;
  pain_reported: boolean;
  pain_note: string | null;
  skip_reason: string | null;
}

interface CheckinRow {
  week: number;
  local_date: string;
  toe_touch: Checkin['toeTouch'];
  leg_raise_left: Checkin['legRaiseLeft'];
  leg_raise_right: Checkin['legRaiseRight'];
  tightness: number;
  socks: Checkin['socks'];
  pick_up: Checkin['pickUp'];
  pain: Checkin['pain'];
  notes: string | null;
}

const ENROLMENT_COLUMNS = `id, program_slug, started_on::text, schedule_weekdays, status, ended_at`;
const SESSION_COLUMNS = `id, enrolment_id, week, day, local_date::text, status, started_at, ended_at,
  warmup, items, notes, pain_reported, pain_note, skip_reason`;
const CHECKIN_COLUMNS = `week, local_date::text, toe_touch, leg_raise_left, leg_raise_right,
  tightness, socks, pick_up, pain, notes`;

const iso = (value: string | Date) => new Date(value).toISOString();

function toEnrolment(row: EnrolmentRow): FlexEnrolment {
  return {
    id: row.id,
    programSlug: row.program_slug,
    startedOn: row.started_on,
    weekdays: row.schedule_weekdays.map(Number),
    status: row.status,
    endedAt: row.ended_at === null ? null : iso(row.ended_at),
  };
}

function toSession(row: SessionRow): FlexSessionRecord {
  return {
    id: row.id,
    enrolmentId: row.enrolment_id,
    week: Number(row.week),
    day: Number(row.day),
    localDate: row.local_date,
    status: row.status,
    startedAt: iso(row.started_at),
    endedAt: row.ended_at === null ? null : iso(row.ended_at),
    warmup: row.warmup,
    items: row.items,
    notes: row.notes,
    painReported: row.pain_reported,
    painNote: row.pain_note,
    skipReason: row.skip_reason,
  };
}

function toCheckin(row: CheckinRow): StoredCheckin {
  return {
    week: Number(row.week),
    localDate: row.local_date,
    toeTouch: row.toe_touch,
    legRaiseLeft: row.leg_raise_left,
    legRaiseRight: row.leg_raise_right,
    tightness: Number(row.tightness),
    socks: row.socks,
    pickUp: row.pick_up,
    pain: row.pain,
    notes: row.notes,
  };
}

export function createSqlFlexibility(executor: SqlExecutor) {
  async function enrolment(userId: string, enrolmentId: string): Promise<FlexEnrolment> {
    const result = await executor.query<EnrolmentRow>(
      `select ${ENROLMENT_COLUMNS} from public.flexibility_enrolments where user_id = $1 and id = $2`,
      [userId, enrolmentId],
    );
    const row = result.rows[0];
    if (!row) throw new RecordNotFoundError('No such enrolment for this account.');
    return toEnrolment(row);
  }

  async function session(userId: string, sessionId: string): Promise<FlexSessionRecord> {
    const result = await executor.query<SessionRow>(
      `select ${SESSION_COLUMNS} from public.flexibility_sessions where user_id = $1 and id = $2`,
      [userId, sessionId],
    );
    const row = result.rows[0];
    if (!row) throw new RecordNotFoundError('No such session for this account.');
    return toSession(row);
  }

  async function requireOpenSlot(
    userId: string,
    current: FlexEnrolment,
    week: number,
    day: number,
  ) {
    if (current.status !== 'active')
      throw new InvalidWriteError('That programme is no longer active.');
    const program = flexProgram(current.programSlug);
    if (!program || !templateFor(program, week, day)) {
      throw new InvalidWriteError(
        `There is no session ${sessionKey(week, day)} in this programme.`,
      );
    }
    const closed = await executor.query<{ id: string }>(
      `select id from public.flexibility_sessions
        where user_id = $1 and enrolment_id = $2 and week = $3 and day = $4
          and status in ('completed', 'skipped') limit 1`,
      [userId, current.id, week, day],
    );
    if (closed.rows[0]) throw new InvalidWriteError('That session is already done.');
  }

  async function programRow(slug: string) {
    const result = await executor.query<{ id: string; rights_status: RightsStatus }>(
      `select id, rights_status from public.flexibility_programs where slug = $1 and user_id is null`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  return {
    async listFlexPrograms(
      _userId: string,
      options: { readonly includeRightsPending: boolean },
    ): Promise<readonly FlexProgramListing[]> {
      const result = await executor.query<{ slug: string; rights_status: RightsStatus }>(
        `select slug, rights_status from public.flexibility_programs
          where user_id is null and archived_at is null
            and (rights_status = 'cleared' or ($1 and rights_status = 'pending'))
          order by slug`,
        [options.includeRightsPending],
      );
      return result.rows.flatMap((row) => {
        const program = flexProgram(row.slug);
        return program ? [{ program, rightsStatus: row.rights_status }] : [];
      });
    },

    async getActiveEnrolment(userId: string, programSlug: string) {
      const result = await executor.query<EnrolmentRow>(
        `select ${ENROLMENT_COLUMNS} from public.flexibility_enrolments
          where user_id = $1 and program_slug = $2 and status = 'active'`,
        [userId, programSlug],
      );
      return result.rows[0] ? toEnrolment(result.rows[0]) : null;
    },

    async enrolFlex(
      userId: string,
      input: {
        programSlug: string;
        startedOn: string;
        weekdays: readonly number[];
        at: Date;
        includeRightsPending: boolean;
      },
    ) {
      const program = flexProgram(input.programSlug);
      const row = await programRow(input.programSlug);
      if (!program || !row) throw new InvalidWriteError('Unknown programme.');
      const allowed = isProgramOffered(row.rights_status, input.includeRightsPending);
      if (!allowed) throw new InvalidWriteError('That programme is not available yet.');
      const weekdays = flexWeekdaysSchema.parse([...input.weekdays]);

      await executor.query(
        `update public.flexibility_enrolments set status = 'ended', ended_at = $3
          where user_id = $1 and program_slug = $2 and status = 'active'`,
        [userId, program.slug, input.at.toISOString()],
      );
      const inserted = await executor.query<EnrolmentRow>(
        `insert into public.flexibility_enrolments
           (user_id, flexibility_program_id, program_slug, started_on, schedule_weekdays)
         values ($1, $2, $3, $4, $5)
         returning ${ENROLMENT_COLUMNS}`,
        [userId, row.id, program.slug, input.startedOn, weekdays],
      );
      return toEnrolment(inserted.rows[0]!);
    },

    async setFlexSchedule(userId: string, enrolmentId: string, weekdays: readonly number[]) {
      await enrolment(userId, enrolmentId);
      const parsed = flexWeekdaysSchema.parse([...weekdays]);
      const result = await executor.query<EnrolmentRow>(
        `update public.flexibility_enrolments set schedule_weekdays = $3
          where user_id = $1 and id = $2 returning ${ENROLMENT_COLUMNS}`,
        [userId, enrolmentId, parsed],
      );
      return toEnrolment(result.rows[0]!);
    },

    async endFlexEnrolment(
      userId: string,
      enrolmentId: string,
      status: 'completed' | 'ended',
      at: Date,
    ) {
      const current = await enrolment(userId, enrolmentId);
      if (current.status !== 'active') return current;
      const result = await executor.query<EnrolmentRow>(
        `update public.flexibility_enrolments set status = $3, ended_at = $4
          where user_id = $1 and id = $2 returning ${ENROLMENT_COLUMNS}`,
        [userId, enrolmentId, status, at.toISOString()],
      );
      return toEnrolment(result.rows[0]!);
    },

    async listFlexSessionsBetween(userId: string, range: { from: string; to: string }) {
      const result = await executor.query<SessionRow>(
        `select ${SESSION_COLUMNS} from public.flexibility_sessions
          where user_id = $1 and local_date between $2 and $3 order by started_at`,
        [userId, range.from, range.to],
      );
      return result.rows.map(toSession);
    },

    async listFlexSessions(userId: string, enrolmentId: string) {
      const result = await executor.query<SessionRow>(
        `select ${SESSION_COLUMNS} from public.flexibility_sessions
          where user_id = $1 and enrolment_id = $2 order by started_at`,
        [userId, enrolmentId],
      );
      return result.rows.map(toSession);
    },

    async getRunningFlexSession(userId: string) {
      const result = await executor.query<SessionRow>(
        `select ${SESSION_COLUMNS} from public.flexibility_sessions
          where user_id = $1 and status = 'running' limit 1`,
        [userId],
      );
      return result.rows[0] ? toSession(result.rows[0]) : null;
    },

    async startFlexSession(
      userId: string,
      input: {
        enrolmentId: string;
        week: number;
        day: number;
        localDate: string;
        timeZone: string;
        startedAt: Date;
        clientToken: string;
      },
    ) {
      const seen = await executor.query<SessionRow>(
        `select ${SESSION_COLUMNS} from public.flexibility_sessions
          where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );
      if (seen.rows[0]) return toSession(seen.rows[0]);

      const current = await enrolment(userId, input.enrolmentId);
      await requireOpenSlot(userId, current, input.week, input.day);
      const running = await executor.query<{ id: string }>(
        `select id from public.flexibility_sessions where user_id = $1 and status = 'running' limit 1`,
        [userId],
      );
      if (running.rows[0]) throw new InvalidWriteError('A flexibility session is already running.');

      const programId = await programRow(current.programSlug);
      const inserted = await executor.query<SessionRow>(
        `insert into public.flexibility_sessions
           (user_id, flexibility_program_id, enrolment_id, week, day, local_date, timezone,
            status, started_at, client_token)
         values ($1, $2, $3, $4, $5, $6, $7, 'running', $8, $9)
         returning ${SESSION_COLUMNS}`,
        [
          userId,
          programId?.id ?? null,
          current.id,
          input.week,
          input.day,
          input.localDate,
          input.timeZone,
          input.startedAt.toISOString(),
          input.clientToken,
        ],
      );
      return toSession(inserted.rows[0]!);
    },

    async updateFlexSession(
      userId: string,
      sessionId: string,
      patch: { warmup?: WarmupChoice; items?: readonly FlexItemRecord[]; notes?: string | null },
    ) {
      const current = await session(userId, sessionId);
      if (current.status !== 'running')
        throw new InvalidWriteError('That session has already finished.');
      const items =
        patch.items === undefined
          ? current.items
          : patch.items.map((item) => flexItemSchema.parse(item));
      const notes = patch.notes === undefined ? current.notes : patch.notes?.trim() || null;
      if (notes !== null && notes.length > 1000) {
        throw new InvalidWriteError('Notes are limited to 1000 characters.');
      }
      const result = await executor.query<SessionRow>(
        `update public.flexibility_sessions set warmup = $3, items = $4::jsonb, notes = $5
          where user_id = $1 and id = $2 returning ${SESSION_COLUMNS}`,
        [userId, sessionId, patch.warmup ?? current.warmup, JSON.stringify(items), notes],
      );
      return toSession(result.rows[0]!);
    },

    async finishFlexSession(
      userId: string,
      input: {
        sessionId: string;
        status: 'completed' | 'stopped';
        at: Date;
        painNote?: string | null;
        notes?: string | null;
      },
    ) {
      const current = await session(userId, input.sessionId);
      if (current.status !== 'running') return current;
      const notes = input.notes === undefined ? current.notes : input.notes?.trim() || null;
      const result = await executor.query<SessionRow>(
        `update public.flexibility_sessions
            set status = $3, ended_at = $4, completed_at = case when $3 = 'completed' then $4::timestamptz end,
                pain_reported = $5, pain_note = $6, notes = $7
          where user_id = $1 and id = $2 returning ${SESSION_COLUMNS}`,
        [
          userId,
          input.sessionId,
          input.status,
          input.at.toISOString(),
          input.status === 'stopped',
          input.painNote?.trim() || null,
          notes,
        ],
      );
      return toSession(result.rows[0]!);
    },

    async skipFlexSession(
      userId: string,
      input: {
        enrolmentId: string;
        week: number;
        day: number;
        localDate: string;
        timeZone: string;
        reason: string;
        at: Date;
      },
    ) {
      const reason = input.reason.trim();
      if (reason.length === 0) throw new InvalidWriteError('A skip needs a reason.');
      const current = await enrolment(userId, input.enrolmentId);
      await requireOpenSlot(userId, current, input.week, input.day);
      const programId = await programRow(current.programSlug);
      const inserted = await executor.query<SessionRow>(
        `insert into public.flexibility_sessions
           (user_id, flexibility_program_id, enrolment_id, week, day, local_date, timezone,
            status, started_at, ended_at, skip_reason)
         values ($1, $2, $3, $4, $5, $6, $7, 'skipped', $8, $8, $9)
         returning ${SESSION_COLUMNS}`,
        [
          userId,
          programId?.id ?? null,
          current.id,
          input.week,
          input.day,
          input.localDate,
          input.timeZone,
          input.at.toISOString(),
          reason,
        ],
      );
      return toSession(inserted.rows[0]!);
    },

    async saveFlexCheckin(
      userId: string,
      input: { enrolmentId: string; localDate: string; checkin: Checkin },
    ) {
      await enrolment(userId, input.enrolmentId);
      const parsed = checkinSchema.parse(input.checkin);
      const result = await executor.query<CheckinRow>(
        `insert into public.flexibility_checkins
           (user_id, enrolment_id, week, local_date, toe_touch, leg_raise_left, leg_raise_right,
            tightness, socks, pick_up, pain, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (enrolment_id, week) do update set
           local_date = excluded.local_date, toe_touch = excluded.toe_touch,
           leg_raise_left = excluded.leg_raise_left, leg_raise_right = excluded.leg_raise_right,
           tightness = excluded.tightness, socks = excluded.socks, pick_up = excluded.pick_up,
           pain = excluded.pain, notes = excluded.notes
         returning ${CHECKIN_COLUMNS}`,
        [
          userId,
          input.enrolmentId,
          parsed.week,
          input.localDate,
          parsed.toeTouch,
          parsed.legRaiseLeft,
          parsed.legRaiseRight,
          parsed.tightness,
          parsed.socks,
          parsed.pickUp,
          parsed.pain,
          parsed.notes,
        ],
      );
      return toCheckin(result.rows[0]!);
    },

    async listFlexCheckins(userId: string, enrolmentId: string) {
      const result = await executor.query<CheckinRow>(
        `select ${CHECKIN_COLUMNS} from public.flexibility_checkins
          where user_id = $1 and enrolment_id = $2 order by week`,
        [userId, enrolmentId],
      );
      return result.rows.map(toCheckin);
    },
  };
}
