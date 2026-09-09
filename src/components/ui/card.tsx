import type { ComponentProps, ReactNode } from 'react';

export function Card({ className = '', ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <header className="mb-3">
      <h2 className="text-sm font-semibold tracking-wide text-[var(--ink)] uppercase">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-[var(--ink-muted)]">{hint}</p> : null}
    </header>
  );
}
