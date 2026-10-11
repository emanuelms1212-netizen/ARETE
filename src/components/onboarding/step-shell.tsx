'use client';

import { useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { ONBOARDING_STEPS, STEP_RATIONALE, previousStep, type OnboardingStep } from '@/domain';

export interface StepShellProps {
  readonly step: OnboardingStep;
  readonly title: string;
  readonly children: ReactNode;
  readonly onContinue: () => void | Promise<void>;
  readonly onSkip: () => void | Promise<void>;
  readonly continueLabel?: string;
}

/**
 * The frame every onboarding step sits in.
 *
 * Three things it guarantees, so no individual step has to remember them:
 * a visible position in the flow, the reason this step is being asked at all,
 * and a skip that is as easy to reach as the continue.
 */
export function StepShell({
  step,
  title,
  children,
  onContinue,
  onSkip,
  continueLabel = 'Continue',
}: StepShellProps) {
  const [pending, start] = useTransition();
  const index = ONBOARDING_STEPS.indexOf(step);
  const total = ONBOARDING_STEPS.length - 1;
  const back = previousStep(step);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-label tracking-[0.12em] text-ink-muted uppercase">
          Step {index + 1} of {total}
        </p>
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-base)]"
            style={{ width: `${Math.round((index / total) * 100)}%` }}
          />
        </div>
      </div>

      <div>
        <h1 className="font-display text-display-1 font-semibold text-balance text-ink">{title}</h1>
        <p className="mt-2 text-body text-ink-muted">{STEP_RATIONALE[step]}</p>
      </div>

      <div className="space-y-5">{children}</div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button onClick={() => start(() => void onContinue())} loading={pending}>
          {continueLabel}
        </Button>
        <Button variant="quiet" onClick={() => start(() => void onSkip())} disabled={pending}>
          Skip this
        </Button>
        {back ? (
          <a
            href={`/onboarding/${back}`}
            className="ml-auto min-h-11 content-center text-body-sm text-ink-muted hover:text-ink"
          >
            Back
          </a>
        ) : null}
      </div>
    </div>
  );
}
