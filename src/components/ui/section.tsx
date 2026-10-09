import type { ReactNode } from 'react';
import { Card } from './card';

export interface SectionProps {
  readonly title: string;
  readonly hint?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  /** Renders the heading only for assistive technology. */
  readonly visuallyHiddenTitle?: boolean;
  readonly className?: string;
}

/**
 * A titled block of content. The whole app is made of these, so the spacing
 * between a title, its hint and its body is decided once, here.
 */
export function Section({
  title,
  hint,
  action,
  children,
  visuallyHiddenTitle = false,
  className = '',
}: SectionProps) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={
              visuallyHiddenTitle
                ? 'sr-only'
                : 'text-label font-semibold tracking-[0.08em] text-ink-muted uppercase'
            }
          >
            {title}
          </h2>
          {hint ? <p className="mt-1.5 text-body-sm text-ink-muted">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}
