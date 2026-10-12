import { z } from 'zod';

/**
 * One session player, three modes.
 *
 * The brief asks for a consistent player across meditation, breathwork and
 * cognitive practice: preparation, instruction, timer, pause and exit,
 * completion rating, notes, history. That is a single state machine, and this
 * is it — shared so the three screens cannot drift into three different ideas
 * of what "paused" means.
 *
 * Elapsed time is derived from timestamps, exactly as the focus timer does it
 * (D48), because the acceptance criterion here is the same: a session must
 * survive backgrounding and a refresh. A phase that counted ticks would be
 * wrong the moment the phone locked.
 */
export const MIND_KINDS = ['meditation', 'breathwork', 'cognitive'] as const;
export type MindKind = (typeof MIND_KINDS)[number];

export const MIND_STAGES = ['prepare', 'running', 'paused', 'complete'] as const;
export type MindStage = (typeof MIND_STAGES)[number];

export const mindSessionSchema = z.object({
  id: z.string(),
  kind: z.enum(MIND_KINDS),
  practiceSlug: z.string(),
  status: z.enum(['running', 'completed', 'abandoned']),
  startedAt: z.date(),
  endedAt: z.date().nullable().default(null),
  pausedAt: z.date().nullable().default(null),
  accumulatedSeconds: z.number().int().nonnegative().default(0),
  /** The length the user chose, in minutes. Null for a drill counted in items. */
  plannedMinutes: z.number().positive().nullable().default(null),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  reflection: z.string().nullable().default(null),
});
export type MindSession = z.infer<typeof mindSessionSchema>;

/** Seconds of actual practice, as of `now`. Paused time does not count. */
export function practisedSeconds(session: MindSession, now: Date): number {
  if (session.status !== 'running' || session.pausedAt !== null) {
    return session.accumulatedSeconds;
  }
  const live = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
  // A device clock that moved backwards must not produce a negative session.
  return session.accumulatedSeconds + Math.max(0, live);
}

export interface PlayerView {
  readonly stage: MindStage;
  readonly elapsedSeconds: number;
  readonly plannedSeconds: number | null;
  readonly remainingSeconds: number | null;
  readonly ratio: number;
  readonly isOverrun: boolean;
  readonly label: string;
}

export function playerView(session: MindSession | null, now: Date): PlayerView {
  if (session === null) {
    return {
      stage: 'prepare',
      elapsedSeconds: 0,
      plannedSeconds: null,
      remainingSeconds: null,
      ratio: 0,
      isOverrun: false,
      label: 'Ready',
    };
  }

  const elapsed = practisedSeconds(session, now);
  const plannedSeconds =
    session.plannedMinutes === null ? null : Math.round(session.plannedMinutes * 60);
  const remaining = plannedSeconds === null ? null : plannedSeconds - elapsed;

  const stage: MindStage =
    session.status !== 'running' ? 'complete' : session.pausedAt !== null ? 'paused' : 'running';

  return {
    stage,
    elapsedSeconds: elapsed,
    plannedSeconds,
    remainingSeconds: remaining === null ? null : Math.max(0, remaining),
    ratio:
      plannedSeconds === null || plannedSeconds === 0
        ? 0
        : Math.min(1, Math.max(0, elapsed / plannedSeconds)),
    isOverrun: remaining !== null && remaining < 0,
    label:
      stage === 'complete'
        ? session.status === 'completed'
          ? 'Finished'
          : 'Ended early'
        : stage === 'paused'
          ? 'Paused'
          : remaining !== null && remaining < 0
            ? 'Over'
            : 'Running',
  };
}

export function pauseMindPatch(
  session: MindSession,
  now: Date,
): { accumulatedSeconds: number; pausedAt: Date } {
  return { accumulatedSeconds: practisedSeconds(session, now), pausedAt: now };
}

export function resumeMindPatch(now: Date): { startedAt: Date; pausedAt: null } {
  return { startedAt: now, pausedAt: null };
}

export function finishMindPatch(
  session: MindSession,
  now: Date,
  status: 'completed' | 'abandoned',
): {
  accumulatedSeconds: number;
  endedAt: Date;
  pausedAt: null;
  status: 'completed' | 'abandoned';
} {
  return {
    accumulatedSeconds: practisedSeconds(session, now),
    endedAt: now,
    pausedAt: null,
    status,
  };
}

/**
 * How a finished session is described.
 *
 * Leaving early is a legitimate end, not a failure, and the wording is the
 * whole point: "four minutes of eleven" says what happened without implying
 * the other seven were owed.
 */
export function describeOutcome(session: MindSession, now: Date): string {
  const seconds = practisedSeconds(session, now);
  const minutes = Math.max(1, Math.round(seconds / 60));
  const planned = session.plannedMinutes;

  if (session.status === 'abandoned') {
    if (planned === null) return `${minutes} min. Stopping when you need to is fine.`;
    return `${minutes} min of ${Math.round(planned)}. Stopping when you need to is fine.`;
  }

  return `${minutes} min.`;
}

/** The ratings offered after a session, worded as how it went rather than how well. */
export const RATING_LABELS: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = {
  1: 'Hard going',
  2: 'Restless',
  3: 'Ordinary',
  4: 'Settled',
  5: 'Very settled',
};
