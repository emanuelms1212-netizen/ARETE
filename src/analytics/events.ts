import { z } from 'zod';

/**
 * Analytics event definitions.
 *
 * The hard rule from PRODUCT_SPEC §10: **no free text ever leaves the device in
 * an event.** No journal entries, no review answers, no food descriptions, no
 * goal titles. Payloads carry ids, counts, durations and enums, and the schemas
 * below are what enforces that — an event with a `note` field would fail review
 * here, not in production.
 */
const base = z.object({});

export const analyticsEventSchemas = {
  onboarding_step_completed: base.extend({ step: z.int().min(0) }),
  day_committed: base.extend({ commitmentCount: z.int().min(0), minimumCount: z.int().min(0) }),
  habit_completed: base.extend({ habitId: z.string() }),
  task_completed: base.extend({ taskId: z.string() }),
  focus_session_started: base.extend({ plannedMinutes: z.int().min(1) }),
  focus_session_completed: base.extend({
    actualMinutes: z.int().min(0),
    interruptions: z.int().min(0),
  }),
  focus_session_abandoned: base.extend({ elapsedMinutes: z.int().min(0) }),
  workout_session_completed: base.extend({ exerciseCount: z.int().min(0), adapted: z.boolean() }),
  mobility_session_completed: base.extend({ programId: z.string(), adapted: z.boolean() }),
  mind_session_completed: base.extend({
    practice: z.enum(['meditation', 'breathwork', 'cognitive']),
    minutes: z.int().min(0),
  }),
  food_entry_created: base.extend({ hasMacros: z.boolean() }),
  day_marked: base.extend({ mark: z.enum(['normal', 'travel', 'not-today']) }),
  day_review_completed: base.extend({ completionRatio: z.number().min(0).max(1) }),
  week_review_completed: base.extend({ activeDays: z.int().min(0).max(7) }),
  program_started: base.extend({ programId: z.string(), edited: z.boolean() }),
  program_adjusted: base.extend({ programId: z.string() }),
  program_paused: base.extend({ programId: z.string() }),
  module_enabled: base.extend({ moduleId: z.string() }),
  module_disabled: base.extend({ moduleId: z.string() }),
  notification_muted: base.extend({ kind: z.string() }),
  data_exported: base,
} as const;

export type AnalyticsEventName = keyof typeof analyticsEventSchemas;

export type AnalyticsPayload<TName extends AnalyticsEventName> = z.infer<
  (typeof analyticsEventSchemas)[TName]
>;
