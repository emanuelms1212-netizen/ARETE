'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  ChoiceList,
  FormField,
  SafetyNotice,
  Section,
  SegmentedControl,
  Switch,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  ACTIVITY_LABEL,
  ACTIVITY_LEVELS,
  NUTRITION_GOALS,
  NUTRITION_GOAL_LABEL,
  deficitWarnings,
  feetInchesToCentimetres,
  formatMass,
  massToStorage,
  toFluidOunces,
  toInches,
  toMillilitres,
  toPounds,
  type NutritionGoal,
  type NutritionSettings,
  type Safeguards,
  type SexForCalculation,
  type TargetOverride,
  type Targets,
  type WeightPoint,
} from '@/domain';
import { NUTRIENT_SHORT, formatRange, optionalNumber, water, type Visibility } from './format';
import type { FoodActions } from './types';

const SOURCE_WORDS: Record<Targets['source'], string> = {
  calculated: 'Calculated from your settings',
  override: 'Set by you',
  clinician: 'From your clinician',
  none: 'No targets',
};

function TargetsSummary({
  targets,
  visibility,
  settings,
}: {
  targets: Targets;
  visibility: Visibility;
  settings: NutritionSettings;
}) {
  const rows = (
    [
      ['kcal', targets.kcal, 'band'],
      ['proteinG', targets.proteinG, 'band'],
      ['carbsG', targets.carbsG, 'band'],
      ['fatG', targets.fatG, 'band'],
      ['fiberG', targets.fiberG, 'floor'],
    ] as const
  ).filter(([key, range]) => range !== null && (key !== 'kcal' || visibility.calories));

  return (
    <Section
      title="Targets"
      hint={`${SOURCE_WORDS[targets.source]}. Ranges, not budgets: a day outside one is information, not a failure.`}
    >
      {!visibility.numbers ? (
        <p className="text-body-sm text-ink-muted">Numbers are hidden, as you chose.</p>
      ) : rows.length === 0 && !targets.waterMl ? (
        <p className="text-body-sm text-ink-muted">None yet. Logging works without them.</p>
      ) : (
        <dl className="space-y-1" data-testid="targets">
          {rows.map(([key, range, kind]) => (
            <div key={key} className="flex justify-between gap-3 text-body">
              <dt className="text-ink-muted">{NUTRIENT_SHORT[key].label}</dt>
              <dd className="text-ink">{formatRange(range!, NUTRIENT_SHORT[key].unit, kind)}</dd>
            </div>
          ))}
          {targets.waterMl ? (
            <div className="flex justify-between gap-3 text-body">
              <dt className="text-ink-muted">Water</dt>
              <dd className="text-ink">
                {water(targets.waterMl.min, settings.unitSystem)}–
                {water(targets.waterMl.max, settings.unitSystem)}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
      {targets.working.length > 0 && visibility.numbers ? (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer content-center text-body-sm font-medium text-accent">
            How this was worked out
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-body-sm text-ink-muted">
            {targets.working
              .filter((line) => visibility.calories || !/kcal|energy/i.test(line))
              .map((line) => (
                <li key={line}>{line}</li>
              ))}
          </ol>
          <p className="mt-2 text-body-sm text-ink-muted">
            Estimates for an average adult. Bodies differ; a clinician or dietitian can tailor them.
          </p>
        </details>
      ) : null}
    </Section>
  );
}

function SettingsForm({
  settings,
  safeguards,
  latestWeight,
  actions,
}: {
  settings: NutritionSettings;
  safeguards: Safeguards;
  latestWeight: WeightPoint | null;
  actions: Pick<FoodActions, 'saveSettings' | 'logWeight'>;
}) {
  const us = settings.unitSystem === 'us';
  const [draft, setDraft] = useState(settings);
  const [birthYear, setBirthYear] = useState(
    settings.birthYear === null ? '' : String(settings.birthYear),
  );
  const [heightCm, setHeightCm] = useState(
    settings.heightCm === null ? '' : String(settings.heightCm),
  );
  const totalInches = settings.heightCm === null ? null : Math.round(toInches(settings.heightCm));
  const [feet, setFeet] = useState(
    totalInches === null ? '' : String(Math.floor(totalInches / 12)),
  );
  const [inches, setInches] = useState(totalInches === null ? '' : String(totalInches % 12));
  const [weight, setWeight] = useState(
    latestWeight ? String(formatMass(latestWeight.weightKg, settings.unitSystem).value) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  const goals = NUTRITION_GOALS.filter(
    (goal) => goal !== 'lose_gently' || safeguards.deficitAllowed,
  );

  function submit() {
    const year = optionalNumber(birthYear);
    let height: number | null | 'invalid';
    if (us) {
      const f = optionalNumber(feet);
      const i = optionalNumber(inches);
      height =
        f === 'invalid' || i === 'invalid'
          ? 'invalid'
          : f === null && i === null
            ? null
            : Math.round(feetInchesToCentimetres(f ?? 0, i ?? 0));
    } else {
      height = optionalNumber(heightCm);
    }
    const kg = optionalNumber(weight);
    if (year === 'invalid' || height === 'invalid' || kg === 'invalid') {
      setError('Check the numbers: each must be a number, or blank.');
      return;
    }
    if (height !== null && (height < 100 || height > 250)) {
      setError('That height does not look right.');
      return;
    }
    setError(null);
    start(async () => {
      const result = await actions.saveSettings({
        ...draft,
        birthYear: year === null ? null : Math.round(year),
        heightCm: height,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const storedKg = kg === null ? null : massToStorage(kg, settings.unitSystem);
      if (
        storedKg !== null &&
        (latestWeight === null || Math.abs(storedKg - latestWeight.weightKg) >= 0.05)
      ) {
        const logged = await actions.logWeight(storedKg);
        if (!logged.ok) {
          setError(logged.message);
          return;
        }
      }
      show('Settings saved.', 'success');
    });
  }

  return (
    <Section
      title="Settings"
      hint="Everything here is optional. Leave a field blank and nothing is guessed from it."
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <SegmentedControl<'metric' | 'us'>
          legend="Units"
          value={draft.unitSystem}
          onChange={(unitSystem) => setDraft({ ...draft, unitSystem })}
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'us', label: 'US' },
          ]}
        />
        {draft.unitSystem !== settings.unitSystem ? (
          <p className="text-body-sm text-ink-muted">
            Save to switch; the fields below then use the new units.
          </p>
        ) : null}

        <div className="space-y-2">
          <Switch
            label="Hide calorie numbers"
            hint="Protein, fibre and water still show."
            checked={draft.hideCalorieNumbers}
            onChange={(hideCalorieNumbers) => setDraft({ ...draft, hideCalorieNumbers })}
          />
          <Switch
            label="Hide all numbers"
            hint="Log meals and water as words and counts only."
            checked={draft.hideAllNumbers}
            onChange={(hideAllNumbers) => setDraft({ ...draft, hideAllNumbers })}
          />
          <Switch
            label="Counting or weighing has not helped me"
            hint="Hides numbers to start with, turns off weight trends and weight-loss targets."
            checked={draft.eatingDisorderCaution}
            onChange={(eatingDisorderCaution) => setDraft({ ...draft, eatingDisorderCaution })}
          />
          <Switch
            label="I follow a diet prescribed by a clinician"
            hint="ARETE then calculates nothing; you enter their targets."
            checked={draft.prescribedDiet}
            onChange={(prescribedDiet) => setDraft({ ...draft, prescribedDiet })}
          />
          {safeguards.weightTrendOffered ? (
            <Switch
              label="Show a weight trend"
              hint="A 7-day average, never a single day’s number. Off by default."
              checked={draft.weightTrendEnabled}
              onChange={(weightTrendEnabled) => setDraft({ ...draft, weightTrendEnabled })}
            />
          ) : null}
        </div>

        {safeguards.calculateEnergy ? (
          <>
            <ChoiceList<NutritionGoal>
              legend="What the energy range is for"
              value={goals.includes(draft.goal) ? draft.goal : 'maintain'}
              onChange={(goal) => setDraft({ ...draft, goal })}
              choices={goals.map((goal) => ({ value: goal, label: NUTRITION_GOAL_LABEL[goal] }))}
            />
            {!safeguards.deficitAllowed ? (
              <p className="text-body-sm text-ink-muted">
                A weight-loss range is not offered, for the reason above.
              </p>
            ) : null}
            <ChoiceList
              legend="Activity, most weeks"
              value={draft.activity}
              onChange={(activity) => setDraft({ ...draft, activity })}
              choices={ACTIVITY_LEVELS.map((value) => ({ value, label: ACTIVITY_LABEL[value] }))}
            />
            <SegmentedControl<SexForCalculation>
              legend="Equation to use"
              value={draft.sex}
              onChange={(sex) => setDraft({ ...draft, sex })}
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'unspecified', label: 'Midpoint' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Birth year">
                {({ id }) => (
                  <TextInput
                    id={id}
                    inputMode="numeric"
                    value={birthYear}
                    onChange={(event) => setBirthYear(event.target.value)}
                  />
                )}
              </FormField>
              {settings.unitSystem === 'us' ? (
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Height (ft)">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        inputMode="numeric"
                        value={feet}
                        onChange={(event) => setFeet(event.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="(in)">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        inputMode="numeric"
                        value={inches}
                        onChange={(event) => setInches(event.target.value)}
                      />
                    )}
                  </FormField>
                </div>
              ) : (
                <FormField label="Height (cm)">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      inputMode="decimal"
                      value={heightCm}
                      onChange={(event) => setHeightCm(event.target.value)}
                    />
                  )}
                </FormField>
              )}
            </div>
          </>
        ) : null}
        <FormField
          label={`Weight (${settings.unitSystem === 'us' ? 'lb' : 'kg'})`}
          hint={`Used for protein and water ranges. Saving a new number records today’s weigh-in.${
            latestWeight ? ` Last recorded ${latestWeight.localDate}.` : ''
          }`}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          )}
        </FormField>
        {error ? (
          <p role="alert" className="text-body-sm text-warn">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={pending}>
          Save settings
        </Button>
      </form>
    </Section>
  );
}

const OVERRIDE_FIELDS = [
  ['kcal', 'Energy (kcal)'],
  ['proteinG', 'Protein (g)'],
  ['carbsG', 'Carbohydrate (g)'],
  ['fatG', 'Fat (g)'],
  ['fiberG', 'Fibre (g, at least)'],
  ['waterMl', 'Water (ml)'],
] as const;

type OverrideKey = (typeof OVERRIDE_FIELDS)[number][0];

function OverrideForm({
  override,
  estimate,
  visibility,
  unitSystem,
  actions,
}: {
  unitSystem: NutritionSettings['unitSystem'];
  override: TargetOverride | null;
  estimate: { restingKcal: number | null; needsKcal: number | null };
  visibility: Visibility;
  actions: Pick<FoodActions, 'saveOverride'>;
}) {
  const [values, setValues] = useState<Record<OverrideKey, string>>(
    () =>
      Object.fromEntries(
        OVERRIDE_FIELDS.map(([key]) => {
          const value = override?.[key] ?? null;
          if (value === null) return [key, ''];
          // Water is stored in millilitres and typed in the person's units.
          if (key === 'waterMl' && unitSystem === 'us')
            return [key, String(Math.round(toFluidOunces(value)))];
          return [key, String(value)];
        }),
      ) as Record<OverrideKey, string>,
  );
  const [fromClinician, setFromClinician] = useState(override?.fromClinician ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();
  const fields = OVERRIDE_FIELDS.filter(([key]) => key !== 'kcal' || visibility.calories).map(
    ([key, label]) =>
      [key, key === 'waterMl' && unitSystem === 'us' ? 'Water (fl oz)' : label] as const,
  );
  const kcal = optionalNumber(values.kcal);
  const warnings =
    typeof kcal === 'number' && kcal > 0 && !fromClinician ? deficitWarnings(kcal, estimate) : [];

  if (!visibility.numbers) return null;

  return (
    <Section
      title="Your own targets"
      hint="Overrides the calculation. Leave a field blank to have no target for it."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Object.fromEntries(
            OVERRIDE_FIELDS.map(([key]) => [key, optionalNumber(values[key])]),
          ) as Record<OverrideKey, number | null | 'invalid'>;
          if (Object.values(parsed).includes('invalid')) {
            setError('Each target must be a number, or blank.');
            return;
          }
          if (Object.values(parsed).every((value) => value === null)) {
            setError('Enter at least one target, or use the calculated ones.');
            return;
          }
          setError(null);
          start(async () => {
            const waterTyped = parsed.waterMl as number | null;
            const result = await actions.saveOverride({
              ...(parsed as Record<OverrideKey, number | null>),
              waterMl:
                waterTyped === null
                  ? null
                  : Math.round(unitSystem === 'us' ? toMillilitres(waterTyped) : waterTyped),
              // Hidden calories keep what was set rather than being cleared unseen.
              kcal: visibility.calories ? (parsed.kcal as number | null) : (override?.kcal ?? null),
              fromClinician,
            });
            if (!result.ok) setError(result.message);
            else show('Your targets are saved.', 'success');
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([key, label]) => (
            <FormField key={key} label={label}>
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={values[key]}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                />
              )}
            </FormField>
          ))}
        </div>
        <Switch
          label="These are from my clinician"
          hint="Marked as theirs, and no deficit warnings are shown on them."
          checked={fromClinician}
          onChange={setFromClinician}
        />
        {warnings.length > 0 ? (
          <SafetyNotice title="About this energy target">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>It is your choice; ARETE will use it if you save it.</p>
          </SafetyNotice>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-sm text-warn">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            Save my targets
          </Button>
          {override ? (
            <Button
              variant="quiet"
              onClick={() =>
                start(async () => {
                  const result = await actions.saveOverride(null);
                  if (!result.ok) setError(result.message);
                  else show('Back to calculated targets.', 'success');
                })
              }
            >
              Clear my targets
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function trendWords(perWeekKg: number, system: NutritionSettings['unitSystem']): string {
  const size = Math.abs(perWeekKg);
  if (size < 0.1) return 'about level';
  const amount = system === 'us' ? `${toPounds(size).toFixed(1)} lb` : `${size.toFixed(1)} kg`;
  return `${perWeekKg < 0 ? 'down' : 'up'} about ${amount} a week`;
}

function WeightTrend({
  weights,
  averages,
  trend,
  settings,
  actions,
}: {
  weights: readonly WeightPoint[];
  averages: readonly { localDate: string; averageKg: number }[];
  trend: { perWeekKg: number; days: number; words: string } | null;
  settings: NutritionSettings;
  actions: Pick<FoodActions, 'deleteWeight'>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mass = (kg: number) => formatMass(kg, settings.unitSystem).text;
  const recent = [...averages].reverse().slice(0, 10);
  return (
    <Section
      title="Weight trend"
      hint="A 7-day average. Daily weight moves with water, salt and sleep, so single days are not shown as the headline."
    >
      {trend ? (
        <p className="text-body text-ink" data-testid="weight-trend">
          Over {trend.days} days, the average is {trendWords(trend.perWeekKg, settings.unitSystem)}.
        </p>
      ) : (
        <p className="text-body-sm text-ink-muted">
          A trend needs at least a week of weigh-ins. Add today’s under Settings.
        </p>
      )}
      {recent.length > 0 ? (
        <ul className="mt-3 space-y-1 text-body-sm">
          {recent.map((point) => {
            const raw = weights.find((weight) => weight.localDate === point.localDate);
            return (
              <li key={point.localDate} className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  {point.localDate}: average {mass(point.averageKg)}
                  {raw ? (
                    <span className="text-ink-muted"> (weighed {mass(raw.weightKg)})</span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete the weigh-in on ${point.localDate}`}
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const result = await actions.deleteWeight(point.localDate);
                      if (!result.ok) setError(result.message);
                    })
                  }
                >
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-body-sm text-warn">
          {error}
        </p>
      ) : null}
    </Section>
  );
}

export interface SettingsPanelProps {
  readonly settings: NutritionSettings;
  readonly override: TargetOverride | null;
  readonly safeguards: Safeguards;
  readonly targets: Targets;
  readonly estimate: { restingKcal: number | null; needsKcal: number | null };
  readonly visibility: Visibility & { weightTrend: boolean };
  readonly latestWeight: WeightPoint | null;
  readonly weights: readonly WeightPoint[];
  readonly averages: readonly { localDate: string; averageKg: number }[];
  readonly trend: { perWeekKg: number; days: number; words: string } | null;
  readonly actions: FoodActions;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { safeguards, visibility } = props;
  return (
    <div className="space-y-4">
      {safeguards.messages.map((message) => (
        <SafetyNotice key={message.title} title={message.title}>
          <p>{message.body}</p>
        </SafetyNotice>
      ))}
      <TargetsSummary targets={props.targets} visibility={visibility} settings={props.settings} />
      <SettingsForm
        key={JSON.stringify(props.settings) + (props.latestWeight?.weightKg ?? '')}
        settings={props.settings}
        safeguards={safeguards}
        latestWeight={props.latestWeight}
        actions={props.actions}
      />
      <OverrideForm
        key={JSON.stringify(props.override)}
        override={props.override}
        estimate={props.estimate}
        unitSystem={props.settings.unitSystem}
        visibility={visibility}
        actions={props.actions}
      />
      {visibility.weightTrend ? (
        <WeightTrend
          weights={props.weights}
          averages={props.averages}
          trend={props.trend}
          settings={props.settings}
          actions={props.actions}
        />
      ) : null}
    </div>
  );
}
