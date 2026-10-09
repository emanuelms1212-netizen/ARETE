import type { ReactNode } from 'react';
import { AlertIcon } from '@/components/icons';

export interface SafetyNoticeProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}

/**
 * The standard safety surface.
 *
 * Every module that can hurt someone — contrast therapy, cold exposure, loaded
 * end-range mobility, fasting-adjacent targets — states its limits through this
 * component, so the wording and prominence cannot vary module by module.
 *
 * It is a region, not an alert: it is present from the start rather than
 * announced on an event, so it must not interrupt a screen reader mid-flow.
 */
export function SafetyNotice({ title, children, action }: SafetyNoticeProps) {
  return (
    <section
      aria-labelledby="safety-notice-title"
      className="rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex gap-3">
        <AlertIcon size={20} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0">
          <h2 id="safety-notice-title" className="text-body font-semibold text-ink">
            {title}
          </h2>
          <div className="mt-1 space-y-2 text-body-sm text-ink-muted">{children}</div>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}
