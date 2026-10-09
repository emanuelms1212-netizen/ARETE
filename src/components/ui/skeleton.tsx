import type { ComponentProps } from 'react';

/**
 * The single loading primitive. Every loading state is built from these, so
 * loading never appears as a spinner in one place and a bar in another.
 *
 * The pulse uses the breathing easing rather than a linear shimmer, and it
 * stops entirely under `prefers-reduced-motion`.
 */
export function Skeleton({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-skeleton rounded-md bg-sunken ${className}`}
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
