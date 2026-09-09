import type { ComponentProps } from 'react';

type Variant = 'primary' | 'quiet';

const base =
  'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--canvas)] hover:opacity-90',
  quiet:
    'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-sunken)]',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
