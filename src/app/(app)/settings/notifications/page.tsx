import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { NotificationSettingsForm } from '@/components/notifications/settings-form';
import { EmptyState, PageHeader, Section } from '@/components/ui';
import { NOTIFICATION_KIND_LABEL } from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../../current-day';
import { saveNotificationPreferencesAction } from './actions';
import { loadNotificationContext } from './context';

export const metadata: Metadata = { title: 'Notifications' };

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }
  const data = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    return loadNotificationContext(repository, user.id, localDate, timeZone, new Date());
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
        }
        title="Notifications"
        lede="Quiet by default. Reminders arrive in the app, at the times you choose, and never use guilt or urgency."
      />
      <Section
        title="Today, with these settings"
        hint={`Times in ${data.timeZone}. Change your time zone when you travel and they follow.`}
      >
        {data.plan.planned.length === 0 ? (
          <p className="text-body text-ink-muted" data-testid="notification-plan">
            Nothing would be sent today.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="notification-plan">
            {data.plan.planned.map((notification) => (
              <li key={notification.key} className="text-body text-ink">
                <span className="font-medium">{notification.at}</span> — {notification.title}
              </li>
            ))}
          </ul>
        )}
        {data.plan.withheld.length > 0 ? (
          <ul
            className="mt-3 space-y-1 text-body-sm text-ink-muted"
            data-testid="notification-withheld"
          >
            {data.plan.withheld.map((entry, index) => (
              <li key={`${entry.kind}-${index}`}>
                Not sent: {NOTIFICATION_KIND_LABEL[entry.kind].toLowerCase()} — {entry.reason}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-body-sm text-ink-muted">
          Reminders appear on Today when their time comes. Phone push notifications arrive with the
          offline work in a later stage.
        </p>
      </Section>
      <NotificationSettingsForm
        initial={data.preferences}
        onSave={saveNotificationPreferencesAction}
      />
    </div>
  );
}
