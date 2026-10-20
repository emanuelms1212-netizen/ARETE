'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';
import {
  isAnswerableStep,
  nextStep,
  type AnswerableStep,
  type DraftWeek,
  type OnboardingStep,
} from '@/domain';
import { withUser } from '@/persistence';
import { regenerateDraftWeek } from './draft';

/**
 * Onboarding's writes.
 *
 * Server actions rather than API routes: the form that collects an answer and
 * the code that stores it stay next to each other, and the answer is validated
 * by the same schema the generator reads.
 *
 * Every one of these re-reads the user from the session. None of them takes a
 * user id from the client.
 */
async function requireUser(): Promise<{ id: string; isDemo: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect('/today');
  return user;
}

export async function saveStepAction(step: string, answers: unknown): Promise<void> {
  if (!isAnswerableStep(step)) throw new Error(`Not a step that takes answers: ${step}`);
  const user = await requireUser();

  await withUser(user.id, async (repository) => {
    await repository.saveStep(user.id, step satisfies AnswerableStep, answers);
    if (step === 'health')
      await repository.recordAudit(user.id, { action: 'health_answers_changed', detail: null });
  });

  revalidatePath('/onboarding', 'layout');
  redirect(`/onboarding/${nextStep(step) ?? 'review'}`);
}

/** The health step, opened from Settings: saves and goes back to the safety overview. */
export async function saveHealthFromSettingsAction(answers: unknown): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, async (repository) => {
    await repository.saveStep(user.id, 'health', answers);
    await repository.recordAudit(user.id, { action: 'health_answers_changed', detail: null });
  });
  revalidatePath('/', 'layout');
  redirect('/settings/safety');
}

export async function skipStepAction(step: string): Promise<void> {
  const user = await requireUser();

  await withUser(user.id, (repository) => repository.skipStep(user.id, step as OnboardingStep));

  revalidatePath('/onboarding', 'layout');
  redirect(`/onboarding/${nextStep(step as OnboardingStep) ?? 'review'}`);
}

/**
 * Generates the week and stores it as a draft.
 *
 * Called when the user reaches the review step. Nothing it produces is part of
 * the user's plan until `acceptDraftAction` runs.
 */
export async function generateDraftAction(): Promise<void> {
  const user = await requireUser();

  await regenerateDraftWeek(user.id);

  revalidatePath('/onboarding/review');
}

/**
 * Saves the user's edited version of the week and turns it into real days.
 *
 * The edited draft is stored before it is accepted, so what the user actually
 * agreed to is what gets written, and the original generated week is still on
 * record beside it.
 */
export async function acceptDraftAction(edited: DraftWeek): Promise<void> {
  const user = await requireUser();

  await withUser(user.id, async (repository) => {
    const id = await repository.saveDraftWeek(user.id, edited);
    await repository.acceptDraft(user.id, id, new Date());
  });

  revalidatePath('/today');
  redirect('/today');
}
