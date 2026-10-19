'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth';
import {
  WARMUP_CHOICES,
  checkinSchema,
  clientToken,
  flexItemSchema,
  flexWeekdaysSchema,
  type FlexEnrolment,
  type FlexItemRecord,
  type FlexSessionRecord,
  type StoredCheckin,
  type WarmupChoice,
} from '@/domain';
import { isDemoMode } from '@/lib/env';
import { withUser } from '@/persistence';
import { InvalidWriteError, type AreteRepository } from '@/persistence/repository';
import { resolveCurrentDay } from '../../current-day';
import { loadFlexContext } from './context';

/**
 * Flexibility writes.
 *
 * The client names a session by week and day and says what happened; the
 * server decides whether that session exists, is open, and may be started by
 * this person. A severe flag refuses a start here as well as on the screen.
 */
export type FlexResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function account() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Signed out.');
  return user;
}

function refusal(error: unknown): { ok: false; message: string } {
  if (error instanceof InvalidWriteError) return { ok: false, message: error.message };
  throw error;
}

async function withContext<T>(
  work: (
    repository: AreteRepository,
    scope: { userId: string; localDate: string; timeZone: string },
    context: Awaited<ReturnType<typeof loadFlexContext>>,
  ) => Promise<FlexResult<T>>,
): Promise<FlexResult<T>> {
  const user = await account();
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const context = await loadFlexContext(repository, user.id, localDate);
    try {
      return await work(repository, { userId: user.id, localDate, timeZone }, context);
    } catch (error) {
      return refusal(error);
    }
  });
  revalidatePath('/train/flexibility');
  return result;
}

export async function enrolFlexAction(input: {
  weekdays: number[];
  baseline: unknown;
}): Promise<FlexResult<FlexEnrolment>> {
  const weekdays = flexWeekdaysSchema.safeParse(input.weekdays);
  if (!weekdays.success)
    return { ok: false, message: weekdays.error.issues[0]?.message ?? 'Pick three days.' };
  const baseline =
    input.baseline === null
      ? null
      : checkinSchema.safeParse({ ...(input.baseline as object), week: 0 });
  if (baseline && !baseline.success)
    return { ok: false, message: 'The baseline check-in needs another look.' };

  return withContext(async (repository, { userId, localDate }, context) => {
    if (!context.program) return { ok: false, message: 'No programme is available yet.' };
    if (context.eligibility.kind === 'professional')
      return { ok: false, message: context.eligibility.message };
    const enrolment = await repository.enrolFlex(userId, {
      programSlug: context.program.slug,
      startedOn: localDate,
      weekdays: weekdays.data,
      at: new Date(),
      includeRightsPending: isDemoMode,
    });
    if (baseline?.success) {
      await repository.saveFlexCheckin(userId, {
        enrolmentId: enrolment.id,
        localDate,
        checkin: baseline.data,
      });
    }
    return { ok: true, value: enrolment };
  });
}

export async function setFlexScheduleAction(
  weekdays: number[],
): Promise<FlexResult<FlexEnrolment>> {
  const parsed = flexWeekdaysSchema.safeParse(weekdays);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Pick three days.' };
  return withContext(async (repository, { userId }, context) => {
    if (!context.enrolment) return { ok: false, message: 'Start the programme first.' };
    return {
      ok: true,
      value: await repository.setFlexSchedule(userId, context.enrolment.id, parsed.data),
    };
  });
}

export async function startFlexSessionAction(input: {
  week: number;
  day: number;
  attemptToken: string;
}): Promise<FlexResult<FlexSessionRecord>> {
  return withContext(async (repository, { userId, localDate, timeZone }, context) => {
    if (!context.enrolment) return { ok: false, message: 'Start the programme first.' };
    if (context.eligibility.kind === 'professional')
      return { ok: false, message: context.eligibility.message };
    const value = await repository.startFlexSession(userId, {
      enrolmentId: context.enrolment.id,
      week: input.week,
      day: input.day,
      localDate,
      timeZone,
      startedAt: new Date(),
      clientToken: clientToken('flex-start', input.attemptToken),
    });
    return { ok: true, value };
  });
}

export async function updateFlexSessionAction(input: {
  sessionId: string;
  warmup?: WarmupChoice;
  items?: FlexItemRecord[];
  notes?: string | null;
}): Promise<FlexResult<FlexSessionRecord>> {
  if (input.warmup !== undefined && !WARMUP_CHOICES.includes(input.warmup)) {
    return { ok: false, message: 'Unknown warm-up.' };
  }
  const items = input.items?.map((item) => flexItemSchema.safeParse(item));
  if (items?.some((item) => !item.success))
    return { ok: false, message: 'That record does not look right.' };

  return withContext(async (repository, { userId }, context) => {
    if (!context.running || context.running.id !== input.sessionId) {
      return { ok: false, message: 'That session is no longer running.' };
    }
    const value = await repository.updateFlexSession(userId, input.sessionId, {
      ...(input.warmup === undefined ? {} : { warmup: input.warmup }),
      ...(items === undefined ? {} : { items: items.map((item) => item.data!) }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    });
    return { ok: true, value };
  });
}

export async function finishFlexSessionAction(input: {
  sessionId: string;
  status: 'completed' | 'stopped';
  painNote?: string | null;
  notes?: string | null;
}): Promise<FlexResult<FlexSessionRecord>> {
  if (input.status !== 'completed' && input.status !== 'stopped')
    return { ok: false, message: 'Unknown outcome.' };
  const result = await withContext(async (repository, { userId, localDate }, context) => {
    if (!context.running || context.running.id !== input.sessionId) {
      return { ok: false, message: 'That session is no longer running.' };
    }
    const value = await repository.finishFlexSession(userId, {
      sessionId: input.sessionId,
      status: input.status,
      at: new Date(),
      painNote: input.painNote ?? null,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    });
    // A finished session is the day's mobility commitment done — the same
    // fact, recorded once.
    if (value.status === 'completed') {
      const day = await repository.getDay(userId, localDate);
      const commitment = day?.commitments.find(
        (item) => item.kind === 'mobility' && item.status !== 'done',
      );
      if (day && commitment) {
        await repository.setCommitmentStatus(userId, {
          localDate,
          commitmentId: commitment.id,
          status: 'done',
          at: new Date(),
        });
      }
    }
    return { ok: true, value };
  });
  revalidatePath('/today');
  return result;
}

export async function skipFlexSessionAction(input: {
  week: number;
  day: number;
  reason: string;
}): Promise<FlexResult<FlexSessionRecord>> {
  const reason = input.reason.trim().slice(0, 200);
  if (reason.length === 0) return { ok: false, message: 'A skip needs a reason.' };
  return withContext(async (repository, { userId, localDate, timeZone }, context) => {
    if (!context.enrolment) return { ok: false, message: 'Start the programme first.' };
    const value = await repository.skipFlexSession(userId, {
      enrolmentId: context.enrolment.id,
      week: input.week,
      day: input.day,
      localDate,
      timeZone,
      reason,
      at: new Date(),
    });
    return { ok: true, value };
  });
}

export async function saveFlexCheckinAction(input: unknown): Promise<FlexResult<StoredCheckin>> {
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'The check-in needs another look.' };
  return withContext(async (repository, { userId, localDate }, context) => {
    if (!context.enrolment) return { ok: false, message: 'Start the programme first.' };
    const value = await repository.saveFlexCheckin(userId, {
      enrolmentId: context.enrolment.id,
      localDate,
      checkin: parsed.data,
    });
    return { ok: true, value };
  });
}

export async function endFlexProgramAction(): Promise<FlexResult<FlexEnrolment>> {
  return withContext(async (repository, { userId }, context) => {
    if (!context.enrolment) return { ok: false, message: 'There is no programme running.' };
    const status = context.state?.finished ? 'completed' : 'ended';
    return {
      ok: true,
      value: await repository.endFlexEnrolment(userId, context.enrolment.id, status, new Date()),
    };
  });
}
