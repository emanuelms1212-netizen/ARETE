import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'quiet' | 'ghost';
type Size = 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors ' +
  'duration-[var(--duration-fast)] ease-standard select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-45';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  quiet: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'text-accent hover:bg-accent-soft',
};

/** Both sizes keep a 44px hit area; `sm` only shrinks what you can see. */
const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-body',
  sm: 'min-h-11 px-3.5 text-body-sm',
};

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="animate-skeleton h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
