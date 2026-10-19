'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  ChoiceList,
  FormField,
  SegmentedControl,
  TextArea,
  useToast,
} from '@/components/ui';
import {
  EASE_LABEL,
  EASE_LEVELS,
  LEG_RAISE_LABEL,
  LEG_RAISE_LEVELS,
  PAIN_LABEL,
  PAIN_LEVELS,
  TOE_TOUCH_LABEL,
  TOE_TOUCH_LEVELS,
  checkinSchema,
  type Checkin,
} from '@/domain';

/**
 * The weekly self-report.
 *
 * Six questions a person can answer standing in their kitchen, each about a
 * pain-free range or an everyday task. No measuring tape, no photographs
 * collected, nothing scored. It says so, because people reasonably wonder.
 */
export interface CheckinFormProps {
  readonly week: number;
  readonly initial?: Partial<Checkin>;
  /** Called with a validated check-in. Returns an error message to show, or null. */
  readonly onSave: (checkin: Checkin) => Promise<string | null>;
  readonly submitLabel?: string;
  /** The toast after a successful save. Null to leave it to the caller. */
  readonly successMessage?: string | null;
  readonly onSkip?: () => void;
}

function Select<T extends string>({
  label,
  hint,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (next: T) => void;
}) {
  return (
    <FormField label={label} {...(hint ? { hint } : {})}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-2 text-body text-ink"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

export function CheckinForm({
  week,
  initial,
  onSave,
  submitLabel,
  successMessage,
  onSkip,
}: CheckinFormProps) {
  const [toeTouch, setToeTouch] = useState(initial?.toeTouch ?? 'mid_shin');
  const [legRaiseLeft, setLeft] = useState(initial?.legRaiseLeft ?? 'to_70');
  const [legRaiseRight, setRight] = useState(initial?.legRaiseRight ?? 'to_70');
  const [tightness, setTightness] = useState(String(initial?.tightness ?? 5));
  const [socks, setSocks] = useState(initial?.socks ?? 'some_effort');
  const [pickUp, setPickUp] = useState(initial?.pickUp ?? 'some_effort');
  const [pain, setPain] = useState(initial?.pain ?? 'none');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  const ease = EASE_LEVELS.map((value) => ({ value, label: EASE_LABEL[value] }));

  return (
    <form
      className="space-y-4"
      aria-label={week === 0 ? 'Baseline check-in' : `Week ${week} check-in`}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = checkinSchema.safeParse({
          week,
          toeTouch,
          legRaiseLeft,
          legRaiseRight,
          tightness: Number(tightness),
          socks,
          pickUp,
          pain,
          notes: notes.trim() || null,
        });
        if (!parsed.success) {
          setError('Some answers need another look.');
          return;
        }
        setError(null);
        start(async () => {
          try {
            const message = await onSave(parsed.data);
            if (message) setError(message);
            else if (successMessage !== null) {
              show(
                successMessage ?? (week === 0 ? 'Baseline saved.' : `Week ${week} check-in saved.`),
                'success',
              );
            }
          } catch {
            show('Could not save the check-in. Nothing was changed.', 'warn');
          }
        });
      }}
    >
      <p className="text-body-sm text-ink-muted">
        Go only as far as is pain-free. This is for you to compare week to week; nothing here is
        scored. If you take photos to compare, they stay on your phone — ARETE does not store or
        analyse them.
      </p>

      <Select
        label="Standing forward fold: how far do your hands reach?"
        hint="Knees straight but not locked."
        value={toeTouch}
        options={TOE_TOUCH_LEVELS}
        labels={TOE_TOUCH_LABEL}
        onChange={setToeTouch}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Lying leg raise, left"
          hint="Straight leg, raised as far as is pain-free."
          value={legRaiseLeft}
          options={LEG_RAISE_LEVELS}
          labels={LEG_RAISE_LABEL}
          onChange={setLeft}
        />
        <Select
          label="Lying leg raise, right"
          hint="Same, other side."
          value={legRaiseRight}
          options={LEG_RAISE_LEVELS}
          labels={LEG_RAISE_LABEL}
          onChange={setRight}
        />
      </div>

      <FormField
        label="How tight do the backs of your thighs feel? (0–10)"
        hint="0 is loose, 10 is very tight."
      >
        {({ id, describedBy }) => (
          <select
            id={id}
            aria-describedby={describedBy}
            value={tightness}
            onChange={(event) => setTightness(event.target.value)}
            className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-2 text-body text-ink"
          >
            {Array.from({ length: 11 }, (_, value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <SegmentedControl
        legend="Putting on socks, standing"
        value={socks}
        onChange={setSocks}
        options={ease}
      />
      <SegmentedControl
        legend="Picking something up from the floor"
        value={pickUp}
        onChange={setPickUp}
        options={ease}
      />
      <ChoiceList
        legend="Any pain this week?"
        value={pain}
        onChange={setPain}
        choices={PAIN_LEVELS.map((value) => ({ value, label: PAIN_LABEL[value] }))}
      />
      {pain === 'more' ? (
        <p role="alert" className="text-body-sm text-warn">
          More than mild pain is worth having looked at by a physiotherapist or doctor before
          carrying on.
        </p>
      ) : null}

      <FormField label="Anything else?" hint="Optional.">
        {({ id, describedBy }) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        )}
      </FormField>

      {error ? (
        <p role="alert" className="text-body-sm text-warn">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel ?? 'Save the check-in'}
        </Button>
        {onSkip ? (
          <Button type="button" variant="quiet" onClick={onSkip}>
            Later
          </Button>
        ) : null}
      </div>
    </form>
  );
}
