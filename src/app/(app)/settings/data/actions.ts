'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth';
import { DATA_FEATURES, DATA_FEATURE_INFO, type DataFeature } from '@/domain';
import { takeToken } from '@/lib/rate-limit';
import { withUser } from '@/persistence';

const DELETE_PHRASE = 'delete everything';

type Result = { ok: true } | { ok: false; message: string };

const tooSoon = (seconds: number): Result => ({
  ok: false,
  message: `That has been tried several times in a row. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.`,
});

/** Irreversible. Asks for the phrase typed, so it can never happen by a stray tap. */
export async function deleteEverythingAction(phrase: string): Promise<Result> {
  if (phrase.trim().toLowerCase() !== DELETE_PHRASE)
    return { ok: false, message: `Type “${DELETE_PHRASE}” to confirm.` };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const allowed = takeToken('deleteAccount', user.id);
  if (!allowed.ok) return tooSoon(allowed.retryAfterSeconds);
  await withUser(user.id, (repository) => repository.deleteEverything(user.id));
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Irreversible: one part of the account. The confirmation is the feature's own name, typed. */
export async function deleteFeatureAction(feature: string, typed: string): Promise<Result> {
  if (!(DATA_FEATURES as readonly string[]).includes(feature))
    return { ok: false, message: 'Choose what to delete.' };
  const info = DATA_FEATURE_INFO[feature as DataFeature];
  if (typed.trim().toLowerCase() !== info.label.toLowerCase())
    return { ok: false, message: `Type “${info.label}” to confirm.` };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const allowed = takeToken('deleteFeature', user.id);
  if (!allowed.ok) return tooSoon(allowed.retryAfterSeconds);
  await withUser(user.id, async (repository) => {
    await repository.deleteFeatureData(user.id, feature as DataFeature);
    await repository.recordAudit(user.id, { action: 'delete_feature', detail: feature });
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
