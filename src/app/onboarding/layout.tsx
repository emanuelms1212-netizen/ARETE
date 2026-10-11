import Link from 'next/link';
import { AreteMark } from '@/components/icons';
import { appConfig } from '@/lib/app-config';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="pt-safe px-safe border-b border-line pb-3">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <span className="flex items-center gap-2 text-ink">
            <AreteMark size={22} className="text-accent" />
            <span className="font-display text-display-3 font-semibold tracking-[0.18em]">
              {appConfig.name}
            </span>
          </span>
          {/* Leaving is always possible. Onboarding is not a wall. */}
          <Link
            href="/today"
            className="min-h-11 content-center text-body-sm text-ink-muted hover:text-ink"
          >
            Do this later
          </Link>
        </div>
      </header>

      {/* The width is set per screen: a question wants one narrow column,
          the week review wants the room a desktop actually has. */}
      <main className="px-safe pt-6 pb-16">{children}</main>
    </div>
  );
}
