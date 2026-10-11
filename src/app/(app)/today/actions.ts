'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth';
import { addDays, type CommitmentKind } from '@/domain';
import { withUser } from '@/persistence';
import type { AreteRepository, DayReview } from '@/persistence/repository';
import { resolveCurrentDay } from '../current-day';

/**
 * The day's writes.
 *
 * Every one re-reads the user from the session and resolves the date through
 * `resolveCurrentDay`, the same function the page uses. None of them takes a
 * user id or a date from the client: a stale tab cannot write to yesterday,
 * and a crafted request cannot write to someone else or to an arbitrary day.
 *
 * They are deliberately thin — each returns nothing and revalidates. The
 * optimism lives in the client component; an action that returned a patched
 * day would give the two something to disagree about.
 */
async function onToday<T>(
  work: (
    repository: AreteRepository,
    context: { userId: string; localDate: string; timeZone: string },
  ) => Promise<T>,
): Promise<T> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Signed out.');

  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    return work(repository, { userId: user.id, localDate, timeZone });
  });

  revalidatePath('/today');
  return result;
}

export async function setFramingAction(input: {
  intention?: string | null;
  inMyControl?: string | null;
  notMyControl?: string | null;
}): Promise<void> {
  await onToday((repository, { userId, localDate, timeZone }) =>
    repository.setFraming(userId, { localDate, timeZone, ...input }),
  );
}

export async function setCommitmentStatusAction(input: {
  commitmentId: string;
  status: 'pending' | 'done' | 'skipped';
  skipReason?: string;
}): Promise<void> {
  await onToday((repository, { userId, localDate }) =>
    repository.setCommitmentStatus(userId, {
      localDate,
      commitmentId: input.commitmentId,
      status: input.status,
      at: new Date(),
      ...(input.skipReason === undefined ? {} : { skipReason: input.skipReason }),
    }),
  );
}

export async function addCommitmentAction(input: {
  kind: CommitmentKind;
  title: string;
  isMinimum?: boolean;
}): Promise<void> {
  const title = input.title.trim();
  if (title.length === 0) throw new Error('A commitment needs a name.');

  await onToday((repository, { userId, localDate, timeZone }) =>
    repository.addCommitment(userId, {
      localDate,
      timeZone,
      commitment: { kind: input.kind, title, isMinimum: input.isMinimum ?? false },
    }),
  );
}

export async function reorderCommitmentsAction(orderedIds: readonly string[]): Promise<void> {
  await onToday((repository, { userId, localDate }) =>
    repository.reorderCommitments(userId, { localDate, orderedIds }),
  );
}

export async function snoozeCommitmentAction(commitmentId: string): Promise<void> {
  await onToday((repository, { userId, localDate, timeZone }) =>
    repository.snoozeCommitment(userId, {
      localDate,
      commitmentId,
      // The next calendar day, not "now plus 24 hours" — those are different
      // days twice a year.
      to: addDays(localDate, 1),
      timeZone,
      at: new Date(),
    }),
  );
}

export async function setMinimumModeAction(on: boolean): Promise<void> {
  await onToday((repository, { userId, localDate, timeZone }) =>
    repository.setMinimumMode(userId, { localDate, timeZone, on, at: new Date() }),
  );
}

export async function commitDayAction(): Promise<void> {
  await onToday((repository, { userId, localDate }) =>
    repository.commitDay(userId, localDate, new Date()),
  );
}

export async function saveDayReviewAction(input: Omit<DayReview, 'localDate'>): Promise<void> {
  await onToday((repository, { userId, localDate, timeZone }) =>
    repository.saveDayReview(userId, { ...input, localDate, timeZone }),
  );
}
