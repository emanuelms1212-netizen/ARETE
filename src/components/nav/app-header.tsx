import Link from 'next/link';
import { AreteMark } from '@/components/icons';
import { appConfig } from '@/lib/app-config';
import { CommandLauncher } from './command-launcher';

export function AppHeader() {
  return (
    <header className="pt-safe px-safe sticky top-0 z-30 border-b border-line bg-canvas/90 pb-3 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 md:max-w-2xl">
        <Link
          href="/today"
          className="flex items-center gap-2 rounded-sm text-ink"
          aria-label={`${appConfig.name} — Today`}
        >
          <AreteMark size={24} className="text-accent" />
          <span className="font-display text-display-3 font-semibold tracking-[0.18em]">
            {appConfig.name}
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <CommandLauncher />
          <Link
            href="/settings"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-body-sm text-ink-muted hover:text-ink"
            aria-label="Profile and settings"
          >
            <span aria-hidden="true">You</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
