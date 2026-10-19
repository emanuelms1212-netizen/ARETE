import {
  notificationPreferencesSchema,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/domain';
import { InvalidWriteError } from '../repository';

/** Notification settings and the inbox's history, in memory. Same rules as SQL. */
export function createMemoryNotifications() {
  const preferences = new Map<string, NotificationPreferences>();
  const events = new Map<string, NotificationEvent[]>();

  return {
    async getNotificationPreferences(userId: string) {
      return structuredClone(preferences.get(userId) ?? notificationPreferencesSchema.parse({}));
    },

    async saveNotificationPreferences(userId: string, value: NotificationPreferences) {
      const parsed = notificationPreferencesSchema.parse(value);
      preferences.set(userId, parsed);
      return structuredClone(parsed);
    },

    async listNotificationEvents(userId: string, range: { from: string; to: string }) {
      return (events.get(userId) ?? [])
        .filter((event) => event.localDate >= range.from && event.localDate <= range.to)
        .map((event) => structuredClone(event));
    },

    async recordNotificationEvent(userId: string, event: NotificationEvent & { timeZone: string }) {
      if ((event.action === 'snoozed') !== (event.snoozedUntil !== null))
        throw new InvalidWriteError('A snooze needs a time, and only a snooze has one.');
      const { timeZone: _zone, ...stored } = event;
      void _zone;
      events.set(userId, [...(events.get(userId) ?? []), stored]);
      return structuredClone(stored);
    },

    exportNotifications(userId: string) {
      return {
        notification_preferences: preferences.has(userId)
          ? [structuredClone(preferences.get(userId)!) as unknown as Record<string, unknown>]
          : [],
        notification_events: (events.get(userId) ?? []).map(
          (event) => structuredClone(event) as unknown as Record<string, unknown>,
        ),
      };
    },

    deleteNotifications(userId: string) {
      preferences.delete(userId);
      events.delete(userId);
    },
  };
}
