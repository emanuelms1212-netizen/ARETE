'use client';

import { useId } from 'react';
import { CheckIcon } from '@/components/icons';

export interface Choice<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly hint?: string;
}

interface ChipsProps<TValue extends string> {
  readonly legend: string;
  readonly choices: readonly Choice<TValue>[];
  readonly hideLegend?: boolean;
}

/**
 * Multi-select chips built from real checkboxes, so the group is announced,
 * each option is reachable by keyboard, and selection state is not carried by
 * colour alone — the selected chip is heavier and bordered as well as tinted.
 */
export function ChoiceChips<TValue extends string>({
  legend,
  choices,
  selected,
  onChange,
  hideLegend = false,
}: ChipsProps<TValue> & {
  readonly selected: readonly TValue[];
  readonly onChange: (next: TValue[]) => void;
}) {
  const name = useId();

  function toggle(value: TValue): void {
    onChange(
      selected.includes(value)
        ? selected.filter((candidate) => candidate !== value)
        : [...selected, value],
    );
  }

  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'mb-2 text-body-sm font-medium text-ink'}>
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const isSelected = selected.includes(choice.value);
          return (
            <label
              key={choice.value}
              className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-body-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                isSelected
                  ? 'border-accent bg-accent-soft font-semibold text-accent'
                  : 'border-line-strong bg-surface text-ink hover:bg-sunken'
              }`}
            >
              <input
                type="checkbox"
                name={name}
                value={choice.value}
                checked={isSelected}
                onChange={() => toggle(choice.value)}
                className="sr-only"
              />
              {choice.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Single-select, as radios. A vertical list rather than chips when each option
 * needs a sentence of explanation.
 */
export function ChoiceList<TValue extends string>({
  legend,
  choices,
  value,
  onChange,
  hideLegend = false,
}: ChipsProps<TValue> & {
  readonly value: TValue;
  readonly onChange: (next: TValue) => void;
}) {
  const name = useId();

  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'mb-2 text-body-sm font-medium text-ink'}>
        {legend}
      </legend>
      <div className="space-y-2">
        {choices.map((choice) => {
          const isSelected = choice.value === value;
          return (
            <label
              key={choice.value}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                isSelected ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={isSelected}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                  isSelected ? 'border-accent bg-accent' : 'border-line-strong'
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-body ${isSelected ? 'font-semibold text-accent' : 'text-ink'}`}
                >
                  {choice.label}
                </span>
                {choice.hint ? (
                  <span className="mt-0.5 block text-body-sm text-ink-muted">{choice.hint}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A yes/no, as a checkbox with the question as its label. */
export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
        checked ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      {/* Drawn rather than native, so it matches the radios beside it on the
          same screen instead of inheriting the browser's blue. */}
      <span
        aria-hidden="true"
        className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border-2 ${
          checked ? 'border-accent bg-accent text-canvas' : 'border-line-strong'
        }`}
      >
        {checked ? <CheckIcon size={10} /> : null}
      </span>
      <span className="min-w-0">
        <span className={`block text-body ${checked ? 'font-semibold text-accent' : 'text-ink'}`}>
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-body-sm text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
