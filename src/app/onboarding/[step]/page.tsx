import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';
import { ReviewWeek } from '@/components/onboarding/review-week';
import {
  AgeStep,
  FoodStep,
  HealthStep,
  IntentStep,
  MindStep,
  MinimumStep,
  ScheduleStep,
  TrainingStep,
} from '@/components/onboarding/steps';
import { ONBOARDING_STEPS, type OnboardingStep } from '@/domain';
import { CONTENT_PACKS, withUser } from '@/persistence';
import { acceptDraftAction, saveStepAction, skipStepAction } from '../actions';
import { ensureDraftWeek } from '../draft';

export const dynamic = 'force-dynamic';

function isStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (!isStep(step)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect('/today');

  const state = await withUser(user.id, (repository) => repository.getOnboarding(user.id));

  if (step === 'review') {
    const latest = await ensureDraftWeek(user.id);

    return <ReviewWeek week={latest.draft} onAccept={acceptDraftAction} />;
  }

  const props = {
    profile: state.profile,
    onSave: saveStepAction.bind(null, step),
    onSkip: skipStepAction.bind(null, step),
  };

  switch (step) {
    case 'intent':
      return <IntentStep {...props} />;
    case 'schedule':
      return <ScheduleStep {...props} />;
    case 'training':
      return <TrainingStep {...props} />;
    case 'health':
      return <HealthStep {...props} />;
    case 'food':
      return <FoodStep {...props} />;
    case 'mind':
      return (
        <MindStep
          {...props}
          packs={CONTENT_PACKS.filter(
            (pack) => pack.kind === 'meditation' || pack.kind === 'program',
          ).map((pack) => ({ slug: pack.slug, title: pack.title }))}
        />
      );
    case 'age':
      return <AgeStep {...props} />;
    case 'minimum':
      return <MinimumStep {...props} />;
  }
}
