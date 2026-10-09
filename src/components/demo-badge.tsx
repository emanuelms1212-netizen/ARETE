import { isDemoMode } from '@/lib/env';

/**
 * Demo data is always labelled. The app never lets sample data pass for the
 * user's own.
 */
export function DemoBadge() {
  if (!isDemoMode) return null;

  return (
    <p className="inline-block rounded-full border border-line-strong px-3 py-1 text-label text-ink-muted">
      Demo data — deterministic sample, not your account
    </p>
  );
}
