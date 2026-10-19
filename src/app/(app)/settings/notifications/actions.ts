'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/auth';
import {
  NOTIFICATION_ACTIONS,
  notificationPreferencesSchema,
  shouldAutoMute,
  snoozeUntil,
  type NotificationPreferences,
} from '@/domain';
import { withUser } from '@/persistence';
import { InvalidWriteError } from '@/persistence/repository';
import { resolveCurrentDay } from '../../current-day';
import { loadNotificationContext } from './context';

export type NotificationResult<T> = { ok: true; value: T } | { ok: false; message: string };

export async function saveNotificationPreferencesAction(
  input: unknown,
): Promise<NotificationResult<NotificationPreferences>> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the settings.' };
  if (parsed.data.sacredEnabled && !parsed.data.sacredText)
    return { ok: false, message: 'Write the reminder in your own words, or leave it off.' };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const value = await withUser(user.id, (repository) =>
    repository.saveNotificationPreferences(user.id, parsed.data),
  );
  revalidatePath('/settings/notifications');
  revalidatePath('/today');
  return { ok: true, value };
}

const actSchema = z.object({
  key: z.string().min(1).max(40),
  action: z.enum(NOTIFICATION_ACTIONS),
});

/**
 * Done, snooze or dismiss a due reminder. "Done" completes the day's items
 * it named, where it named any. A kind dismissed on two days running is
 * muted, and the reply says so.
 */
export async function actOnNotificationAction(
  input: unknown,
): Promise<NotificationResult<{ message: string }>> {
  const parsed = actSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Unknown reminder.' };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const now = new Date();
    const context = await loadNotificationContext(repository, user.id, localDate, timeZone, now);
    const notification = context.due.find((entry) => entry.key === parsed.data.key);
    if (!notification)
      return { ok: false as const, message: 'That reminder is no longer waiting.' };
    try {
      if (parsed.data.action === 'snoozed') {
        const until = snoozeUntil(now, notification.at, context.preferences);
        if (!until)
          return { ok: false as const, message: 'An hour from now is inside your quiet hours.' };
        await repository.recordNotificationEvent(user.id, {
          localDate,
          timeZone,
          key: notification.key,
          kind: notification.kind,
          action: 'snoozed',
          snoozedUntil: until.toISOString(),
        });
        return { ok: true as const, value: { message: 'Back in an hour.' } };
      }
      if (parsed.data.action === 'done') {
        const day = await repository.getDay(user.id, localDate);
        for (const id of notification.items) {
          const item = day?.commitments.find((entry) => entry.id === id);
          if (item && item.status === 'pending') {
            await repository.setCommitmentStatus(user.id, {
              localDate,
              commitmentId: id,
              status: 'done',
              at: now,
            });
          }
        }
      }
      const event = await repository.recordNotificationEvent(user.id, {
        localDate,
        timeZone,
        key: notification.key,
        kind: notification.kind,
        action: parsed.data.action,
        snoozedUntil: null,
      });
      if (
        event.action === 'dismissed' &&
        notification.kind !== 'sacred' &&
        shouldAutoMute([...context.events, event], notification.kind)
      ) {
        await repository.saveNotificationPreferences(user.id, {
          ...context.preferences,
          autoMuted: [...new Set([...context.preferences.autoMuted, notification.kind])],
        });
        return {
          ok: true as const,
          value: {
            message:
              'Dismissed two days running, so this reminder is now muted. Turn it back on in Settings → Notifications.',
          },
        };
      }
      return {
        ok: true as const,
        value: { message: parsed.data.action === 'done' ? 'Done.' : 'Dismissed.' },
      };
    } catch (error) {
      if (error instanceof InvalidWriteError) return { ok: false as const, message: error.message };
      throw error;
    }
  });
  revalidatePath('/today');
  return result;
}
