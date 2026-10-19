'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/auth';
import { WEEKLY_PROMPTS, type WeeklyPromptKey } from '@/domain';
import { withUser } from '@/persistence';
import { InvalidWriteError } from '@/persistence/repository';
import { resolveCurrentDay } from '../current-day';
import { acceptWeek, proposalFor } from './context';

export type ReflectResult<T> = { ok: true; value: T } | { ok: false; message: string };

const answersSchema = z.object(
  Object.fromEntries(
    WEEKLY_PROMPTS.map((prompt) => [prompt.key, z.string().max(2000).nullable().optional()]),
  ) as Record<WeeklyPromptKey, z.ZodOptional<z.ZodNullable<z.ZodString>>>,
);

export async function saveWeeklyReviewAction(input: {
  week: string;
  answers: unknown;
}): Promise<ReflectResult<Partial<Record<WeeklyPromptKey, string>>>> {
  const parsed = answersSchema.safeParse(input.answers);
  if (!parsed.success) return { ok: false, message: 'Keep each answer under 2000 characters.' };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const week = acceptWeek(input.week, localDate);
    if (week !== input.week)
      return { ok: false as const, message: 'That week cannot be edited here.' };
    try {
      return {
        ok: true as const,
        value: await repository.saveWeeklyReview(user.id, {
          weekStart: week,
          timeZone,
          answers: Object.fromEntries(
            Object.entries(parsed.data).filter(([, value]) => value !== undefined),
          ) as Partial<Record<WeeklyPromptKey, string | null>>,
        }),
      };
    } catch (error) {
      if (error instanceof InvalidWriteError) return { ok: false as const, message: error.message };
      throw error;
    }
  });
  revalidatePath('/reflect');
  return result;
}

/**
 * Adds the proposed items the person ticked. The proposal is recomputed
 * here, so only items it actually proposed can be added, and anything that
 * has since appeared on a day is not added twice.
 */
export async function confirmProposalAction(
  ids: string[],
): Promise<ReflectResult<{ added: number }>> {
  const selected = new Set(z.array(z.string().max(200)).max(60).catch([]).parse(ids));
  if (selected.size === 0) return { ok: false, message: 'Tick at least one thing to add.' };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'You are signed out.' };
  const result = await withUser(user.id, async (repository) => {
    const { localDate, timeZone } = await resolveCurrentDay(repository, user);
    const proposal = await proposalFor(repository, user.id, localDate);
    let added = 0;
    for (const day of proposal.days) {
      for (const item of day.items) {
        if (!selected.has(item.id)) continue;
        await repository.addCommitment(user.id, {
          localDate: day.localDate,
          timeZone,
          commitment: {
            kind: item.kind,
            title: item.title,
            ...(item.refId === null ? {} : { refId: item.refId }),
          },
        });
        added += 1;
      }
    }
    return { ok: true as const, value: { added } };
  });
  revalidatePath('/reflect');
  revalidatePath('/today');
  return result;
}
