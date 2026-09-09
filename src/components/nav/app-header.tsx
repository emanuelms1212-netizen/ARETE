import Link from 'next/link';
import { appConfig } from '@/lib/app-config';

export function AppHeader() {
  return (
    <header className="pt-safe px-safe sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--canvas)]/90 pb-3 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between md:max-w-2xl">
        <Link href="/today" className="text-base font-semibold tracking-[0.2em] text-[var(--ink)]">
          {appConfig.name}
        </Link>
        <Link
          href="/settings"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
          aria-label="Profile and settings"
        >
          <span aria-hidden="true">You</span>
        </Link>
      </div>
    </header>
  );
}
