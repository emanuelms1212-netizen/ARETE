import type { ReactNode } from 'react';

interface StateBlockProps {
  readonly title: string;
  readonly body?: ReactNode;
  readonly action?: ReactNode;
  readonly tone?: 'neutral' | 'warn';
}

/**
 * Empty and error states share one component so that the two never drift apart
 * in tone or spacing.
 *
 * Copy rule (PRODUCT_SPEC §14): say what is true and what to do next. No
 * "Oops", no "Something went wrong", no exclamation marks, no blame.
 */
export function StateBlock({ title, body, action, tone = 'neutral' }: StateBlockProps) {
  return (
    <div
      className="rounded-[var(--radius-card)] border border-dashed border-[var(--line)] px-4 py-8 text-center"
      role={tone === 'warn' ? 'alert' : undefined}
    >
      <p
        className={`text-base font-medium ${tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--ink)]'}`}
      >
        {title}
      </p>
      {body ? <div className="mt-2 text-sm text-[var(--ink-muted)]">{body}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: Omit<StateBlockProps, 'tone'>) {
  return <StateBlock {...props} tone="neutral" />;
}

export function ErrorState(props: Omit<StateBlockProps, 'tone'>) {
  return <StateBlock {...props} tone="warn" />;
}
