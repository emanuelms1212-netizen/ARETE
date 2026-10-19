'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth';
import { withUser } from '@/persistence';

const DELETE_PHRASE = 'delete everything';

/** Irreversible. Asks for the phrase typed, so it can never happen by a stray tap. */
export async function deleteEverythingAction(
  phrase: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (phrase.trim().toLowerCase() !== DELETE_PHRASE)
    return { ok: false, message: `Type “${DELETE_PHRASE}” to confirm.` };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  await withUser(user.id, (repository) => repository.deleteEverything(user.id));
  revalidatePath('/', 'layout');
  return { ok: true };
}
