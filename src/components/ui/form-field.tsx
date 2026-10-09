'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';

export interface FormFieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Wires a label, a hint and an error message to a control.
 *
 * The control is supplied by the caller through the render prop and receives
 * the ids it needs, so a field is never a label floating next to an input with
 * no programmatic relationship between them.
 */
export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-body-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{children({ id, describedBy })}</div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-body-sm text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends ComponentProps<'input'> {
  readonly invalid?: boolean;
}

export function TextInput({ invalid = false, className = '', ...props }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`min-h-11 w-full rounded-md border bg-surface px-3 text-body text-ink placeholder:text-ink-muted ${
        invalid ? 'border-warn' : 'border-line-strong'
      } ${className}`}
      {...props}
    />
  );
}

export function TextArea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-muted ${className}`}
      {...props}
    />
  );
}
