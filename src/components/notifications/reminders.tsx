'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button, Section, useToast } from '@/components/ui';
import type { NotificationAction } from '@/domain';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface DueReminder {
  readonly key: string;
  readonly at: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly completable: boolean;
}

/**
 * The in-app inbox: reminders whose time has come. Each can be done (which
 * completes what it names), snoozed for an hour or dismissed. Nothing here
 * nags; an empty inbox shows nothing at all.
 */
export function Reminders({
  due,
  onAct,
}: {
  due: readonly DueReminder[];
  onAct: (input: {
    key: string;
    action: NotificationAction;
  }) => Promise<Result<{ message: string }>>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  if (due.length === 0) return null;

  const act = (key: string, action: NotificationAction) =>
    start(async () => {
      setError(null);
      const result = await onAct({ key, action });
      if (!result.ok) setError(result.message);
      else show(result.value.message, 'success');
    });

  return (
    <Section title="Reminders" hint="Only what you asked for, at the times you chose.">
      <ul className="divide-y divide-line">
        {due.map((reminder) => (
          <li key={reminder.key} className="py-3" data-testid={`reminder-${reminder.key}`}>
            <p className="text-body font-medium text-ink">
              <Link href={reminder.href} className="hover:underline">
                {reminder.title}
              </Link>
              <span className="ml-2 text-body-sm font-normal text-ink-muted">{reminder.at}</span>
            </p>
            {reminder.body ? <p className="text-body-sm text-ink-muted">{reminder.body}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="quiet"
                loading={pending}
                onClick={() => act(reminder.key, 'done')}
              >
                {reminder.completable ? 'Mark these done' : 'Done'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remind me in an hour: ${reminder.title}`}
                onClick={() => act(reminder.key, 'snoozed')}
              >
                In an hour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Dismiss: ${reminder.title}`}
                onClick={() => act(reminder.key, 'dismissed')}
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-body-sm text-warn">
          {error}
        </p>
      ) : null}
    </Section>
  );
}
