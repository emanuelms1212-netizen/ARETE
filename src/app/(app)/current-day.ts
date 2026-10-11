import { toLocalDate, type IsoDate } from '@/domain';
import { DEMO_TODAY } from '@/persistence';
import type { AreteRepository } from '@/persistence/repository';

/**
 * Which day the app is actually showing.
 *
 * This exists because the screen and its actions disagreed. The page fell back
 * to the demo account's fixed sample day when the real date had no plan, while
 * every action resolved "today" from the clock — so the user saw one day,
 * edited another, and the write failed with a date they had never seen.
 *
 * The fix is not to pass the date from the client, which would let a stale tab
 * write to the wrong day and let a crafted request write to any day. It is to
 * have one function that answers "which day is this screen about", and to call
 * it from every page and every action.
 *
 * Plan uses it for the same reason Today does. The demo account is anchored to
 * a fixed date so screenshots stay stable; a screen that read the clock
 * instead would show that account's goals as months overdue and its habit
 * history as empty.
 */
export async function resolveCurrentDay(
  repository: AreteRepository,
  user: { readonly id: string; readonly isDemo: boolean },
): Promise<{ localDate: IsoDate; timeZone: string; isDemoFallback: boolean }> {
  const timeZone = await repository.getTimeZone(user.id);
  const today = toLocalDate(new Date(), timeZone);

  const real = await repository.getDay(user.id, today);
  if (real !== null || !user.isDemo) {
    return { localDate: today, timeZone, isDemoFallback: false };
  }

  // The demo account keeps a fixed sample day so that screenshots and tests
  // agree on what Today looks like. It is only ever reached before a real plan
  // exists, and it is the day the screen renders, so it is the day the actions
  // must write to.
  const sample = await repository.getDay(user.id, DEMO_TODAY);
  return sample === null
    ? { localDate: today, timeZone, isDemoFallback: false }
    : { localDate: DEMO_TODAY, timeZone, isDemoFallback: true };
}
