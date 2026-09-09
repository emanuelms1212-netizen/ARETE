import { isDemoMode } from '@/lib/env';

/**
 * Demo data is always labelled. The app never lets sample data pass for the
 * user's own.
 */
export function DemoBadge() {
  if (!isDemoMode) return null;

  return (
    <p className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-muted)]">
      Demo data — deterministic sample, not your account
    </p>
  );
}
