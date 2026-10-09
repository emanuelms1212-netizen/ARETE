import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Small line above the title: a date, a week, a program name. */
  readonly eyebrow?: ReactNode;
  readonly title: string;
  readonly lede?: ReactNode;
  readonly action?: ReactNode;
  readonly meta?: ReactNode;
}

/**
 * The top of every destination. One `h1`, in the display face, so that the
 * first thing read on any screen is the same shape.
 */
export function PageHeader({ eyebrow, title, lede, action, meta }: PageHeaderProps) {
  return (
    <header className="mb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-label tracking-[0.12em] text-ink-muted uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="font-display mt-1 text-display-1 font-semibold text-balance text-ink">
            {title}
          </h1>
          {lede ? <p className="mt-2 text-body text-ink-muted">{lede}</p> : null}
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
      {meta ? <div className="mt-3">{meta}</div> : null}
    </header>
  );
}
