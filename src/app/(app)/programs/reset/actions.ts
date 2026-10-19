'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/auth';
import {
  COLD_NOTICE_VERSION,
  RESET_BREAK_KINDS,
  RESET_CHECKIN_CHOICES,
  RESET_COMPONENTS,
  RESET_LOG_STATUSES,
  adjustIntensity,
  breakProblem,
  daysBetween,
  resetCustomisationSchema,
  type IsoDate,
  type ResetCheckin,
  type ResetLog,
} from '@/domain';
import { withUser } from '@/persistence';
import {
  InvalidWriteError,
  type AreteRepository,
  type ResetEnrolment,
} from '@/persistence/repository';
import { resolveCurrentDay } from '../../current-day';
import { loadResetContext, type ResetContext } from './context';

/**
 * Reset writes. The client says what the person chose; the server works out
 * which programme day it is, what the target was, and whether the write is
 * allowed — the same derivation the page used.
 */
export type ResetResult<T> = { ok: true; value: T } | { ok: false; message: string };

type Scope = { userId: string; today: IsoDate; timeZone: string };

async function run<T>(
  work: (
    repository: AreteRepository,
    scope: Scope,
    context: ResetContext,
  ) => Promise<ResetResult<T>>,
): Promise<ResetResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const context = await loadResetContext(repository, user.id, localDate);
    try {
      return await work(repository, { userId: user.id, today: localDate, timeZone }, context);
    } catch (error) {
      if (error instanceof InvalidWriteError) return { ok: false as const, message: error.message };
      throw error;
    }
  });
  revalidatePath('/programs/reset');
  revalidatePath('/programs');
  revalidatePath('/today');
  return result;
}

const firstIssue = (error: z.ZodError, fallback: string) => error.issues[0]?.message ?? fallback;
const NOT_RUNNING = 'There is no reset running.';

export async function startResetAction(input: {
  startedOn: string;
  customisation: unknown;
}): Promise<ResetResult<ResetEnrolment>> {
  const customisation = resetCustomisationSchema.safeParse(input.customisation);
  if (!customisation.success)
    return { ok: false, message: firstIssue(customisation.error, 'Check the settings.') };
  return run(async (repository, { userId, today, timeZone }, context) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startedOn))
      return { ok: false, message: 'Choose a start date.' };
    const ahead = daysBetween(today, input.startedOn);
    if (ahead < 0 || ahead > 28)
      return { ok: false, message: 'Start today or within the next four weeks.' };
    if (customisation.data.enabled.cold && !context.coldAcknowledged)
      return { ok: false, message: 'Read the cold-water note before turning that on.' };
    return {
      ok: true,
      value: await repository.startReset(userId, {
        startedOn: input.startedOn,
        timeZone,
        customisation: customisation.data,
      }),
    };
  });
}

export async function updateResetAction(
  customisation: unknown,
): Promise<ResetResult<ResetEnrolment>> {
  const parsed = resetCustomisationSchema.safeParse(customisation);
  if (!parsed.success)
    return { ok: false, message: firstIssue(parsed.error, 'Check the settings.') };
  return run(async (repository, { userId }, context) => {
    if (!context.enrolment) return { ok: false, message: NOT_RUNNING };
    if (parsed.data.enabled.cold && !context.coldAcknowledged)
      return { ok: false, message: 'Read the cold-water note before turning that on.' };
    if (!parsed.data.includeExtension && context.enrolment.customisation.includeExtension) {
      const day = context.state && 'programDay' in context.state ? context.state.programDay : 0;
      if (day > 60) return { ok: false, message: 'The extension week has already started.' };
    }
    return {
      ok: true,
      value: await repository.updateResetCustomisation(userId, context.enrolment.id, parsed.data),
    };
  });
}

export async function acknowledgeColdAction(): Promise<ResetResult<null>> {
  return run(async (repository, { userId }) => {
    await repository.acknowledgeSafety(userId, {
      topic: 'cold_exposure',
      version: COLD_NOTICE_VERSION,
      at: new Date(),
    });
    return { ok: true, value: null };
  });
}

const logSchema = z.object({
  component: z.enum(RESET_COMPONENTS),
  status: z.enum(RESET_LOG_STATUSES).nullable(),
});

/** Marks today's item done or not today; `null` clears it. Only today, only a target that exists today. */
export async function logResetItemAction(input: unknown): Promise<ResetResult<ResetLog | null>> {
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That item does not look right.' };
  return run(async (repository, { userId, today, timeZone }, context) => {
    if (!context.enrolment) return { ok: false, message: NOT_RUNNING };
    const state = context.state;
    if (!state || (state.kind !== 'active' && state.kind !== 'sick'))
      return { ok: false, message: 'There is nothing to log today.' };
    const target = context.targets.find((entry) => entry.component === parsed.data.component);
    if (!target) return { ok: false, message: 'That is not part of today.' };
    if (parsed.data.status === null) {
      await repository.clearResetItem(userId, {
        enrolmentId: context.enrolment.id,
        localDate: today,
        component: parsed.data.component,
      });
      return { ok: true, value: null };
    }
    return {
      ok: true,
      value: await repository.logResetItem(userId, {
        enrolmentId: context.enrolment.id,
        localDate: today,
        timeZone,
        programDay: Math.max(1, state.programDay),
        component: parsed.data.component,
        status: parsed.data.status,
        targetText: target.text,
      }),
    };
  });
}

const breakSchema = z.object({
  kind: z.enum(RESET_BREAK_KINDS),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function addBreakAction(input: unknown): Promise<ResetResult<ResetEnrolment>> {
  const parsed = breakSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose the dates.' };
  return run(async (repository, { userId, today }, context) => {
    if (!context.enrolment) return { ok: false, message: NOT_RUNNING };
    const problem = breakProblem(context.enrolment.breaks, parsed.data, today);
    if (problem) return { ok: false, message: problem };
    return {
      ok: true,
      value: await repository.addResetBreak(userId, context.enrolment.id, parsed.data),
    };
  });
}

/** Resume today: the break ends yesterday, or disappears if it had not begun. */
export async function endBreakAction(breakId: string): Promise<ResetResult<ResetEnrolment>> {
  return run(async (repository, { userId, today }, context) => {
    if (!context.enrolment) return { ok: false, message: NOT_RUNNING };
    return {
      ok: true,
      value: await repository.endResetBreak(userId, context.enrolment.id, breakId, today),
    };
  });
}

const checkinSchema = z.object({
  choice: z.enum(RESET_CHECKIN_CHOICES),
  note: z.string().trim().max(500).nullable(),
});

export async function saveCheckinAction(input: unknown): Promise<ResetResult<ResetCheckin>> {
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose how next week should go.' };
  return run(async (repository, { userId, today, timeZone }, context) => {
    if (!context.enrolment || context.checkinDue === null)
      return { ok: false, message: 'No check-in is due.' };
    const checkin = await repository.saveResetCheckin(userId, context.enrolment.id, {
      programWeek: context.checkinDue,
      choice: parsed.data.choice,
      note: parsed.data.note || null,
    });
    const intensity = adjustIntensity(context.enrolment.customisation.intensity, checkin.choice);
    if (intensity !== context.enrolment.customisation.intensity) {
      await repository.updateResetCustomisation(userId, context.enrolment.id, {
        ...context.enrolment.customisation,
        intensity,
      });
    }
    // The check-in is the weekly reflection: if today asks for one, it is done.
    const weekly = context.targets.find((target) => target.component === 'weekly');
    if (weekly && context.state?.kind === 'active') {
      await repository.logResetItem(userId, {
        enrolmentId: context.enrolment.id,
        localDate: today,
        timeZone,
        programDay: context.state.programDay,
        component: 'weekly',
        status: 'done',
        targetText: weekly.text,
      });
    }
    return { ok: true, value: checkin };
  });
}

export async function finishResetAction(
  choice: 'extend' | 'finish' | 'again' | 'end',
): Promise<ResetResult<ResetEnrolment>> {
  return run(async (repository, { userId, today, timeZone }, context) => {
    const enrolment = context.enrolment;
    if (!enrolment) return { ok: false, message: NOT_RUNNING };
    if (choice === 'end') {
      return {
        ok: true,
        value: await repository.endReset(userId, enrolment.id, 'ended', new Date()),
      };
    }
    if (context.state?.kind !== 'complete')
      return { ok: false, message: 'The programme is not finished yet.' };
    if (choice === 'extend') {
      if (enrolment.customisation.includeExtension)
        return { ok: false, message: 'The extension week is already included.' };
      return {
        ok: true,
        value: await repository.updateResetCustomisation(userId, enrolment.id, {
          ...enrolment.customisation,
          includeExtension: true,
        }),
      };
    }
    await repository.endReset(userId, enrolment.id, 'finished', new Date());
    if (choice === 'finish') return { ok: true, value: { ...enrolment, status: 'finished' } };
    return {
      ok: true,
      value: await repository.startReset(userId, {
        startedOn: today,
        timeZone,
        customisation: { ...enrolment.customisation, includeExtension: false },
      }),
    };
  });
}
