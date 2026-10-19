import {
  ONBOARDING_STEPS,
  onboardingProfileSchema,
  parseStepAnswers,
  type AnswerableStep,
  type Commitment,
  type Day,
  type DayMark,
  type DraftWeek,
  type IsoDate,
  type OnboardingProgress,
  type OnboardingStep,
} from '@/domain';
import {
  RecordNotFoundError,
  type AccountExport,
  type AreteRepository,
  type RecordFocusSessionInput,
  type SetCommitmentStatusInput,
  type UpsertDayInput,
} from './repository';
import { createSqlDailySystem } from './sql/daily-system';
import { createSqlMind } from './sql/mind';
import { createSqlFlexibility } from './sql/flexibility';
import { createSqlTrain } from './sql/train';
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
  ref_id: string | null;
  title_snapshot: string;
  is_minimum: boolean;
  status: Commitment['status'];
  skip_reason: string | null;
  snoozed_to: string | null;
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
    ...(row.ref_id === null ? {} : { refId: row.ref_id }),
    ...(row.snoozed_to === null ? {} : { snoozedTo: row.snoozed_to }),
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
      `select id, kind, ref_id, title_snapshot, is_minimum, status, skip_reason,
              snoozed_to::text
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

  /** The plan row for a day, created if the day does not have one yet. */
  async function ensurePlan(userId: string, localDate: IsoDate, timeZone: string): Promise<string> {
    const plans = await executor.query<{ id: string }>(
      `insert into public.daily_plans (user_id, local_date, timezone)
       values ($1, $2, $3)
       on conflict (user_id, local_date) do update set timezone = excluded.timezone
       returning id`,
      [userId, localDate, timeZone],
    );
    const planId = plans.rows[0]?.id;
    if (!planId) throw new Error('daily_plans upsert returned no row');
    return planId;
  }

  // Goals, tasks, habits, the day's framing and the live timer.
  const daily = createSqlDailySystem(executor, { loadDay, requireDay, ensurePlan });

  // Meditation, breathwork and cognitive practice.
  const mind = createSqlMind(executor);
  const train = createSqlTrain(executor);
  const flexibility = createSqlFlexibility(executor);

  // ---------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------
  //
  // Answers are stored twice, on purpose. `onboarding_answers` keeps the raw
  // response so the flow can be resumed and revisited without interpretation;
  // the typed profile tables hold the handful of facts that actually gate
  // behaviour, because a safety rule must never read a key out of a json blob.
  async function projectStep(
    userId: string,
    step: AnswerableStep,
    answers: Record<string, unknown>,
  ): Promise<void> {
    switch (step) {
      case 'schedule':
        await executor.query(
          `update public.preferences
              set planning_style = $2, available_weekdays = $3,
                  weekday_constraint = $4, wake_time = $5, sleep_time = $6
            where user_id = $1`,
          [
            userId,
            answers['planningStyle'],
            answers['availableWeekdays'],
            answers['weekdayConstraint'],
            answers['wakeTime'] ?? null,
            answers['sleepTime'] ?? null,
          ],
        );
        break;

      case 'training':
        await executor.query(
          `insert into public.training_profile
             (user_id, experience, recent_activity, desired_outcomes, equipment,
              session_minutes, preferred_weekdays)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (user_id) do update set
             experience = excluded.experience, recent_activity = excluded.recent_activity,
             desired_outcomes = excluded.desired_outcomes, equipment = excluded.equipment,
             session_minutes = excluded.session_minutes,
             preferred_weekdays = excluded.preferred_weekdays`,
          [
            userId,
            answers['experience'],
            answers['recentActivity'],
            answers['desiredOutcomes'],
            answers['equipment'],
            answers['sessionMinutes'],
            answers['preferredWeekdays'],
          ],
        );
        break;

      case 'health':
        await executor.query(
          `insert into public.health_profile
             (user_id, pregnancy_status, cardiovascular_or_fainting_history,
              heat_sensitivity, cold_sensitivity, medical_clearance_needed,
              medical_clearance_confirmed_at, injuries, mobility_limitations)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           on conflict (user_id) do update set
             pregnancy_status = excluded.pregnancy_status,
             cardiovascular_or_fainting_history = excluded.cardiovascular_or_fainting_history,
             heat_sensitivity = excluded.heat_sensitivity,
             cold_sensitivity = excluded.cold_sensitivity,
             medical_clearance_needed = excluded.medical_clearance_needed,
             medical_clearance_confirmed_at = excluded.medical_clearance_confirmed_at,
             injuries = excluded.injuries,
             mobility_limitations = excluded.mobility_limitations`,
          [
            userId,
            answers['pregnancyStatus'],
            answers['cardiovascularOrFaintingHistory'],
            answers['heatSensitivity'],
            answers['coldSensitivity'],
            answers['medicalClearanceNeeded'],
            answers['medicalClearanceConfirmed'] === true ? new Date().toISOString() : null,
            JSON.stringify(answers['injuries'] ?? []),
            answers['mobilityLimitations'] ?? null,
          ],
        );
        break;

      case 'food':
        await executor.query(
          `insert into public.nutrition_profile
             (user_id, logging_goal, hide_calorie_numbers, dietary_preferences, allergies)
           values ($1, $2, $3, $4, $5)
           on conflict (user_id) do update set
             logging_goal = excluded.logging_goal,
             hide_calorie_numbers = excluded.hide_calorie_numbers,
             dietary_preferences = excluded.dietary_preferences,
             allergies = excluded.allergies`,
          [
            userId,
            answers['loggingGoal'],
            answers['hideCalorieNumbers'],
            answers['dietaryPreferences'],
            answers['allergies'],
          ],
        );
        await executor.query(`update public.preferences set unit_system = $2 where user_id = $1`, [
          userId,
          answers['unitSystem'],
        ]);
        break;

      case 'mind':
        await executor.query(
          `insert into public.mind_profile
             (user_id, meditation_experience, breathwork_experience, chosen_pack_slugs)
           values ($1, $2, $3, $4)
           on conflict (user_id) do update set
             meditation_experience = excluded.meditation_experience,
             breathwork_experience = excluded.breathwork_experience,
             chosen_pack_slugs = excluded.chosen_pack_slugs`,
          [
            userId,
            answers['meditationExperience'],
            answers['breathworkExperience'],
            answers['chosenPackSlugs'],
          ],
        );
        break;

      case 'age':
        await executor.query(
          `update public.profiles
              set birth_year = $2,
                  guardian_confirmed_at = case when $3 then coalesce(guardian_confirmed_at, now()) else null end
            where id = $1`,
          [userId, answers['birthYear'] ?? null, answers['guardianConfirmed'] === true],
        );
        break;

      case 'minimum':
        await executor.query(
          `update public.preferences set minimum_day_size = $2 where user_id = $1`,
          [userId, answers['minimumDaySize']],
        );
        break;

      case 'intent':
        // Goals become rows when the Plan module is built. Until then the
        // answer lives in onboarding_answers rather than being half-modelled.
        break;
    }
  }

  async function loadOnboarding(userId: string) {
    await executor.query(
      `insert into public.onboarding_progress (user_id) values ($1)
       on conflict (user_id) do nothing`,
      [userId],
    );
    await executor.query(
      `insert into public.preferences (user_id) values ($1) on conflict (user_id) do nothing`,
      [userId],
    );

    const progressRows = await executor.query<{
      current_step: OnboardingStep;
      completed_steps: OnboardingStep[];
      skipped_steps: OnboardingStep[];
      completed_at: string | null;
    }>(
      `select current_step, completed_steps, skipped_steps, completed_at
         from public.onboarding_progress where user_id = $1`,
      [userId],
    );

    const answerRows = await executor.query<{ step: string; answer: Record<string, unknown> }>(
      `select step, answer from public.onboarding_answers where user_id = $1`,
      [userId],
    );

    const answers: Record<string, unknown> = {};
    for (const row of answerRows.rows) answers[row.step] = row.answer;

    const row = progressRows.rows[0];
    const progress: OnboardingProgress = {
      currentStep: row?.current_step ?? 'intent',
      completedSteps: row?.completed_steps ?? [],
      skippedSteps: row?.skipped_steps ?? [],
      completedAt: row?.completed_at ?? null,
    };

    return { progress, profile: onboardingProfileSchema.parse(answers) };
  }

  async function advance(userId: string, step: OnboardingStep, skipped: boolean): Promise<void> {
    const index = ONBOARDING_STEPS.indexOf(step);
    const next = ONBOARDING_STEPS[index + 1] ?? 'review';

    await executor.query(
      `update public.onboarding_progress
          set current_step = $2,
              completed_steps = case when $4 then array_remove(completed_steps, $3)
                                     else (select array_agg(distinct s) from unnest(completed_steps || array[$3]) s) end,
              skipped_steps = case when $4 then (select array_agg(distinct s) from unnest(skipped_steps || array[$3]) s)
                                   else array_remove(skipped_steps, $3) end
        where user_id = $1`,
      [userId, next, step, skipped],
    );
  }

  return {
    kind: 'sql',
    ...daily,
    ...mind,
    ...train,
    ...flexibility,

    async getOnboarding(userId: string) {
      return loadOnboarding(userId);
    },

    async saveStep(userId: string, step: AnswerableStep, answers: unknown) {
      const parsed = parseStepAnswers(step, answers) as Record<string, unknown>;

      await executor.query(
        `insert into public.onboarding_answers (user_id, step, answer)
         values ($1, $2, $3::jsonb)
         on conflict (user_id, step) do update set answer = excluded.answer, answered_at = now()`,
        [userId, step, JSON.stringify(parsed)],
      );

      await loadOnboarding(userId);
      await projectStep(userId, step, parsed);
      await advance(userId, step, false);
      return loadOnboarding(userId);
    },

    async skipStep(userId: string, step: OnboardingStep) {
      await loadOnboarding(userId);
      await advance(userId, step, true);
      return loadOnboarding(userId);
    },

    async saveDraftWeek(userId: string, draft: DraftWeek) {
      const rows = await executor.query<{ id: string }>(
        `insert into public.plan_drafts (user_id, starts_on, timezone, draft)
         values ($1, $2, $3, $4::jsonb) returning id`,
        [userId, draft.startsOn, draft.timeZone, JSON.stringify(draft)],
      );
      const id = rows.rows[0]?.id;
      if (!id) throw new Error('plan_drafts insert returned no row');
      return id;
    },

    async getLatestDraft(userId: string) {
      const rows = await executor.query<{ id: string; draft: DraftWeek }>(
        `select id, draft from public.plan_drafts
          where user_id = $1 order by created_at desc limit 1`,
        [userId],
      );
      const row = rows.rows[0];
      return row ? { id: row.id, draft: row.draft } : null;
    },

    async acceptDraft(userId: string, draftId: string, at: Date) {
      const rows = await executor.query<{ draft: DraftWeek }>(
        `select draft from public.plan_drafts where user_id = $1 and id = $2`,
        [userId, draftId],
      );
      const draft = rows.rows[0]?.draft;
      if (!draft) throw new RecordNotFoundError(`No draft ${draftId} for this account`);

      for (const day of draft.days) {
        const plans = await executor.query<{ id: string }>(
          `insert into public.daily_plans (user_id, local_date, timezone)
           values ($1, $2, $3)
           on conflict (user_id, local_date) do update set timezone = excluded.timezone
           returning id`,
          [userId, day.date, draft.timeZone],
        );
        const planId = plans.rows[0]?.id;
        if (!planId) continue;

        for (const [index, item] of day.items.entries()) {
          await executor.query(
            `insert into public.daily_plan_items
               (user_id, daily_plan_id, kind, title_snapshot, is_minimum, position)
             select $1, $2, $3, $4, $5, $6
              where not exists (
                select 1 from public.daily_plan_items
                 where user_id = $1 and daily_plan_id = $2 and title_snapshot = $4
              )`,
            [userId, planId, item.kind, item.title, item.isMinimum, index],
          );
        }
      }

      await executor.query(
        `update public.plan_drafts set accepted_at = $3 where user_id = $1 and id = $2`,
        [userId, draftId, at.toISOString()],
      );
      await executor.query(
        `update public.onboarding_progress set completed_at = $2, current_step = 'review'
          where user_id = $1`,
        [userId, at.toISOString()],
      );
    },

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
