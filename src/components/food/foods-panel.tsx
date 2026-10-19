'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  ChoiceList,
  ConfirmDialog,
  Dialog,
  EmptyState,
  FormField,
  Section,
  SegmentedControl,
  TextArea,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  FOOD_SOURCE_LABEL,
  NUTRIENTS,
  gramsToOunces,
  oilMatches,
  ouncesToGrams,
  recipePerServing,
  type Food,
  type FoodInput,
  type Nutrient,
  type OilAwareness,
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
import type { FoodActions } from './types';

type Kind = 'food' | 'recipe';
type OwnSource = 'label' | 'estimate' | 'synthetic-demo';

const emptyValues = (): Record<Nutrient, string> => ({
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  fiberG: '',
});

function FoodForm({
  food,
  foods,
  visibility,
  unitSystem,
  oil,
  onClose,
  actions,
}: {
  food: Food | null;
  foods: readonly Food[];
  visibility: Visibility;
  unitSystem: UnitSystem;
  oil: OilAwareness | null;
  onClose: () => void;
  actions: Pick<FoodActions, 'saveFood' | 'saveOil'>;
}) {
  const [kind, setKind] = useState<Kind>(food?.source === 'recipe' ? 'recipe' : 'food');
  const [name, setName] = useState(food?.name ?? '');
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [servingLabel, setServingLabel] = useState(food?.servingLabel ?? '1 serving');
  const [weight, setWeight] = useState(() => {
    const grams = food?.servingGrams ?? null;
    if (grams === null) return '';
    const value = unitSystem === 'us' ? gramsToOunces(grams) : grams;
    return String(Math.round(value * 10) / 10);
  });
  const [source, setSource] = useState<OwnSource>(
    food?.source === 'label' || food?.source === 'synthetic-demo' ? food.source : 'estimate',
  );
  const [values, setValues] = useState<Record<Nutrient, string>>(() => {
    if (!food) return emptyValues();
    return Object.fromEntries(
      NUTRIENTS.map((key) => [
        key,
        food.nutrients[key] === null ? '' : String(food.nutrients[key]),
      ]),
    ) as Record<Nutrient, string>;
  });
  const [ingredients, setIngredients] = useState<{ foodId: string; servings: string }[]>(
    () =>
      food?.ingredients.map((item) => ({ foodId: item.foodId, servings: String(item.servings) })) ??
      [],
  );
  const [servingsMade, setServingsMade] = useState(String(food?.servingsMade ?? 4));
  const [labelNote, setLabelNote] = useState(food && oil ? (oil.labelNotes[food.id] ?? '') : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  const candidates = foods.filter((other) => other.id !== food?.id && other.source !== 'recipe');
  const fields = visibleNutrients(visibility);
  const madeNumber = Number(servingsMade);
  const resolved = ingredients.flatMap((item) => {
    const match = foods.find((other) => other.id === item.foodId);
    const servings = Number(item.servings);
    return match && Number.isFinite(servings) && servings > 0 ? [{ food: match, servings }] : [];
  });
  const preview =
    kind === 'recipe' && resolved.length > 0 && madeNumber > 0
      ? recipePerServing(resolved, madeNumber)
      : null;

  function submit() {
    const grams = optionalNumber(weight);
    if (grams === 'invalid') {
      setError('The serving weight must be a number, or blank.');
      return;
    }
    let input: FoodInput;
    const common = {
      name: name.trim(),
      brand: brand.trim() === '' ? null : brand.trim(),
      servingLabel: servingLabel.trim() === '' ? '1 serving' : servingLabel.trim(),
      servingGrams:
        grams === null
          ? null
          : Math.round((unitSystem === 'us' ? ouncesToGrams(grams) : grams) * 10) / 10,
    };
    if (kind === 'recipe') {
      if (resolved.length === 0 || !(madeNumber > 0)) {
        setError('A recipe needs at least one ingredient and how many servings it makes.');
        return;
      }
      input = {
        ...common,
        source: 'recipe',
        ingredients: resolved.map((item) => ({ foodId: item.food.id, servings: item.servings })),
        servingsMade: madeNumber,
      };
    } else {
      const parsed = Object.fromEntries(
        NUTRIENTS.map((key) => [key, optionalNumber(values[key])]),
      ) as Record<Nutrient, number | null | 'invalid'>;
      if (Object.values(parsed).includes('invalid')) {
        setError('Numbers must be zero or more — or leave them blank.');
        return;
      }
      // A hidden field keeps what was there rather than being erased unseen.
      const nutrients = Object.fromEntries(
        NUTRIENTS.map((key) => [
          key,
          fields.includes(key) ? (parsed[key] as number | null) : (food?.nutrients[key] ?? null),
        ]),
      ) as Record<Nutrient, number | null>;
      input = { ...common, source, nutrients };
    }
    if (input.name === '') {
      setError('A food needs a name.');
      return;
    }
    setError(null);
    start(async () => {
      const result = await actions.saveFood({ ...(food ? { id: food.id } : {}), food: input });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (oil) {
        const note = labelNote.trim();
        const current = oil.labelNotes[result.value.id] ?? '';
        if (note !== current) {
          const labelNotes = { ...oil.labelNotes };
          if (note === '') delete labelNotes[result.value.id];
          else labelNotes[result.value.id] = note;
          const saved = await actions.saveOil({ ...oil, labelNotes });
          if (!saved.ok) {
            setError(saved.message);
            return;
          }
        }
      }
      show(
        food ? `${result.value.name} saved.` : `${result.value.name} added to your foods.`,
        'success',
      );
      onClose();
    });
  }

  const matches = oil && labelNote ? oilMatches(labelNote, oil.list) : [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={food ? `Edit ${food.name}` : 'New food'}
      footer={
        <Button onClick={submit} loading={pending}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        {food ? null : (
          <SegmentedControl<Kind>
            legend="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'food', label: 'Food' },
              { value: 'recipe', label: 'Recipe' },
            ]}
          />
        )}
        <FormField label="Name">
          {({ id }) => (
            <TextInput
              id={id}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        {kind === 'food' ? (
          <FormField label="Brand (optional)">
            {({ id }) => (
              <TextInput
                id={id}
                value={brand}
                maxLength={60}
                onChange={(event) => setBrand(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="One serving is" hint="“1 bowl”, “2 slices”">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={servingLabel}
                maxLength={40}
                onChange={(event) => setServingLabel(event.target.value)}
              />
            )}
          </FormField>
          <FormField label={`Weight (${unitSystem === 'us' ? 'oz' : 'g'}, optional)`}>
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            )}
          </FormField>
        </div>

        {kind === 'recipe' ? (
          <fieldset className="space-y-3">
            <legend className="text-body-sm font-medium text-ink">Ingredients</legend>
            <p className="text-body-sm text-ink-muted">
              Numbers are calculated from your own foods. Add an ingredient as a food first if it is
              not listed.
            </p>
            {candidates.length === 0 ? (
              <p className="text-body-sm text-ink-muted">
                You have no foods to build a recipe from yet.
              </p>
            ) : null}
            {ingredients.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField label={`Ingredient ${index + 1}`}>
                    {({ id }) => (
                      <select
                        id={id}
                        value={item.foodId}
                        onChange={(event) =>
                          setIngredients(
                            ingredients.map((other, at) =>
                              at === index ? { ...other, foodId: event.target.value } : other,
                            ),
                          )
                        }
                        className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink"
                      >
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name} ({candidate.servingLabel})
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                </div>
                <div className="w-24">
                  <FormField label="Servings">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        inputMode="decimal"
                        value={item.servings}
                        onChange={(event) =>
                          setIngredients(
                            ingredients.map((other, at) =>
                              at === index ? { ...other, servings: event.target.value } : other,
                            ),
                          )
                        }
                      />
                    )}
                  </FormField>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ingredient ${index + 1}`}
                  onClick={() => setIngredients(ingredients.filter((_, at) => at !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            {candidates[0] ? (
              <Button
                size="sm"
                variant="quiet"
                onClick={() =>
                  setIngredients([...ingredients, { foodId: candidates[0]!.id, servings: '1' }])
                }
              >
                Add ingredient
              </Button>
            ) : null}
            <FormField label="The recipe makes (servings)">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={servingsMade}
                  onChange={(event) => setServingsMade(event.target.value)}
                />
              )}
            </FormField>
            {preview ? (
              <p className="text-body-sm text-ink-muted" data-testid="recipe-preview">
                Per serving: {nutrientSummary(preview.nutrients, visibility) || 'no numbers'}
                {preview.incomplete > 0
                  ? ` — ${preview.incomplete} ingredient${preview.incomplete === 1 ? ' has' : 's have'} missing numbers, so this is a floor.`
                  : ''}
              </p>
            ) : null}
          </fieldset>
        ) : (
          <>
            <ChoiceList<OwnSource>
              legend="Where the numbers come from"
              value={source}
              onChange={setSource}
              choices={[
                { value: 'label', label: FOOD_SOURCE_LABEL.label },
                {
                  value: 'estimate',
                  label: FOOD_SOURCE_LABEL.estimate,
                  hint: 'Or no numbers at all.',
                },
                // A demo food keeps its label until the person says otherwise.
                ...(food?.source === 'synthetic-demo'
                  ? [
                      {
                        value: 'synthetic-demo' as const,
                        label: FOOD_SOURCE_LABEL['synthetic-demo'],
                      },
                    ]
                  : []),
              ]}
            />
            {fields.length > 0 ? (
              <fieldset>
                <legend className="text-body-sm font-medium text-ink">
                  Per serving, if you know
                </legend>
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
          </>
        )}

        {oil ? (
          <FormField
            label="Ingredients from the label (optional)"
            hint="For your ingredient list. Matches are shown, not judged."
          >
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                value={labelNote}
                maxLength={300}
                onChange={(event) => setLabelNote(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
        {matches.length > 0 ? (
          <p className="text-body-sm text-ink-muted">
            Mentions from your list:{' '}
            {matches.map((item) => `${item.ingredient} (${item.stance})`).join(', ')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-sm text-warn">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export function FoodsPanel({
  foods,
  visibility,
  unitSystem,
  oil,
  actions,
}: {
  foods: readonly Food[];
  visibility: Visibility;
  unitSystem: UnitSystem;
  oil: OilAwareness | null;
  actions: Pick<FoodActions, 'saveFood' | 'saveOil' | 'setFavourite' | 'archiveFood'>;
}) {
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Food | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  return (
    <div className="space-y-4">
      <Section
        title="Your foods and recipes"
        hint="Numbers are yours: from a label, your estimate, or calculated from your recipe. ARETE does not supply nutrition values."
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            New food
          </Button>
        }
      >
        {foods.length === 0 ? (
          <EmptyState
            title="No foods yet"
            body="Save the things you eat often, with numbers or without. Quick add on the Day view works without saving anything."
          />
        ) : (
          <ul className="divide-y divide-line">
            {foods.map((food) => {
              const summary = nutrientSummary(food.nutrients, visibility);
              const matches = oil ? oilMatches(oil.labelNotes[food.id] ?? '', oil.list) : [];
              return (
                <li key={food.id} className="flex items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-body text-ink">
                      {food.name}
                      {food.brand ? <span className="text-ink-muted"> · {food.brand}</span> : null}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {food.servingLabel}
                      {servingWeight(food.servingGrams, unitSystem)
                        ? ` (${servingWeight(food.servingGrams, unitSystem)})`
                        : ''}
                      {summary ? ` · ${summary}` : ''}
                    </p>
                    <p className="text-label text-ink-muted">{FOOD_SOURCE_LABEL[food.source]}</p>
                    {matches.length > 0 ? (
                      <p className="text-body-sm text-ink-muted">
                        Label mentions:{' '}
                        {matches.map((item) => `${item.ingredient} (${item.stance})`).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={food.favourite}
                      aria-label={food.favourite ? `Unstar ${food.name}` : `Star ${food.name}`}
                      loading={pending}
                      onClick={() =>
                        start(async () => {
                          const result = await actions.setFavourite({
                            foodId: food.id,
                            favourite: !food.favourite,
                          });
                          if (!result.ok) setError(result.message);
                        })
                      }
                    >
                      {food.favourite ? '★' : '☆'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${food.name}`}
                      onClick={() => setEditing(food)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${food.name}`}
                      onClick={() => setArchiving(food)}
                    >
                      Remove
                    </Button>
                  </div>
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
      </Section>
      {editing ? (
        <FoodForm
          key={editing === 'new' ? 'new' : editing.id}
          food={editing === 'new' ? null : editing}
          foods={foods}
          visibility={visibility}
          unitSystem={unitSystem}
          oil={oil}
          onClose={() => setEditing(null)}
          actions={actions}
        />
      ) : null}
      <ConfirmDialog
        open={archiving !== null}
        title={`Remove ${archiving?.name ?? 'this food'}?`}
        description="It leaves your list. Meals already logged with it keep their numbers."
        confirmLabel="Remove food"
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          const target = archiving;
          if (!target) return;
          start(async () => {
            const result = await actions.archiveFood(target.id);
            setArchiving(null);
            if (!result.ok) setError(result.message);
            else show(`${target.name} removed.`, 'success');
          });
        }}
      />
    </div>
  );
}
