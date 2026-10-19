'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/auth';
import {
  CONTRAST_NOTICE_VERSION,
  CONTRAST_STOP_REASONS,
  contrastPhases,
  contrastProtocolSchema,
  contrastScreeningSchema,
  type ContrastScreening,
  type ContrastSessionRecord,
} from '@/domain';
import { withUser } from '@/persistence';
import { InvalidWriteError, type AreteRepository } from '@/persistence/repository';
import { resolveCurrentDay } from '../../current-day';
import { loadContrastContext, type ContrastContext } from './context';

/**
 * Contrast writes. Every session is checked against the same eligibility the
 * page shows: a minor, a missing screening, an unacknowledged notice or an
 * uncleared flag refuses here too.
 */
export type ContrastResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function run<T>(
  work: (
    repository: AreteRepository,
    scope: { userId: string; today: string; timeZone: string },
    context: ContrastContext,
  ) => Promise<ContrastResult<T>>,
): Promise<ContrastResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const context = await loadContrastContext(repository, user.id, localDate);
    try {
      return await work(repository, { userId: user.id, today: localDate, timeZone }, context);
    } catch (error) {
      if (error instanceof InvalidWriteError) return { ok: false as const, message: error.message };
      throw error;
    }
  });
  revalidatePath('/programs/contrast');
  revalidatePath('/programs');
  return result;
}

/** Saves the screening and, with it, the acknowledgement of the current notice. */
export async function saveScreeningAction(input: {
  screening: unknown;
  acknowledged: boolean;
}): Promise<ContrastResult<ContrastScreening>> {
  const parsed = contrastScreeningSchema.safeParse(input.screening);
  if (!parsed.success) return { ok: false, message: 'Answer every question.' };
  if (!input.acknowledged) return { ok: false, message: 'Read and acknowledge the safety notice.' };
  return run(async (repository, { userId }, context) => {
    if (context.minor)
      return { ok: false, message: 'Contrast therapy is not offered to anyone under 18.' };
    const saved = await repository.saveContrastScreening(userId, parsed.data);
    await repository.acknowledgeSafety(userId, {
      topic: 'contrast_therapy',
      version: CONTRAST_NOTICE_VERSION,
      at: new Date(),
    });
    return { ok: true, value: saved };
  });
}

const sessionSchema = z.object({
  protocol: contrastProtocolSchema,
  phasesCompleted: z.int().min(0).max(8),
  status: z.enum(['completed', 'stopped']),
  stopReason: z.enum(CONTRAST_STOP_REASONS).nullable(),
  startedAt: z.iso.datetime(),
  attemptToken: z.string().min(8).max(80),
});

export async function recordSessionAction(
  input: unknown,
): Promise<ContrastResult<ContrastSessionRecord>> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That session does not look right.' };
  const { protocol, phasesCompleted, status, stopReason, startedAt, attemptToken } = parsed.data;
  if (phasesCompleted > contrastPhases(protocol).length)
    return { ok: false, message: 'That session does not look right.' };
  return run(async (repository, { userId, today, timeZone }, context) => {
    if (context.eligibility.kind !== 'ok') {
      return {
        ok: false,
        message:
          context.eligibility.kind === 'refused'
            ? context.eligibility.reason
            : 'A flagged answer needs a clinician’s clearance first.',
      };
    }
    const endedAt = new Date().toISOString();
    return {
      ok: true,
      value: await repository.recordContrastSession(userId, {
        localDate: today,
        timeZone,
        protocol,
        phasesCompleted,
        status,
        stopReason: status === 'stopped' ? (stopReason ?? 'other') : null,
        startedAt: startedAt < endedAt ? startedAt : endedAt,
        endedAt,
        clientToken: `contrast:${attemptToken}`,
      }),
    };
  });
}

export async function disableContrastAction(input: {
  deleteSessions: boolean;
}): Promise<ContrastResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.disableContrast(userId);
    if (input.deleteSessions) await repository.deleteContrastSessions(userId);
    return { ok: true, value: null };
  });
}
