'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { destinations } from './destinations';

/**
 * Thumb-reachable primary navigation on phones; the same list renders as a
 * left rail from `md` up, so there is one IA rather than two products.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur md:top-0 md:right-auto md:bottom-0 md:w-56 md:border-t-0 md:border-r md:pt-6"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 md:mx-0 md:max-w-none md:flex-col md:gap-1 md:px-3">
        {destinations.map((destination) => {
          const isCurrent = pathname === destination.href;
          return (
            <li key={destination.href} className="flex-1 md:flex-none">
              <Link
                href={destination.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg px-2 py-2 text-xs font-medium md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm ${
                  isCurrent
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mb-1 block h-1.5 w-1.5 rounded-full md:mb-0 ${
                    isCurrent ? 'bg-[var(--accent)]' : 'bg-transparent'
                  }`}
                />
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
