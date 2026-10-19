import {
  NOTIFICATION_KINDS,
  notificationPreferencesSchema,
  type NotificationKind,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/domain';
import { InvalidWriteError } from '../repository';
import type { SqlExecutor } from '../sql-executor';

/**
 * Notification settings live on `notification_preferences` (one row, created
 * on first save); what happened to each reminder lives on
 * `notification_events`.
 */
interface PreferencesRow {
  morning_plan_at: string | null;
  evening_review_at: string | null;
  open_items_at: string | null;
  modules: Record<string, boolean>;
  quiet_hours_start: string;
  quiet_hours_end: string | null;
  daily_cap: number;
  bundle_low_priority: boolean;
  sacred_enabled: boolean;
  sacred_at: string | null;
  sacred_text: string | null;
  auto_muted_kinds: string[];
}

const hhmm = (value: string | null) => (value === null ? null : value.slice(0, 5));

export function createSqlNotifications(executor: SqlExecutor) {
  return {
    async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
      const result = await executor.query<PreferencesRow>(
        `select morning_plan_at::text, evening_review_at::text, open_items_at::text, modules,
                quiet_hours_start::text, quiet_hours_end::text, daily_cap, bundle_low_priority,
                sacred_enabled, sacred_at::text, sacred_text, auto_muted_kinds
           from public.notification_preferences where user_id = $1`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return notificationPreferencesSchema.parse({});
      return notificationPreferencesSchema.parse({
        morningPlanAt: hhmm(row.morning_plan_at),
        eveningReviewAt: hhmm(row.evening_review_at),
        openItemsAt: hhmm(row.open_items_at),
        modules: row.modules,
        quietStart: hhmm(row.quiet_hours_start) ?? '22:00',
        quietEnd: hhmm(row.quiet_hours_end) ?? '07:00',
        dailyCap: Number(row.daily_cap),
        bundleLowPriority: row.bundle_low_priority,
        sacredEnabled: row.sacred_enabled,
        sacredAt: hhmm(row.sacred_at),
        sacredText: row.sacred_text,
        // Older kinds the planner no longer knows are dropped rather than refused.
        autoMuted: row.auto_muted_kinds.filter((kind): kind is NotificationKind =>
          (NOTIFICATION_KINDS as readonly string[]).includes(kind),
        ),
      });
    },

    async saveNotificationPreferences(userId: string, value: NotificationPreferences) {
      const parsed = notificationPreferencesSchema.parse(value);
      await executor.query(
        `insert into public.notification_preferences
           (user_id, morning_plan_at, evening_review_at, open_items_at, modules, quiet_hours_start,
            quiet_hours_end, daily_cap, bundle_low_priority, sacred_enabled, sacred_at, sacred_text,
            auto_muted_kinds)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (user_id) do update set
           morning_plan_at = excluded.morning_plan_at, evening_review_at = excluded.evening_review_at,
           open_items_at = excluded.open_items_at, modules = excluded.modules,
           quiet_hours_start = excluded.quiet_hours_start, quiet_hours_end = excluded.quiet_hours_end,
           daily_cap = excluded.daily_cap, bundle_low_priority = excluded.bundle_low_priority,
           sacred_enabled = excluded.sacred_enabled, sacred_at = excluded.sacred_at,
           sacred_text = excluded.sacred_text, auto_muted_kinds = excluded.auto_muted_kinds`,
        [
          userId,
          parsed.morningPlanAt,
          parsed.eveningReviewAt,
          parsed.openItemsAt,
          JSON.stringify(parsed.modules),
          parsed.quietStart,
          parsed.quietEnd,
          parsed.dailyCap,
          parsed.bundleLowPriority,
          parsed.sacredEnabled,
          parsed.sacredAt,
          parsed.sacredText,
          parsed.autoMuted,
        ],
      );
      return parsed;
    },

    async listNotificationEvents(userId: string, range: { from: string; to: string }) {
      const result = await executor.query<{
        local_date: string;
        key: string;
        kind: NotificationEvent['kind'];
        action: NotificationEvent['action'];
        snoozed_until: string | Date | null;
      }>(
        `select local_date::text, key, kind, action, snoozed_until from public.notification_events
          where user_id = $1 and local_date between $2 and $3 order by created_at`,
        [userId, range.from, range.to],
      );
      return result.rows.map((row) => ({
        localDate: row.local_date,
        key: row.key,
        kind: row.kind,
        action: row.action,
        snoozedUntil: row.snoozed_until === null ? null : new Date(row.snoozed_until).toISOString(),
      }));
    },

    async recordNotificationEvent(userId: string, event: NotificationEvent & { timeZone: string }) {
      if ((event.action === 'snoozed') !== (event.snoozedUntil !== null))
        throw new InvalidWriteError('A snooze needs a time, and only a snooze has one.');
      await executor.query(
        `insert into public.notification_events
           (user_id, local_date, timezone, key, kind, action, snoozed_until)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          event.localDate,
          event.timeZone,
          event.key,
          event.kind,
          event.action,
          event.snoozedUntil,
        ],
      );
      const { timeZone: _zone, ...stored } = event;
      void _zone;
      return stored;
    },
  };
}
