import {
  WEEKLY_PROMPTS,
  addDays,
  breakProblem,
  contrastProtocolSchema,
  contrastScreeningSchema,
  resetCustomisationSchema,
  type ContrastScreening,
  type ContrastSessionRecord,
  type IsoDate,
  type ResetBreak,
  type ResetCheckin,
  type ResetComponent,
  type ResetCustomisation,
  type ResetLog,
  type Virtue,
  type WeeklyPromptKey,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type JournalDay,
  type ResetEnrolment,
} from '../repository';
import type { SqlExecutor } from '../sql-executor';

/**
 * Programmes and reflection, in SQL. Targets are never stored — only what the
 * person chose (the customisation) and what they did (logs, with the
 * programme day and target text as they were). Ownership across tables is
 * enforced by `guard_reset_enrolment_owner` as well as by these checks.
 */
const iso = (value: string | Date) => new Date(value).toISOString();

interface EnrolmentRow {
  id: string;
  started_on: string;
  timezone: string;
  customisation: unknown;
  status: ResetEnrolment['status'];
}

interface BreakRow {
  id: string;
  kind: ResetBreak['kind'];
  starts_on: string;
  ends_on: string | null;
}

const ENROLMENT_COLUMNS = 'id, started_on::text, timezone, customisation, status';

export function createSqlPrograms(executor: SqlExecutor) {
  async function hydrate(row: EnrolmentRow): Promise<ResetEnrolment> {
    const breaks = await executor.query<BreakRow>(
      `select id, kind, starts_on::text, ends_on::text from public.reset_breaks
        where enrolment_id = $1 order by starts_on, created_at`,
      [row.id],
    );
    return {
      id: row.id,
      startedOn: row.started_on,
      timeZone: row.timezone,
      customisation: resetCustomisationSchema.parse(row.customisation),
      status: row.status,
      breaks: breaks.rows.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        from: entry.starts_on,
        to: entry.ends_on,
      })),
    };
  }

  async function enrolmentOf(userId: string, enrolmentId: string): Promise<ResetEnrolment> {
    const result = await executor.query<EnrolmentRow>(
      `select ${ENROLMENT_COLUMNS} from public.reset_enrolments where id = $1 and user_id = $2`,
      [enrolmentId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new RecordNotFoundError('No such programme for this account');
    return hydrate(row);
  }

  async function activeOf(userId: string, enrolmentId: string): Promise<ResetEnrolment> {
    const enrolment = await enrolmentOf(userId, enrolmentId);
    if (enrolment.status !== 'active') throw new InvalidWriteError('That programme has ended.');
    return enrolment;
  }

  async function readWeekly(userId: string, weekStart: IsoDate) {
    const result = await executor.query<{ prompt: WeeklyPromptKey; body: string }>(
      `select prompt, body from public.journal_entries
        where user_id = $1 and local_date = $2 and kind = 'weekly_review'`,
      [userId, weekStart],
    );
    return Object.fromEntries(result.rows.map((row) => [row.prompt, row.body])) as Partial<
      Record<WeeklyPromptKey, string>
    >;
  }

  return {
    async getActiveReset(userId: string) {
      const result = await executor.query<EnrolmentRow>(
        `select ${ENROLMENT_COLUMNS} from public.reset_enrolments where user_id = $1 and status = 'active'`,
        [userId],
      );
      return result.rows[0] ? hydrate(result.rows[0]) : null;
    },

    async getLastReset(userId: string) {
      const result = await executor.query<EnrolmentRow>(
        `select ${ENROLMENT_COLUMNS} from public.reset_enrolments
          where user_id = $1 and status <> 'active' order by ended_at desc nulls last limit 1`,
        [userId],
      );
      return result.rows[0] ? hydrate(result.rows[0]) : null;
    },

    async startReset(
      userId: string,
      input: { startedOn: IsoDate; timeZone: string; customisation: ResetCustomisation },
    ) {
      const running = await executor.query(
        `select 1 from public.reset_enrolments where user_id = $1 and status = 'active'`,
        [userId],
      );
      if (running.rows.length > 0) {
        throw new InvalidWriteError('A reset is already running. End it before starting another.');
      }
      const result = await executor.query<EnrolmentRow>(
        `insert into public.reset_enrolments (user_id, started_on, timezone, customisation)
         values ($1, $2, $3, $4) returning ${ENROLMENT_COLUMNS}`,
        [
          userId,
          input.startedOn,
          input.timeZone,
          JSON.stringify(resetCustomisationSchema.parse(input.customisation)),
        ],
      );
      return hydrate(result.rows[0]!);
    },

    async updateResetCustomisation(
      userId: string,
      enrolmentId: string,
      customisation: ResetCustomisation,
    ) {
      await activeOf(userId, enrolmentId);
      await executor.query(
        `update public.reset_enrolments set customisation = $3 where id = $1 and user_id = $2`,
        [enrolmentId, userId, JSON.stringify(resetCustomisationSchema.parse(customisation))],
      );
      return enrolmentOf(userId, enrolmentId);
    },

    async addResetBreak(
      userId: string,
      enrolmentId: string,
      input: { kind: ResetBreak['kind']; from: IsoDate; to: IsoDate | null },
    ) {
      const enrolment = await activeOf(userId, enrolmentId);
      if (input.from < enrolment.startedOn)
        throw new InvalidWriteError('A break cannot start before the programme.');
      const problem = breakProblem(enrolment.breaks, input, input.from);
      if (problem) throw new InvalidWriteError(problem);
      await executor.query(
        `insert into public.reset_breaks (user_id, enrolment_id, kind, starts_on, ends_on)
         values ($1, $2, $3, $4, $5)`,
        [userId, enrolmentId, input.kind, input.from, input.to],
      );
      return enrolmentOf(userId, enrolmentId);
    },

    async endResetBreak(userId: string, enrolmentId: string, breakId: string, resumeOn: IsoDate) {
      const enrolment = await activeOf(userId, enrolmentId);
      const found = enrolment.breaks.find((entry) => entry.id === breakId);
      if (!found) throw new RecordNotFoundError('No such break');
      if (resumeOn <= found.from) {
        await executor.query(`delete from public.reset_breaks where id = $1 and user_id = $2`, [
          breakId,
          userId,
        ]);
      } else {
        const end = addDays(resumeOn, -1);
        await executor.query(
          `update public.reset_breaks set ends_on = $3
            where id = $1 and user_id = $2 and (ends_on is null or ends_on > $3)`,
          [breakId, userId, end],
        );
      }
      return enrolmentOf(userId, enrolmentId);
    },

    async endReset(userId: string, enrolmentId: string, status: 'finished' | 'ended', at: Date) {
      await activeOf(userId, enrolmentId);
      await executor.query(
        `update public.reset_enrolments set status = $3, ended_at = $4 where id = $1 and user_id = $2`,
        [enrolmentId, userId, status, at.toISOString()],
      );
      return enrolmentOf(userId, enrolmentId);
    },

    async logResetItem(
      userId: string,
      input: {
        enrolmentId: string;
        localDate: IsoDate;
        timeZone: string;
        programDay: number;
        component: ResetComponent;
        status: ResetLog['status'];
        targetText: string;
      },
    ) {
      await activeOf(userId, input.enrolmentId);
      if (input.programDay < 1 || input.programDay > 66)
        throw new InvalidWriteError('That is not a programme day.');
      await executor.query(
        `insert into public.reset_logs
           (user_id, enrolment_id, local_date, timezone, program_day, component, status, target_text)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (enrolment_id, local_date, component) do update set
           status = excluded.status, program_day = excluded.program_day,
           target_text = excluded.target_text, logged_at = now()`,
        [
          userId,
          input.enrolmentId,
          input.localDate,
          input.timeZone,
          input.programDay,
          input.component,
          input.status,
          input.targetText,
        ],
      );
      return {
        localDate: input.localDate,
        programDay: input.programDay,
        component: input.component,
        status: input.status,
        targetText: input.targetText,
      };
    },

    async clearResetItem(
      userId: string,
      input: { enrolmentId: string; localDate: IsoDate; component: ResetComponent },
    ) {
      await executor.query(
        `delete from public.reset_logs
          where user_id = $1 and enrolment_id = $2 and local_date = $3 and component = $4`,
        [userId, input.enrolmentId, input.localDate, input.component],
      );
    },

    async listResetLogs(userId: string, enrolmentId: string) {
      await enrolmentOf(userId, enrolmentId);
      const result = await executor.query<{
        local_date: string;
        program_day: number;
        component: ResetComponent;
        status: ResetLog['status'];
        target_text: string;
      }>(
        `select local_date::text, program_day, component, status, target_text from public.reset_logs
          where user_id = $1 and enrolment_id = $2 order by local_date, component`,
        [userId, enrolmentId],
      );
      return result.rows.map((row) => ({
        localDate: row.local_date,
        programDay: Number(row.program_day),
        component: row.component,
        status: row.status,
        targetText: row.target_text,
      }));
    },

    async countResetDone(userId: string, range: { from: IsoDate; to: IsoDate }) {
      const result = await executor.query<{ count: number }>(
        `select count(*)::int as count from public.reset_logs
          where user_id = $1 and status = 'done' and local_date between $2 and $3`,
        [userId, range.from, range.to],
      );
      return result.rows[0]?.count ?? 0;
    },

    async saveResetCheckin(userId: string, enrolmentId: string, checkin: ResetCheckin) {
      await activeOf(userId, enrolmentId);
      const existing = await executor.query(
        `select 1 from public.reset_checkins where enrolment_id = $1 and program_week = $2`,
        [enrolmentId, checkin.programWeek],
      );
      if (existing.rows.length > 0)
        throw new InvalidWriteError('That week already has a check-in.');
      await executor.query(
        `insert into public.reset_checkins (user_id, enrolment_id, program_week, choice, note)
         values ($1, $2, $3, $4, $5)`,
        [userId, enrolmentId, checkin.programWeek, checkin.choice, checkin.note],
      );
      return checkin;
    },

    async listResetCheckins(userId: string, enrolmentId: string) {
      const result = await executor.query<{
        program_week: number;
        choice: ResetCheckin['choice'];
        note: string | null;
      }>(
        `select program_week, choice, note from public.reset_checkins
          where user_id = $1 and enrolment_id = $2 order by program_week`,
        [userId, enrolmentId],
      );
      return result.rows.map((row) => ({
        programWeek: Number(row.program_week),
        choice: row.choice,
        note: row.note,
      }));
    },

    async listJournal(userId: string, range: { from: IsoDate; to: IsoDate }) {
      const result = await executor.query<{
        local_date: string;
        intention: string | null;
        in_my_control: string | null;
        not_my_control: string | null;
        virtue: Virtue | null;
        obstacle: string | null;
        minimum_mode: boolean | null;
        went_well: string | null;
        friction: string | null;
        tomorrow_one_thing: string | null;
        learned: string | null;
        energy: 'low' | 'steady' | 'high' | null;
        met_minimum: boolean | null;
        has_review: boolean;
      }>(
        `select d.local_date::text, p.intention, p.in_my_control, p.not_my_control, p.virtue,
                p.obstacle, p.minimum_mode, r.went_well, r.friction, r.tomorrow_one_thing,
                r.learned, r.energy, r.met_minimum, r.id is not null as has_review
           from (select local_date from public.daily_plans where user_id = $1 and local_date between $2 and $3
                 union select local_date from public.day_reviews where user_id = $1 and local_date between $2 and $3) d
           left join public.daily_plans p on p.user_id = $1 and p.local_date = d.local_date
           left join public.day_reviews r on r.user_id = $1 and r.local_date = d.local_date
          order by d.local_date`,
        [userId, range.from, range.to],
      );
      const days: JournalDay[] = [];
      for (const row of result.rows) {
        const framingHas =
          row.intention || row.in_my_control || row.not_my_control || row.virtue || row.obstacle;
        const reviewHas = row.went_well || row.friction || row.tomorrow_one_thing || row.learned;
        if (!framingHas && !reviewHas) continue;
        days.push({
          localDate: row.local_date,
          framing: framingHas
            ? {
                intention: row.intention,
                inMyControl: row.in_my_control,
                notMyControl: row.not_my_control,
                virtue: row.virtue,
                obstacle: row.obstacle,
                minimumMode: row.minimum_mode ?? false,
              }
            : null,
          review: reviewHas
            ? {
                localDate: row.local_date,
                wentWell: row.went_well,
                friction: row.friction,
                tomorrowOneThing: row.tomorrow_one_thing,
                learned: row.learned,
                energy: row.energy,
                metMinimum: row.met_minimum,
              }
            : null,
        });
      }
      return days;
    },

    async getWeeklyReview(userId: string, weekStart: IsoDate) {
      return readWeekly(userId, weekStart);
    },

    async saveWeeklyReview(
      userId: string,
      input: {
        weekStart: IsoDate;
        timeZone: string;
        answers: Partial<Record<WeeklyPromptKey, string | null>>;
      },
    ) {
      for (const prompt of WEEKLY_PROMPTS) {
        if (!(prompt.key in input.answers)) continue;
        const text = input.answers[prompt.key]?.trim() ?? '';
        if (text.length > 2000)
          throw new InvalidWriteError('Keep each answer under 2000 characters.');
        if (text === '') {
          await executor.query(
            `delete from public.journal_entries
              where user_id = $1 and local_date = $2 and kind = 'weekly_review' and prompt = $3`,
            [userId, input.weekStart, prompt.key],
          );
        } else {
          await executor.query(
            `insert into public.journal_entries (user_id, local_date, timezone, kind, prompt, body)
             values ($1, $2, $3, 'weekly_review', $4, $5)
             on conflict (user_id, local_date, prompt) where kind = 'weekly_review'
             do update set body = excluded.body`,
            [userId, input.weekStart, input.timeZone, prompt.key, text],
          );
        }
      }
      return readWeekly(userId, input.weekStart);
    },

    async getContrastScreening(userId: string) {
      const result = await executor.query<{ answers: unknown; clinician_cleared: boolean }>(
        `select answers, clinician_cleared from public.contrast_screenings where user_id = $1`,
        [userId],
      );
      const row = result.rows[0];
      return row
        ? contrastScreeningSchema.parse({
            answers: row.answers,
            clinicianCleared: row.clinician_cleared,
          })
        : null;
    },

    async saveContrastScreening(userId: string, screening: ContrastScreening) {
      const parsed = contrastScreeningSchema.parse(screening);
      await executor.query(
        `insert into public.contrast_screenings (user_id, answers, clinician_cleared)
         values ($1, $2, $3)
         on conflict (user_id) do update set answers = excluded.answers,
           clinician_cleared = excluded.clinician_cleared, screened_at = now()`,
        [userId, JSON.stringify(parsed.answers), parsed.clinicianCleared],
      );
      return parsed;
    },

    async getSafetyAcknowledgement(userId: string, topic: 'contrast_therapy' | 'cold_exposure') {
      const result = await executor.query<{ notice_version: string }>(
        `select notice_version from public.safety_acknowledgements
          where user_id = $1 and topic = $2 order by acknowledged_at desc limit 1`,
        [userId, topic],
      );
      return result.rows[0]?.notice_version ?? null;
    },

    async acknowledgeSafety(
      userId: string,
      input: { topic: 'contrast_therapy' | 'cold_exposure'; version: string; at: Date },
    ) {
      await executor.query(
        `insert into public.safety_acknowledgements (user_id, topic, notice_version, acknowledged_at)
         values ($1, $2, $3, $4)
         on conflict (user_id, topic, notice_version) do update set acknowledged_at = excluded.acknowledged_at`,
        [userId, input.topic, input.version, input.at.toISOString()],
      );
    },

    async disableContrast(userId: string) {
      await executor.query(`delete from public.contrast_screenings where user_id = $1`, [userId]);
      await executor.query(
        `delete from public.safety_acknowledgements where user_id = $1 and topic = 'contrast_therapy'`,
        [userId],
      );
    },

    async recordContrastSession(
      userId: string,
      input: Omit<ContrastSessionRecord, 'id'> & { timeZone: string; clientToken: string },
    ) {
      const protocol = contrastProtocolSchema.parse(input.protocol);
      if (input.endedAt < input.startedAt)
        throw new InvalidWriteError('A session cannot end before it starts.');
      await executor.query(
        `insert into public.contrast_sessions
           (user_id, local_date, timezone, protocol, phases_completed, status, stop_reason,
            started_at, ended_at, client_token)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (user_id, client_token) do nothing`,
        [
          userId,
          input.localDate,
          input.timeZone,
          JSON.stringify(protocol),
          input.phasesCompleted,
          input.status,
          input.stopReason,
          input.startedAt,
          input.endedAt,
          input.clientToken,
        ],
      );
      const result = await executor.query<ContrastRow>(
        `select ${CONTRAST_COLUMNS} from public.contrast_sessions where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );
      return contrastOf(result.rows[0]!);
    },

    async listContrastSessions(userId: string, range: { from: IsoDate; to: IsoDate }) {
      const result = await executor.query<ContrastRow>(
        `select ${CONTRAST_COLUMNS} from public.contrast_sessions
          where user_id = $1 and local_date between $2 and $3 order by started_at desc`,
        [userId, range.from, range.to],
      );
      return result.rows.map(contrastOf);
    },

    async deleteContrastSessions(userId: string) {
      await executor.query(`delete from public.contrast_sessions where user_id = $1`, [userId]);
    },
  };
}

interface ContrastRow {
  id: string;
  local_date: string;
  protocol: unknown;
  phases_completed: number;
  status: ContrastSessionRecord['status'];
  stop_reason: ContrastSessionRecord['stopReason'];
  started_at: string | Date;
  ended_at: string | Date;
}

const CONTRAST_COLUMNS =
  'id, local_date::text, protocol, phases_completed, status, stop_reason, started_at, ended_at';

function contrastOf(row: ContrastRow): ContrastSessionRecord {
  return {
    id: row.id,
    localDate: row.local_date,
    protocol: contrastProtocolSchema.parse(row.protocol),
    phasesCompleted: Number(row.phases_completed),
    status: row.status,
    stopReason: row.stop_reason,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
  };
}
