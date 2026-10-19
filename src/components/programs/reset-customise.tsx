'use client';

import { useState } from 'react';
import {
  Button,
  ChoiceList,
  FormField,
  SegmentedControl,
  Switch,
  TextInput,
} from '@/components/ui';
import {
  COLD_NOTICE,
  RESET_COMPONENTS,
  RESET_COMPONENT_LABEL,
  RESET_OPT_IN,
  RESET_PHASES,
  SOURCE_BLOCK_NOTES,
  isEnabled,
  programLength,
  resetTargets,
  type ResetComponent,
  type ResetCustomisation,
  type ResetEnvironment,
  type ResetPersonInputs,
} from '@/domain';

/** Components with a numeric range a person can replace with their own. */
const RANGED: readonly ResetComponent[] = [
  'hydration',
  'movement',
  'study',
  'reading',
  'meditation',
];

const UNIT: Partial<Record<ResetComponent, string>> = {
  hydration: 'L',
  movement: 'min',
  study: 'min',
  reading: 'pages',
  meditation: 'min',
};

/**
 * The whole programme, as it will run: every block, every component's range,
 * the source's own numbers beside them. A person sees all of it before
 * starting, and the same view stays available while it runs.
 */
export function ProgrammePreview({
  person,
  customisation,
}: {
  person: ResetPersonInputs;
  customisation: ResetCustomisation;
}) {
  const length = programLength(customisation);
  const phases = RESET_PHASES.filter((phase) => phase.from <= length);
  return (
    <div className="space-y-3" data-testid="programme-preview">
      <p className="text-body-sm text-ink-muted">
        {length} days in {phases.length} blocks. Ranges are the same within a block, so this is the
        whole programme. A weekly reflection falls on every seventh day.
      </p>
      {phases.map((phase) => {
        const targets = resetTargets(
          phase.from,
          { ...person, environment: customisation.environment },
          customisation,
        );
        return (
          <section
            key={phase.name}
            aria-labelledby={`phase-${phase.index}`}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <h3 id={`phase-${phase.index}`} className="text-body font-semibold text-ink">
              {phase.name}{' '}
              <span className="font-normal text-ink-muted">
                · days {phase.from}–{Math.min(phase.to, length)}
              </span>
            </h3>
            <p className="text-body-sm text-ink-muted">{phase.purpose}</p>
            <dl className="mt-2 space-y-1">
              {targets
                .filter((target) => target.component !== 'weekly')
                .map((target) => (
                  <div key={target.component} className="flex justify-between gap-3 text-body-sm">
                    <dt className="text-ink-muted">{target.label}</dt>
                    <dd className="text-right text-ink">{target.text || 'Yes'}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-2 text-label text-ink-muted">{SOURCE_BLOCK_NOTES[phase.index]}</p>
          </section>
        );
      })}
    </div>
  );
}

export interface CustomiseFormProps {
  readonly initial: ResetCustomisation;
  readonly person: ResetPersonInputs;
  readonly coldAcknowledged: boolean;
  readonly submitLabel: string;
  readonly pending: boolean;
  /** Before the start only: the dates on offer. */
  readonly startDates?: readonly { value: string; label: string }[];
  readonly lockExtension?: boolean;
  readonly onAcknowledgeCold: () => Promise<boolean>;
  readonly onSubmit: (customisation: ResetCustomisation, startedOn: string | null) => void;
}

export function CustomiseForm(props: CustomiseFormProps) {
  const { initial, person } = props;
  const [draft, setDraft] = useState<ResetCustomisation>(initial);
  const [ranges, setRanges] = useState<Record<string, { min: string; max: string }>>(() =>
    Object.fromEntries(
      Object.entries(initial.ranges).map(([key, range]) => [
        key,
        { min: String(range!.min), max: String(range!.max) },
      ]),
    ),
  );
  const [startedOn, setStartedOn] = useState(props.startDates?.[0]?.value ?? '');
  const [coldRead, setColdRead] = useState(props.coldAcknowledged);
  const [error, setError] = useState<string | null>(null);

  const enabled = (component: ResetComponent) => isEnabled(component, draft);
  const toggle = (component: ResetComponent, on: boolean) =>
    setDraft({ ...draft, enabled: { ...draft.enabled, [component]: on } });

  // The live preview uses what is typed, when it parses.
  const parsedRanges: ResetCustomisation['ranges'] = {};
  for (const [key, value] of Object.entries(ranges)) {
    const min = Number(value.min);
    const max = Number(value.max);
    if (
      value.min !== '' &&
      value.max !== '' &&
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      max >= min &&
      min >= 0
    )
      parsedRanges[key as ResetComponent] = { min, max };
  }
  const preview: ResetCustomisation = { ...draft, ranges: parsedRanges };

  function submit() {
    for (const [key, value] of Object.entries(ranges)) {
      if (value.min === '' && value.max === '') continue;
      if (!parsedRanges[key as ResetComponent]) {
        setError(
          `${RESET_COMPONENT_LABEL[key as ResetComponent]}: enter a lower and an upper number, lower first.`,
        );
        return;
      }
    }
    if (enabled('cold') && !coldRead) {
      setError('Read the cold-water note before turning that on.');
      return;
    }
    setError(null);
    props.onSubmit(preview, props.startDates ? startedOn : null);
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-body-sm font-medium text-ink">
          What the programme includes
        </legend>
        {RESET_COMPONENTS.filter((component) => component !== 'weekly' && component !== 'wake').map(
          (component) => (
            <Switch
              key={component}
              label={RESET_COMPONENT_LABEL[component]}
              {...(RESET_OPT_IN.includes(component) ? { hint: 'Off unless you choose it.' } : {})}
              checked={enabled(component)}
              onChange={(on) => toggle(component, on)}
            />
          ),
        )}
      </fieldset>

      {enabled('cold') ? (
        <div className="rounded-md border border-line p-3 text-body-sm">
          <p className="font-medium text-ink">Before a cold finish</p>
          <p className="mt-1 text-ink-muted">{COLD_NOTICE}</p>
          {coldRead ? (
            <p className="mt-2 text-ink">Read and acknowledged.</p>
          ) : (
            <Button
              className="mt-2"
              size="sm"
              variant="quiet"
              onClick={async () => setColdRead(await props.onAcknowledgeCold())}
            >
              I have read this
            </Button>
          )}
        </div>
      ) : null}

      {enabled('screen') ? (
        <FormField
          label="Social media cap (minutes a day)"
          hint="Your number. Never zero by default."
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              inputMode="numeric"
              value={String(draft.screenCapMinutes)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  screenCapMinutes: Math.max(5, Math.min(240, Number(event.target.value) || 5)),
                })
              }
            />
          )}
        </FormField>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Wake time (optional)" hint="A window around it, not an alarm.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="time"
              value={draft.wakeTime ?? ''}
              onChange={(event) => setDraft({ ...draft, wakeTime: event.target.value || null })}
            />
          )}
        </FormField>
        <FormField label="Bedtime (optional)">
          {({ id }) => (
            <TextInput
              id={id}
              type="time"
              value={draft.bedTime ?? ''}
              onChange={(event) => setDraft({ ...draft, bedTime: event.target.value || null })}
            />
          )}
        </FormField>
      </div>

      <SegmentedControl<ResetEnvironment>
        legend="Climate you are in"
        value={draft.environment}
        onChange={(environment) => setDraft({ ...draft, environment })}
        options={[
          { value: 'temperate', label: 'Mild' },
          { value: 'hot', label: 'Hot' },
          { value: 'cold', label: 'Cold' },
        ]}
      />

      <ChoiceList<string>
        legend="How hard to start"
        value={String(draft.intensity)}
        onChange={(value) => setDraft({ ...draft, intensity: Number(value) })}
        choices={[
          { value: '-2', label: 'Much gentler' },
          { value: '-1', label: 'Gentler' },
          { value: '0', label: 'As suggested' },
          { value: '1', label: 'A little more' },
          { value: '2', label: 'More' },
        ]}
      />

      <details
        className="rounded-md border border-line p-3"
        open={Object.keys(initial.ranges).length > 0}
      >
        <summary className="min-h-11 cursor-pointer content-center text-body-sm font-medium text-ink">
          Your own ranges (optional)
        </summary>
        <p className="text-body-sm text-ink-muted">
          Replaces the suggestion for every day. Leave blank to keep the suggestion.
        </p>
        <div className="mt-2 space-y-2">
          {RANGED.filter(enabled).map((component) => (
            <div key={component} className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
              <span className="pb-3 text-body-sm text-ink">
                {RESET_COMPONENT_LABEL[component]} ({UNIT[component]})
              </span>
              <FormField label="From">
                {({ id }) => (
                  <TextInput
                    id={id}
                    aria-label={`${RESET_COMPONENT_LABEL[component]} from`}
                    inputMode="decimal"
                    value={ranges[component]?.min ?? ''}
                    onChange={(event) =>
                      setRanges({
                        ...ranges,
                        [component]: { min: event.target.value, max: ranges[component]?.max ?? '' },
                      })
                    }
                  />
                )}
              </FormField>
              <FormField label="To">
                {({ id }) => (
                  <TextInput
                    id={id}
                    aria-label={`${RESET_COMPONENT_LABEL[component]} to`}
                    inputMode="decimal"
                    value={ranges[component]?.max ?? ''}
                    onChange={(event) =>
                      setRanges({
                        ...ranges,
                        [component]: { min: ranges[component]?.min ?? '', max: event.target.value },
                      })
                    }
                  />
                )}
              </FormField>
            </div>
          ))}
        </div>
      </details>

      <Switch
        label="Add the extension week (days 61–66)"
        hint="The source runs 66 days under a 60-day title. The last six are optional; you can also add them at the finish."
        checked={draft.includeExtension}
        onChange={(includeExtension) => {
          if (props.lockExtension && !includeExtension) return;
          setDraft({ ...draft, includeExtension });
        }}
      />

      {props.startDates ? (
        <FormField label="Start on">
          {({ id }) => (
            <select
              id={id}
              value={startedOn}
              onChange={(event) => setStartedOn(event.target.value)}
              className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink"
            >
              {props.startDates!.map((date) => (
                <option key={date.value} value={date.value}>
                  {date.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
      ) : null}

      <details className="rounded-md border border-line p-3" open={Boolean(props.startDates)}>
        <summary className="min-h-11 cursor-pointer content-center text-body font-medium text-ink">
          The whole programme, with these settings
        </summary>
        <div className="mt-3">
          <ProgrammePreview person={person} customisation={preview} />
        </div>
      </details>

      {error ? (
        <p role="alert" className="text-body-sm text-warn">
          {error}
        </p>
      ) : null}
      <Button onClick={submit} loading={props.pending}>
        {props.submitLabel}
      </Button>
    </div>
  );
}
