import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from '@/components/icons';

export interface ListRowProps {
  readonly title: ReactNode;
  readonly detail?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** Makes the whole row a link. Omit it and the row is static, not a fake button. */
  readonly href?: string;
  readonly muted?: boolean;
}

/**
 * One line in a list.
 *
 * A row is only interactive when it is given somewhere to go. That is
 * deliberate: a row that looks pressable but is not is the exact "mock button"
 * the build rules forbid.
 */
export function ListRow({ title, detail, leading, trailing, href, muted = false }: ListRowProps) {
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={`block text-body break-words ${muted ? 'text-ink-muted' : 'text-ink'}`}>
          {title}
        </span>
        {detail ? <span className="mt-0.5 block text-body-sm text-ink-muted">{detail}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-body-sm text-ink-muted">{trailing}</span> : null}
      {href ? <ChevronRightIcon size={18} className="shrink-0 text-ink-muted" /> : null}
    </>
  );

  const shared =
    'flex min-h-11 w-full items-center gap-3 py-3 text-left border-b border-line last:border-b-0';

  if (href) {
    return (
      <li>
        <Link
          href={href}
          className={`${shared} focus-inset rounded-sm transition-colors duration-[var(--duration-fast)] hover:text-accent`}
        >
          {body}
        </Link>
      </li>
    );
  }

  return <li className={shared}>{body}</li>;
}

/** A dot that says what state a row is in, paired with text — never colour alone. */
export function StatusDot({ tone }: { tone: 'done' | 'open' | 'skipped' }) {
  const classes = {
    done: 'bg-success',
    open: 'bg-ink-muted',
    skipped: 'bg-line-strong',
  } as const;

  return <span aria-hidden="true" className={`block h-2.5 w-2.5 rounded-full ${classes[tone]}`} />;
}
