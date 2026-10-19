'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  FormField,
  Section,
  SegmentedControl,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  FOOD_SOURCE_LABEL,
  MEAL_LABEL,
  MEAL_SLOTS,
  addDays,
  type DayTotals,
  type Food,
  type FoodEntry,
  type MealSlot,
  type Nutrient,
  type Targets,
  type UnitSystem,
} from '@/domain';
import type { WaterLog } from '@/persistence/repository';
import { AddEntryDialog } from './add-entry-dialog';
import {
  NUTRIENT_SHORT,
  dayName,
  formatAmount,
  formatRange,
  nutrientSummary,
  optionalNumber,
  shortDay,
  statusWords,
  visibleNutrients,
  water,
  type Visibility,
} from './format';
import { newAttempt, type FoodActions } from './types';

export type FoodTab = 'day' | 'week' | 'foods' | 'settings';

const TABS: { value: FoodTab; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'foods', label: 'Foods' },
  { value: 'settings', label: 'Targets & settings' },
];

/** The views are links, so each has a URL, works with Back, and survives a reload. */
export function FoodTabs({
  current,
  date,
  today,
}: {
  current: FoodTab;
  date: string;
  today: string;
}) {
  const dateParam = date === today ? '' : `&date=${date}`;
  return (
    <nav aria-label="Food views" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 px-1">
        {TABS.map((tab) => (
          <li key={tab.value}>
            <Link
              href={`/train/food?tab=${tab.value}${tab.value === 'day' || tab.value === 'week' ? dateParam : ''}`}
              aria-current={tab.value === current ? 'page' : undefined}
              className={`flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-body-sm ${
                tab.value === current
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const TARGET_KIND: Partial<Record<Nutrient, 'band' | 'floor'>> = { fiberG: 'floor' };

function Totals({
  totals,
  targets,
  visibility,
  unitSystem,
}: {
  totals: DayTotals;
  targets: Targets;
  visibility: Visibility;
  unitSystem: UnitSystem;
}) {
  const keys = visibleNutrients(visibility);
  return (
    <Section
      title="So far"
      hint={
        totals.withoutNumbers > 0 && visibility.numbers
          ? `${totals.withoutNumbers} ${totals.withoutNumbers === 1 ? 'entry has' : 'entries have'} no numbers. That is fine; totals count what is known.`
          : undefined
      }
    >
      {keys.length === 0 ? (
        <p className="text-body text-ink">
          {totals.entries === 0
            ? 'Nothing logged yet. Numbers are hidden, as you chose.'
            : `${totals.entries} ${totals.entries === 1 ? 'thing' : 'things'} logged. Numbers are hidden, as you chose.`}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {keys.map((key) => {
            const value = totals.nutrients[key];
            const range = targets[key];
            const kind = TARGET_KIND[key] ?? 'band';
            return (
              <div key={key} className="min-w-0" data-testid={`total-${key}`}>
                <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">
                  {NUTRIENT_SHORT[key].label}
                </dt>
                <dd className="font-display text-display-3 font-semibold text-ink">
                  {formatAmount(value ?? 0, NUTRIENT_SHORT[key].unit)}
                </dd>
                {range ? (
                  <dd className="text-body-sm text-ink-muted">
                    Range {formatRange(range, NUTRIENT_SHORT[key].unit, kind)} ·{' '}
                    {statusWords(value ?? 0, range, kind)}
                  </dd>
                ) : null}
              </div>
            );
          })}
          <div className="min-w-0" data-testid="total-water">
            <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">Water</dt>
            <dd className="font-display text-display-3 font-semibold text-ink">
              {water(totals.waterMl, unitSystem)}
            </dd>
            {targets.waterMl ? (
              <dd className="text-body-sm text-ink-muted">
                Range {water(targets.waterMl.min, unitSystem)}–
                {water(targets.waterMl.max, unitSystem)}
              </dd>
            ) : null}
          </div>
        </dl>
      )}
    </Section>
  );
}

function EditEntryDialog({
  entry,
  visibility,
  onClose,
  actions,
}: {
  entry: FoodEntry;
  visibility: Visibility;
  onClose: () => void;
  actions: Pick<FoodActions, 'updateEntry' | 'deleteEntry'>;
}) {
  const isQuick = entry.source === 'quick-add';
  const [servings, setServings] = useState(String(entry.servings ?? 1));
  const [slot, setSlot] = useState<MealSlot>(entry.slot);
  const [description, setDescription] = useState(entry.description);
  const [values, setValues] = useState<Record<Nutrient, string>>(
    () =>
      Object.fromEntries(
        (['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG'] as Nutrient[]).map((key) => [
          key,
          entry.nutrients[key] === null ? '' : String(entry.nutrients[key]),
        ]),
      ) as Record<Nutrient, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { show } = useToast();

  function save() {
    const patch: Parameters<FoodActions['updateEntry']>[0] = { entryId: entry.id };
    if (slot !== entry.slot) patch.slot = slot;
    if (isQuick) {
      const parsed = Object.fromEntries(
        (Object.keys(values) as Nutrient[]).map((key) => [key, optionalNumber(values[key])]),
      ) as Record<Nutrient, number | null | 'invalid'>;
      if (Object.values(parsed).includes('invalid') || description.trim() === '') {
        setError('Say what it was; numbers must be zero or more, or blank.');
        return;
      }
      // Hidden numbers are kept as they were rather than wiped by a hidden field.
      const nutrients: Record<Nutrient, number | null> = { ...entry.nutrients };
      for (const key of visibleNutrients(visibility)) nutrients[key] = parsed[key] as number | null;
      patch.quickAdd = { description: description.trim(), nutrients };
    } else {
      const amount = Number(servings);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 50) {
        setError('Servings must be more than 0 and at most 50.');
        return;
      }
      if (amount !== entry.servings) patch.servings = amount;
    }
    setError(null);
    start(async () => {
      const result = await actions.updateEntry(patch);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      show('Entry updated.', 'success');
      onClose();
    });
  }

  return (
    <>
      <Dialog
        open={!confirming}
        // Handing over to the confirmation closes this dialog natively; that
        // close is not the person dismissing the edit.
        onClose={() => {
          if (!confirming) onClose();
        }}
        title={`Edit ${entry.description}`}
        description={
          <span className="text-body-sm">
            {entry.source === 'quick-add' ? 'Quick add' : FOOD_SOURCE_LABEL[entry.source]}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
            <Button onClick={save} loading={pending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {isQuick ? (
            <>
              <FormField label="What was it?">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={description}
                    maxLength={120}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </FormField>
              {visibleNutrients(visibility).length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {visibleNutrients(visibility).map((key) => (
                    <FormField
                      key={key}
                      label={`${NUTRIENT_SHORT[key].label} (${NUTRIENT_SHORT[key].unit})`}
                    >
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
              ) : null}
            </>
          ) : (
            <FormField label="Servings">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={servings}
                  onChange={(event) => setServings(event.target.value)}
                />
              )}
            </FormField>
          )}
          <SegmentedControl<MealSlot>
            legend="Meal"
            value={slot}
            onChange={setSlot}
            options={MEAL_SLOTS.map((value) => ({ value, label: MEAL_LABEL[value] }))}
          />
          {error ? (
            <p role="alert" className="text-body-sm text-warn">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title="Delete this entry?"
        description={`${entry.description} comes off ${MEAL_LABEL[entry.slot].toLowerCase()}, and the totals change with it.`}
        confirmLabel="Delete entry"
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const result = await actions.deleteEntry(entry.id);
            if (!result.ok) {
              setConfirming(false);
              setError(result.message);
              return;
            }
            show('Entry deleted.', 'success');
            onClose();
          })
        }
      />
    </>
  );
}

function Meal({
  slot,
  entries,
  canCopy,
  date,
  visibility,
  onAdd,
  onEdit,
  copyMeal,
}: {
  slot: MealSlot;
  entries: readonly FoodEntry[];
  canCopy: boolean;
  date: string;
  visibility: Visibility;
  onAdd: () => void;
  onEdit: (entry: FoodEntry) => void;
  copyMeal: FoodActions['copyMeal'];
}) {
  const [attempt, setAttempt] = useState(newAttempt);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  return (
    <section
      aria-labelledby={`meal-${slot}`}
      className="rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`meal-${slot}`} className="text-body font-semibold text-ink">
          {MEAL_LABEL[slot]}
        </h2>
        <Button size="sm" variant="quiet" onClick={onAdd}>
          Add to {MEAL_LABEL[slot].toLowerCase()}
        </Button>
      </div>
      {entries.length === 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-body-sm text-ink-muted">Nothing here.</p>
          {canCopy ? (
            <Button
              size="sm"
              variant="ghost"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const result = await copyMeal({ toDate: date, slot, attemptToken: attempt });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setAttempt(newAttempt());
                  show(`Copied ${result.value.length} from the day before.`, 'success');
                })
              }
            >
              Copy the day before’s {MEAL_LABEL[slot].toLowerCase()}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {entries.map((entry) => {
            const summary = nutrientSummary(entry.nutrients, visibility);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  aria-label={`Edit ${entry.description}`}
                  className="flex min-h-11 w-full items-start justify-between gap-3 py-2 text-left hover:bg-sunken"
                >
                  <span className="min-w-0">
                    <span className="block text-body text-ink">
                      {entry.description}
                      {entry.servings !== null && entry.servings !== 1 ? (
                        <span className="text-ink-muted"> × {entry.servings}</span>
                      ) : null}
                    </span>
                    {summary ? (
                      <span className="block text-body-sm text-ink-muted">{summary}</span>
                    ) : null}
                    <span className="block text-label text-ink-muted">
                      {entry.source === 'quick-add' ? 'Quick add' : FOOD_SOURCE_LABEL[entry.source]}
                    </span>
                  </span>
                  <span className="shrink-0 text-body-sm text-accent">Edit</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-body-sm text-warn">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Water({
  logs,
  date,
  unitSystem,
  actions,
}: {
  logs: readonly WaterLog[];
  date: string;
  unitSystem: UnitSystem;
  actions: Pick<FoodActions, 'addWater' | 'deleteWater'>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const { show } = useToast();
  // Glass sizes in the person's own units; stored as millilitres.
  const sizes =
    unitSystem === 'us'
      ? [
          { label: '+ 8 fl oz', ml: 237 },
          { label: '+ 16 fl oz', ml: 473 },
        ]
      : [
          { label: '+ 250 ml', ml: 250 },
          { label: '+ 500 ml', ml: 500 },
        ];

  function add(ml: number) {
    setError(null);
    start(async () => {
      const result = await actions.addWater({ localDate: date, ml, attemptToken: newAttempt() });
      if (!result.ok) setError(result.message);
      else show(`${water(ml, unitSystem)} of water logged.`, 'success');
    });
  }

  const total = logs.reduce((sum, log) => sum + log.ml, 0);
  return (
    <Section title="Water" hint={`${water(total, unitSystem)} so far. Other drinks count too.`}>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => (
          <Button
            key={size.ml}
            size="sm"
            variant="quiet"
            loading={pending}
            onClick={() => add(size.ml)}
          >
            {size.label}
          </Button>
        ))}
      </div>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(custom);
          if (!Number.isFinite(value) || value <= 0) {
            setError('Enter an amount above zero.');
            return;
          }
          add(Math.round(unitSystem === 'us' ? value * 29.5735 : value));
          setCustom('');
        }}
      >
        <div className="min-w-0 flex-1">
          <FormField label={`Other amount (${unitSystem === 'us' ? 'fl oz' : 'ml'})`}>
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" size="sm" variant="quiet">
          Log
        </Button>
      </form>
      {logs.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-2 text-body-sm">
              <span className="text-ink">{water(log.ml, unitSystem)}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${water(log.ml, unitSystem)} of water`}
                onClick={() =>
                  start(async () => {
                    const result = await actions.deleteWater(log.id);
                    if (!result.ok) setError(result.message);
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
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

export interface DayViewProps {
  readonly today: string;
  readonly date: string;
  readonly earliest: string;
  readonly entries: readonly FoodEntry[];
  readonly copyable: readonly MealSlot[];
  readonly water: readonly WaterLog[];
  readonly totals: DayTotals;
  readonly targets: Targets;
  readonly foods: readonly Food[];
  readonly visibility: Visibility;
  readonly unitSystem: UnitSystem;
  readonly actions: FoodActions;
}

export function DayView(props: DayViewProps) {
  const { today, date, earliest, entries, copyable, visibility, unitSystem, actions } = props;
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const previous = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {previous >= earliest ? (
          <Link
            href={`/train/food?tab=day&date=${previous}`}
            className="flex min-h-11 items-center px-2 text-body-sm text-accent"
          >
            ← Day before
          </Link>
        ) : (
          <span />
        )}
        <h2 className="text-body font-semibold text-ink" data-testid="food-date">
          {dayName(date, today)}
        </h2>
        {date < today ? (
          <Link
            href={next === today ? '/train/food?tab=day' : `/train/food?tab=day&date=${next}`}
            className="flex min-h-11 items-center px-2 text-body-sm text-accent"
          >
            Day after →
          </Link>
        ) : (
          <span />
        )}
      </div>
      <Totals
        totals={props.totals}
        targets={props.targets}
        visibility={visibility}
        unitSystem={unitSystem}
      />
      {MEAL_SLOTS.map((slot) => (
        <Meal
          key={slot}
          slot={slot}
          date={date}
          entries={entries.filter((entry) => entry.slot === slot)}
          canCopy={copyable.includes(slot)}
          visibility={visibility}
          onAdd={() => setAdding(slot)}
          onEdit={setEditing}
          copyMeal={actions.copyMeal}
        />
      ))}
      <Water logs={props.water} date={date} unitSystem={unitSystem} actions={actions} />
      {adding ? (
        <AddEntryDialog
          open
          slot={adding}
          localDate={date}
          foods={props.foods}
          visibility={visibility}
          unitSystem={unitSystem}
          onClose={() => setAdding(null)}
          addEntry={actions.addEntry}
        />
      ) : null}
      {editing ? (
        <EditEntryDialog
          key={editing.id}
          entry={editing}
          visibility={visibility}
          onClose={() => setEditing(null)}
          actions={actions}
        />
      ) : null}
    </div>
  );
}

export function WeekView({
  week,
  today,
  targets,
  visibility,
  unitSystem,
}: {
  week: readonly { localDate: string; totals: DayTotals }[];
  today: string;
  targets: Targets;
  visibility: Visibility;
  unitSystem: UnitSystem;
}) {
  const keys = visibleNutrients(visibility);
  const logged = week.filter((day) => day.totals.entries > 0);
  const average = (key: Nutrient) => {
    const known = logged
      .map((day) => day.totals.nutrients[key])
      .filter((value): value is number => value !== null);
    return known.length === 0 ? null : Math.round(known.reduce((a, b) => a + b, 0) / known.length);
  };

  return (
    <div className="space-y-4">
      <Section
        title="This week"
        hint={`${logged.length} of 7 days have something logged. Averages are over logged days only, so a day you did not log is not counted as a day you did not eat.`}
      >
        {keys.length > 0 && logged.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {keys.map((key) => {
              const value = average(key);
              const range = targets[key];
              return (
                <div key={key}>
                  <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">
                    Average {NUTRIENT_SHORT[key].label.toLowerCase()}
                  </dt>
                  <dd className="font-display text-display-3 font-semibold text-ink">
                    {formatAmount(value, NUTRIENT_SHORT[key].unit)}
                  </dd>
                  {range ? (
                    <dd className="text-body-sm text-ink-muted">
                      Range{' '}
                      {formatRange(range, NUTRIENT_SHORT[key].unit, TARGET_KIND[key] ?? 'band')}
                    </dd>
                  ) : null}
                </div>
              );
            })}
          </dl>
        ) : null}
      </Section>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-body-sm whitespace-nowrap">
          <caption className="sr-only">Each day this week</caption>
          <thead className="text-label text-ink-muted uppercase">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Day
              </th>
              <th scope="col" className="p-3 font-medium">
                Entries
              </th>
              {keys.map((key) => (
                <th key={key} scope="col" className="p-3 font-medium">
                  {NUTRIENT_SHORT[key].label}
                </th>
              ))}
              <th scope="col" className="p-3 font-medium">
                Water
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {week.map((day) => (
              <tr key={day.localDate}>
                <th scope="row" className="p-3 font-medium text-ink">
                  <Link
                    href={
                      day.localDate === today
                        ? '/train/food?tab=day'
                        : `/train/food?tab=day&date=${day.localDate}`
                    }
                    className="text-accent hover:underline"
                  >
                    {day.localDate === today ? 'Today' : shortDay(day.localDate)}
                  </Link>
                </th>
                <td className="p-3 text-ink">{day.totals.entries}</td>
                {keys.map((key) => (
                  <td key={key} className="p-3 text-ink">
                    {day.totals.entries === 0
                      ? '—'
                      : formatAmount(day.totals.nutrients[key], NUTRIENT_SHORT[key].unit)}
                  </td>
                ))}
                <td className="p-3 text-ink">
                  {day.totals.waterMl === 0 ? '—' : water(day.totals.waterMl, unitSystem)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
