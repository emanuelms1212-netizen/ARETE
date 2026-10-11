import { generateFirstWeek, toLocalDate, type DraftWeek } from '@/domain';
import { withUser } from '@/persistence';

/**
 * Reads the user's current draft week, generating one first if none exists.
 *
 * This is a plain server function and deliberately *not* a server action: the
 * review screen needs it during render, and an action may not revalidate a
 * path from inside a render. `generateDraftAction` wraps this for the cases
 * where a fresh draft is requested from the client.
 */
export async function ensureDraftWeek(userId: string): Promise<{ id: string; draft: DraftWeek }> {
  return withUser(userId, async (repository) => {
    const existing = await repository.getLatestDraft(userId);
    if (existing) return existing;

    const { profile } = await repository.getOnboarding(userId);
    const timeZone = await repository.getTimeZone(userId);
    const startDate = toLocalDate(new Date(), timeZone);

    const id = await repository.saveDraftWeek(
      userId,
      generateFirstWeek(profile, { startDate, timeZone }),
    );
    const saved = await repository.getLatestDraft(userId);
    if (!saved) throw new Error(`Draft ${id} was saved but could not be read back`);
    return saved;
  });
}

/**
 * Replaces the user's draft with a newly generated one.
 *
 * Used when the answers changed after a draft already existed, so the review
 * screen must not keep showing a week built from stale answers.
 */
export async function regenerateDraftWeek(
  userId: string,
): Promise<{ id: string; draft: DraftWeek }> {
  return withUser(userId, async (repository) => {
    const { profile } = await repository.getOnboarding(userId);
    const timeZone = await repository.getTimeZone(userId);
    const startDate = toLocalDate(new Date(), timeZone);

    const id = await repository.saveDraftWeek(
      userId,
      generateFirstWeek(profile, { startDate, timeZone }),
    );
    const saved = await repository.getLatestDraft(userId);
    if (!saved) throw new Error(`Draft ${id} was saved but could not be read back`);
    return saved;
  });
}
