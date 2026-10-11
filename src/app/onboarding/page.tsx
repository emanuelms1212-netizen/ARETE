import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';
import { withUser } from '@/persistence';

export const dynamic = 'force-dynamic';

/** Sends you to wherever you got to. Onboarding is resumable by default. */
export default async function OnboardingIndex() {
  const user = await getCurrentUser();
  if (!user) redirect('/today');

  const { progress } = await withUser(user.id, (repository) => repository.getOnboarding(user.id));

  redirect(`/onboarding/${progress.completedAt ? 'review' : progress.currentStep}`);
}
