'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  ChoiceChips,
  ConfirmDialog,
  FormField,
  Section,
  SegmentedControl,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  NO_SUPPLEMENTS,
  OIL_CARDS,
  OIL_SOURCE,
  RESTAURANT_QUESTIONS,
} from '@/content/nutrition/oil-awareness';
import { COOKING_OILS, OIL_STANCES, type OilAwareness, type OilStance } from '@/domain';
import type { FoodActions } from './types';

const STANCE_LABEL: Record<OilStance, string> = {
  prefer: 'Prefer',
  limit: 'Limit',
  avoid: 'Avoid',
};

/**
 * Ingredient / oil awareness: optional, off by default, and deleted whole
 * when turned off. It is a preference the person keeps, not a rule the app
 * holds; the educational cards set one author's claims beside the evidence
 * and mainstream guidance, in neutral words (SOURCE_MAP §6).
 */
export function OilPanel({
  oil,
  actions,
}: {
  oil: OilAwareness | null;
  actions: Pick<FoodActions, 'saveOil' | 'deleteOil'>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [ingredient, setIngredient] = useState('');
  const [stance, setStance] = useState<OilStance>('limit');
  const { show } = useToast();

  function save(next: OilAwareness, message?: string) {
    setError(null);
    start(async () => {
      const result = await actions.saveOil(next);
      if (!result.ok) setError(result.message);
      else if (message) show(message, 'success');
    });
  }

  if (!oil) {
    return (
      <Section
        title="Ingredient and oil awareness"
        hint="Optional, and off. Turn it on to keep your own prefer / limit / avoid list, note ingredient labels on your foods, choose your cooking oils and keep a few questions for restaurants."
      >
        <p className="text-body-sm text-ink-muted">
          It draws on one author’s viewpoint, presented as such — not as health advice.
        </p>
        <Button
          className="mt-3"
          variant="quiet"
          loading={pending}
          onClick={() =>
            save({ cookingOils: [], list: [], labelNotes: {} }, 'Ingredient awareness is on.')
          }
        >
          Turn on ingredient awareness
        </Button>
        {error ? (
          <p role="alert" className="mt-2 text-body-sm text-warn">
            {error}
          </p>
        ) : null}
      </Section>
    );
  }

  return (
    <Section
      title="Ingredient and oil awareness"
      hint="Your preferences. Nothing here is a health rule."
    >
      <div className="space-y-5">
        <ChoiceChips
          legend="Oils you cook with"
          choices={COOKING_OILS.map((value) => ({ value, label: value }))}
          selected={oil.cookingOils}
          onChange={(next) => save({ ...oil, cookingOils: next })}
        />

        <div>
          <h3 className="text-body-sm font-medium text-ink">Your list</h3>
          {oil.list.length === 0 ? (
            <p className="mt-1 text-body-sm text-ink-muted">
              Empty. Add ingredients you want to notice on labels.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {oil.list.map((item) => (
                <li key={item.ingredient} className="flex items-center justify-between gap-2">
                  <span className="text-body text-ink">
                    {item.ingredient}{' '}
                    <span className="text-ink-muted">· {STANCE_LABEL[item.stance]}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${item.ingredient} from your list`}
                    onClick={() =>
                      save({
                        ...oil,
                        list: oil.list.filter((other) => other.ingredient !== item.ingredient),
                      })
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const name = ingredient.trim();
              if (name === '') {
                setError('Name the ingredient.');
                return;
              }
              const list = [
                ...oil.list.filter(
                  (other) => other.ingredient.toLowerCase() !== name.toLowerCase(),
                ),
                { ingredient: name, stance },
              ];
              save({ ...oil, list }, `${name} added to your list.`);
              setIngredient('');
            }}
          >
            <FormField label="Ingredient" hint="For example “sunflower oil” or “palm”.">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={ingredient}
                  maxLength={40}
                  onChange={(event) => setIngredient(event.target.value)}
                />
              )}
            </FormField>
            <SegmentedControl<OilStance>
              legend="Stance"
              value={stance}
              onChange={setStance}
              options={OIL_STANCES.map((value) => ({ value, label: STANCE_LABEL[value] }))}
            />
            <Button type="submit" size="sm" variant="quiet" loading={pending}>
              Add to list
            </Button>
          </form>
        </div>

        <div>
          <h3 className="text-body-sm font-medium text-ink">Questions for restaurants</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-body-sm text-ink">
            {RESTAURANT_QUESTIONS.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-body-sm font-medium text-ink">About the source</h3>
          <p className="mt-1 text-body-sm text-ink-muted">
            “{OIL_SOURCE.title}” by {OIL_SOURCE.author}. {OIL_SOURCE.note}
          </p>
          <div className="mt-2 space-y-2">
            {OIL_CARDS.map((card) => (
              <details key={card.title} className="rounded-md border border-line p-3">
                <summary className="min-h-11 cursor-pointer content-center text-body font-medium text-ink">
                  {card.title}
                </summary>
                <dl className="mt-2 space-y-2 text-body-sm">
                  <div>
                    <dt className="font-medium text-ink">What the guide claims</dt>
                    <dd className="text-ink-muted">{card.claim}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">How settled the evidence is</dt>
                    <dd className="text-ink-muted">{card.evidence}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Mainstream guidance</dt>
                    <dd className="text-ink-muted">{card.mainstream}</dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
          <p className="mt-2 text-body-sm text-ink-muted">{NO_SUPPLEMENTS}</p>
        </div>

        <Button variant="quiet" onClick={() => setConfirming(true)}>
          Turn off and delete
        </Button>
        {error ? (
          <p role="alert" className="text-body-sm text-warn">
            {error}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        title="Turn off ingredient awareness?"
        description="Your list, cooking oils and every label note are deleted. This cannot be undone."
        confirmLabel="Turn off and delete"
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const result = await actions.deleteOil();
            setConfirming(false);
            if (!result.ok) setError(result.message);
            else show('Ingredient awareness is off, and its data is deleted.', 'success');
          })
        }
      />
    </Section>
  );
}
