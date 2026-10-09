'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { destinations } from './destinations';

/**
 * Thumb-reachable primary navigation on phones; the same list becomes a left
 * rail from `md` up, so there is one information architecture rather than two
 * products.
 *
 * The current destination is marked with `aria-current`, a filled icon chip and
 * a heavier label — never by colour alone.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur md:top-0 md:right-auto md:bottom-0 md:w-56 md:border-t-0 md:border-r md:pt-20"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between gap-0.5 px-2 md:mx-0 md:max-w-none md:flex-col md:gap-1 md:px-3">
        {destinations.map(({ href, label, Icon }) => {
          const isCurrent = pathname === href;
          return (
            <li key={href} className="min-w-0 flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`focus-inset flex min-h-13 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-label transition-colors duration-[var(--duration-fast)] md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2 md:text-body ${
                  isCurrent
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon size={20} />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
