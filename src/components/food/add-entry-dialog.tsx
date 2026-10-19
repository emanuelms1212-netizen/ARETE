'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
  Button,
  Dialog,
  EmptyState,
  FormField,
  SegmentedControl,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  FOOD_SOURCE_LABEL,
  MEAL_LABEL,
  scaleNutrients,
  type Food,
  type MealSlot,
  type Nutrient,
  type UnitSystem,
} from '@/domain';
import {
  NUTRIENT_SHORT,
  nutrientSummary,
  optionalNumber,
  servingWeight,
  visibleNutrients,
  type Visibility,
} from './format';
import { newAttempt, type FoodActions } from './types';

type Mode = 'favourites' | 'foods' | 'quick';

export interface AddEntryDialogProps {
  readonly open: boolean;
  readonly slot: MealSlot;
  readonly localDate: string;
  readonly foods: readonly Food[];
  readonly visibility: Visibility;
  readonly unitSystem: UnitSystem;
  readonly onClose: () => void;
  readonly addEntry: FoodActions['addEntry'];
}

/**
 * Adding to a meal: a favourite, one of the person's own foods, or a quick
 * add — words, with numbers only if they want them. A meal with no numbers is
 * a complete entry (PRODUCT_SPEC §5.5).
 */
export function AddEntryDialog(props: AddEntryDialogProps) {
  const { open, slot, foods, onClose } = props;
  const favourites = foods.filter((food) => food.favourite);
  const [mode, setMode] = useState<Mode>(favourites.length > 0 ? 'favourites' : 'foods');

  return (
    <Dialog open={open} onClose={onClose} title={`Add to ${MEAL_LABEL[slot].toLowerCase()}`}>
      <div className="space-y-4">
        <SegmentedControl<Mode>
          legend="Add from"
          hideLegend
          value={mode}
          onChange={setMode}
          options={[
            { value: 'favourites', label: 'Favourites' },
            { value: 'foods', label: 'My foods' },
            { value: 'quick', label: 'Quick add' },
          ]}
        />
        {mode === 'quick' ? (
          <QuickAddForm {...props} />
        ) : (
          <FoodPicker {...props} foods={mode === 'favourites' ? favourites : foods} mode={mode} />
        )}
      </div>
    </Dialog>
  );
}

function FoodPicker({
  foods,
  mode,
  slot,
  localDate,
  visibility,
  unitSystem,
  onClose,
  addEntry,
}: AddEntryDialogProps & { mode: Mode }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(newAttempt);
  const [pending, start] = useTransition();
  const { show } = useToast();

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === ''
      ? foods
      : foods.filter((food) => `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(needle));
  }, [foods, query]);

  if (foods.length === 0) {
    return (
      <EmptyState
        title={mode === 'favourites' ? 'No favourites yet' : 'No foods yet'}
        body={
          mode === 'favourites'
            ? 'Star a food under Foods and it appears here. Quick add works without one.'
            : 'Foods you save, with your own numbers or none, appear here. Quick add works without one.'
        }
        action={
          <Link href="/train/food?tab=foods" className="text-body-sm font-medium text-accent">
            Go to Foods
          </Link>
        }
      />
    );
  }

  if (chosen) {
    const amount = Number(servings);
    const valid = Number.isFinite(amount) && amount > 0 && amount <= 50;
    const preview = valid
      ? nutrientSummary(scaleNutrients(chosen.nutrients, amount), visibility)
      : '';
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) {
            setError('Servings must be more than 0 and at most 50.');
            return;
          }
          setError(null);
          start(async () => {
            const result = await addEntry({
              localDate,
              slot,
              attemptToken: attempt,
              foodId: chosen.id,
              servings: amount,
            });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setAttempt(newAttempt());
            show(`${chosen.name} added to ${MEAL_LABEL[slot].toLowerCase()}.`, 'success');
            onClose();
          });
        }}
      >
        <div>
          <p className="text-body font-semibold text-ink">{chosen.name}</p>
          <p className="text-body-sm text-ink-muted">
            {chosen.servingLabel}
            {servingWeight(chosen.servingGrams, unitSystem)
              ? ` (${servingWeight(chosen.servingGrams, unitSystem)})`
              : ''}{' '}
            · {FOOD_SOURCE_LABEL[chosen.source]}
          </p>
        </div>
        <FormField
          label="Servings"
          hint="Halves and quarters are fine."
          {...(error ? { error } : {})}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              inputMode="decimal"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              invalid={error !== null}
            />
          )}
        </FormField>
        {preview ? <p className="text-body-sm text-ink-muted">{preview}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={() => setChosen(null)}>
            Back
          </Button>
          <Button type="submit" loading={pending}>
            Add
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <FormField label="Search">
        {({ id }) => (
          <TextInput
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or brand"
          />
        )}
      </FormField>
      {shown.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Nothing matches “{query}”.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {shown.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => setChosen(food)}
                className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-sunken"
              >
                <span className="text-body text-ink">
                  {food.name}
                  {food.brand ? <span className="text-ink-muted"> · {food.brand}</span> : null}
                </span>
                <span className="text-body-sm text-ink-muted">
                  {food.servingLabel}
                  {nutrientSummary(food.nutrients, visibility)
                    ? ` · ${nutrientSummary(food.nutrients, visibility)}`
                    : ''}
                </span>
                <span className="text-label text-ink-muted">{FOOD_SOURCE_LABEL[food.source]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAddForm({ slot, localDate, visibility, onClose, addEntry }: AddEntryDialogProps) {
  const [description, setDescription] = useState('');
  const [values, setValues] = useState<Record<Nutrient, string>>({
    kcal: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    fiberG: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(newAttempt);
  const [pending, start] = useTransition();
  const { show } = useToast();
  const fields = visibleNutrients(visibility);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Object.fromEntries(
          (Object.keys(values) as Nutrient[]).map((key) => [key, optionalNumber(values[key])]),
        ) as Record<Nutrient, number | null | 'invalid'>;
        if (Object.values(parsed).includes('invalid')) {
          setError('Numbers must be zero or more — or leave them blank.');
          return;
        }
        if (description.trim() === '') {
          setError('Say what it was. Numbers are optional.');
          return;
        }
        setError(null);
        start(async () => {
          const result = await addEntry({
            localDate,
            slot,
            attemptToken: attempt,
            quickAdd: {
              description: description.trim(),
              nutrients: parsed as Record<Nutrient, number | null>,
            },
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setAttempt(newAttempt());
          show(`Added to ${MEAL_LABEL[slot].toLowerCase()}.`, 'success');
          onClose();
        });
      }}
    >
      <FormField label="What was it?" hint="“Dinner at my sister’s” is a complete entry.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            value={description}
            maxLength={120}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      {fields.length > 0 ? (
        <fieldset>
          <legend className="text-body-sm font-medium text-ink">Numbers, if you know them</legend>
          <p className="text-body-sm text-ink-muted">Leave blank rather than guess.</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {fields.map((key) => (
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
        </fieldset>
      ) : null}
      {error ? (
        <p role="alert" className="text-body-sm text-warn">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Add
        </Button>
      </div>
    </form>
  );
}
