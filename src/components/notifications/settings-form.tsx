'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  FormField,
  Section,
  SegmentedControl,
  Switch,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  NOTIFICATION_MODULES,
  NOTIFICATION_KIND_LABEL,
  NOTIFICATION_MODULE_LABEL,
  type NotificationPreferences,
} from '@/domain';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

function TimeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <FormField label={label} {...(hint ? { hint } : {})}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          type="time"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        />
      )}
    </FormField>
  );
}

export function NotificationSettingsForm({
  initial,
  onSave,
}: {
  initial: NotificationPreferences;
  onSave: (value: NotificationPreferences) => Promise<Result<NotificationPreferences>>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();
  const set = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => setDraft({ ...draft, [key]: value });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start(async () => {
          const result = await onSave(draft);
          if (!result.ok) setError(result.message);
          else show('Notification settings saved.', 'success');
        });
      }}
    >
      <Section title="What may remind you" hint="Everything is off until you turn it on.">
        <div className="space-y-2">
          {NOTIFICATION_MODULES.map((module) => (
            <Switch
              key={module}
              label={NOTIFICATION_MODULE_LABEL[module]}
              checked={draft.modules[module] ?? false}
              onChange={(on) => set('modules', { ...draft.modules, [module]: on })}
            />
          ))}
        </div>
      </Section>

      <Section
        title="When"
        hint="Local times; when you travel, they follow your clock. The evening review is skipped once it is written, and things still open arrive as one note."
      >
        <div className="grid grid-cols-2 gap-3">
          <TimeField
            label="Morning plan"
            value={draft.morningPlanAt}
            onChange={(value) => set('morningPlanAt', value)}
          />
          <TimeField
            label="Evening review"
            value={draft.eveningReviewAt}
            onChange={(value) => set('eveningReviewAt', value)}
          />
          <TimeField
            label="Things still open"
            value={draft.openItemsAt}
            onChange={(value) => set('openItemsAt', value)}
          />
        </div>
      </Section>

      <Section
        title="Quiet"
        hint="Nothing is sent in quiet hours, and never more than one an hour."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TimeField
              label="Quiet from"
              value={draft.quietStart}
              onChange={(value) => set('quietStart', value ?? '22:00')}
            />
            <TimeField
              label="Quiet until"
              value={draft.quietEnd}
              onChange={(value) => set('quietEnd', value ?? '07:00')}
            />
          </div>
          <SegmentedControl<string>
            legend="At most, per day"
            value={String(draft.dailyCap)}
            onChange={(value) => set('dailyCap', Number(value))}
            options={['1', '2', '3', '4', '5', '6'].map((value) => ({ value, label: value }))}
          />
          <Switch
            label="Bundle the small reminders into one"
            hint="Open habits and tasks, training and programme days arrive together."
            checked={draft.bundleLowPriority}
            onChange={(on) => set('bundleLowPriority', on)}
          />
        </div>
      </Section>

      <Section
        title="A practice reminder (optional)"
        hint="For prayer, meditation or any practice of your own. Off unless you turn it on, and only ever in your words."
      >
        <div className="space-y-3">
          <Switch
            label="Remind me of my practice"
            checked={draft.sacredEnabled}
            onChange={(on) => set('sacredEnabled', on)}
          />
          {draft.sacredEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="In your words" hint="Exactly what the reminder says.">
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={140}
                    value={draft.sacredText ?? ''}
                    onChange={(event) => set('sacredText', event.target.value || null)}
                  />
                )}
              </FormField>
              <TimeField
                label="At"
                value={draft.sacredAt}
                onChange={(value) => set('sacredAt', value)}
              />
            </div>
          ) : null}
        </div>
      </Section>

      {draft.autoMuted.length > 0 ? (
        <Section
          title="Muted"
          hint="Reminders you dismissed two days running. Turn one back on if you miss it."
        >
          <ul className="space-y-1">
            {draft.autoMuted.map((kind) => (
              <li key={kind} className="flex items-center justify-between gap-2 text-body">
                <span className="text-ink">{NOTIFICATION_KIND_LABEL[kind]}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set(
                      'autoMuted',
                      draft.autoMuted.filter((entry) => entry !== kind),
                    )
                  }
                >
                  Unmute
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {error ? (
        <p role="alert" className="text-body-sm text-warn">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={pending}>
        Save notification settings
      </Button>
    </form>
  );
}
