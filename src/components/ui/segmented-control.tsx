'use client';

import { useId } from 'react';

export interface SegmentedOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export interface SegmentedControlProps<TValue extends string> {
  readonly legend: string;
  readonly options: readonly SegmentedOption<TValue>[];
  readonly value: TValue;
  readonly onChange: (value: TValue) => void;
  /** Renders the legend only for assistive technology. */
  readonly hideLegend?: boolean;
}

/**
 * Built from real radio inputs inside a fieldset rather than from buttons, so
 * arrow-key navigation, grouping and announcement all come from the platform
 * instead of being re-implemented with ARIA.
 */
export function SegmentedControl<TValue extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend = false,
}: SegmentedControlProps<TValue>) {
  const name = useId();

  return (
    <fieldset className="min-w-0">
      <legend className={hideLegend ? 'sr-only' : 'mb-1.5 text-label text-ink-muted uppercase'}>
        {legend}
      </legend>
      <div className="flex gap-1 rounded-full border border-line-strong bg-sunken p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              // `min-w-0` is load-bearing: a flex item's default minimum size
              // is its content, so without it a label wider than its share
              // pushes the whole control past the viewport. Three options at
              // 320px is where that first shows.
              className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full px-2 text-body-sm transition-colors duration-[var(--duration-fast)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus sm:px-3 ${
                selected ? 'bg-surface text-ink shadow-raised' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="truncate">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
