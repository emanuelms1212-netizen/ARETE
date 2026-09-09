import type { ComponentProps } from 'react';

/**
 * The single loading primitive. Every loading state in the app is built from
 * these, so loading never appears as a spinner in one place and a bar in
 * another.
 */
export function Skeleton({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-[var(--surface-sunken)] ${className}`}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'h-3 w-2/3' : 'h-3 w-full'} />
      ))}
    </div>
  );
}
