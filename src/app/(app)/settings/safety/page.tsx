import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { EmptyState, PageHeader, Section, StopGuidance } from '@/components/ui';
import { MODULE_STATUS_LABEL, eligibilityOverview } from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../../current-day';
import { loadEligibility } from '../../eligibility';

export const metadata: Metadata = { title: 'Safety and modules' };

export const dynamic = 'force-dynamic';

/**
 * What each gated module will and will not offer, and why, from the one set
 * of rules every screen uses. Nothing here is a verdict about the person;
 * each line says which answer led to it and how to change that answer.
 */
export default async function SafetyPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }
  const lines = await withUser(user.id, async (repository) => {
    const { localDate } = await resolveCurrentDay(repository, user);
    return eligibilityOverview(await loadEligibility(repository, user.id, localDate));
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
        }
        title="Safety and modules"
        lede="What ARETE offers you, adjusts, or leaves out — and the answer behind each one. None of it is medical advice."
      />

      <Section title="Modules" hint="Decided from what you told ARETE, in one place.">
        <ul className="space-y-3" data-testid="module-overview">
          {lines.map((line) => (
            <li key={line.module} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-body font-medium text-ink">{line.label}</span>
                <span className="text-body-sm text-ink-muted">
                  {MODULE_STATUS_LABEL[line.status]}
                </span>
              </div>
              <p className="mt-1 text-body-sm text-ink-muted">{line.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Your health answers"
        hint="Change them whenever something changes, including a clinician's clearance."
      >
        <Link
          href="/onboarding/health?from=safety"
          className="inline-flex min-h-11 items-center text-body text-accent hover:underline"
        >
          Change your health answers
        </Link>
      </Section>

      <Section title="When to stop" hint="The same guidance appears on every screen it applies to.">
        <div className="space-y-2">
          <StopGuidance module="workout" summary="During training" />
          <StopGuidance module="breathwork" summary="During breathing or meditation" />
          <StopGuidance module="contrast" summary="With heat or cold" />
          <StopGuidance module="food" summary="With food and numbers" />
          <StopGuidance module="journal" summary="When writing" />
        </div>
      </Section>
    </div>
  );
}
