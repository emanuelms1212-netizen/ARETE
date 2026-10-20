import { z } from 'zod';

/**
 * The focus timer, as facts rather than as a number that ticks.
 *
 * The acceptance criterion for this stage is that a refresh does not lose the
 * timer. The way to fail that is to store `secondsRemaining` and decrement it
 * on an interval: a reload, a backgrounded tab, a locked phone or a second
 * window each produce a different answer, and none of them is right.
 *
 * So nothing here stores elapsed time. A session stores when it started, how
 * many seconds were banked by earlier run segments, and whether it is paused
 * right now. Elapsed is derived from those three and the current instant, so
 * every tab, every refresh and the server itself compute the same answer — and
 * the interval in the UI becomes a thing that re-renders rather than a thing
 * that counts.
 */
export const FOCUS_KINDS = ['work', 'break'] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];

export const FOCUS_STATUSES = ['running', 'completed', 'abandoned'] as const;
export type FocusStatus = (typeof FOCUS_STATUSES)[number];

/**
 * Presets, with the classic one first.
 *
 * `deep` exists because 25 minutes is too short for some work and saying so is
 * kinder than watching someone abandon six sessions in a row.
 */
export const FOCUS_PRESETS = [
  { slug: 'classic', label: 'Classic', workMinutes: 25, breakMinutes: 5 },
  { slug: 'short', label: 'Short', workMinutes: 15, breakMinutes: 3 },
  { slug: 'deep', label: 'Deep', workMinutes: 50, breakMinutes: 10 },
] as const;
export type FocusPreset = (typeof FOCUS_PRESETS)[number];

export function presetBySlug(slug: string | null): FocusPreset | null {
  if (slug === null) return null;
  return FOCUS_PRESETS.find((preset) => preset.slug === slug) ?? null;
}

export const focusSessionSchema = z.object({
  id: z.string(),
  kind: z.enum(FOCUS_KINDS),
  status: z.enum(FOCUS_STATUSES),
  plannedMinutes: z.number().int().positive(),
  startedAt: z.date(),
  endedAt: z.date().nullable().default(null),
  /** The instant the current run segment was paused, or null while running. */
  pausedAt: z.date().nullable().default(null),
  /** Seconds banked by earlier run segments. Never includes the live one. */
  accumulatedSeconds: z.number().int().nonnegative().default(0),
  interruptions: z.number().int().nonnegative().default(0),
  taskId: z.string().nullable().default(null),
  taskTitleSnapshot: z.string().nullable().default(null),
  goalId: z.string().nullable().default(null),
  goalTitleSnapshot: z.string().nullable().default(null),
  preset: z.string().nullable().default(null),
  reflection: z.string().nullable().default(null),
});
export type FocusSession = z.infer<typeof focusSessionSchema>;

export interface TimerView {
  readonly elapsedSeconds: number;
  readonly plannedSeconds: number;
  readonly remainingSeconds: number;
  /** 0–1, clamped, for the ring. */
  readonly ratio: number;
  readonly isPaused: boolean;
  readonly isRunning: boolean;
  /** True once the planned time is reached; the session does not stop itself. */
  readonly isOvertime: boolean;
  readonly overtimeSeconds: number;
  readonly label: string;
}

/**
 * Seconds of actual focus, as of `now`.
 *
 * This is the whole mechanism. A paused session contributes nothing for the
 * time it spent paused, and a finished one is frozen at the moment it ended.
 */
export function elapsedSeconds(session: FocusSession, now: Date): number {
  if (session.status !== 'running') return session.accumulatedSeconds;

  if (session.pausedAt !== null) return session.accumulatedSeconds;

  const live = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
  // A clock that has gone backwards — a device correcting its time, a session
  // restored from a clock-skewed machine — must not produce a negative timer.
  return session.accumulatedSeconds + Math.max(0, live);
}

/** Everything the timer UI needs, computed rather than remembered. */
export function timerView(session: FocusSession, now: Date): TimerView {
  const elapsed = elapsedSeconds(session, now);
  const plannedSeconds = session.plannedMinutes * 60;
  const remaining = plannedSeconds - elapsed;
  const isPaused = session.status === 'running' && session.pausedAt !== null;

  return {
    elapsedSeconds: elapsed,
    plannedSeconds,
    remainingSeconds: Math.max(0, remaining),
    ratio: plannedSeconds === 0 ? 1 : Math.min(1, Math.max(0, elapsed / plannedSeconds)),
    isPaused,
    isRunning: session.status === 'running' && !isPaused,
    isOvertime: remaining < 0,
    overtimeSeconds: Math.max(0, -remaining),
    label:
      session.status !== 'running'
        ? session.status === 'completed'
          ? 'Finished'
          : 'Stopped'
        : isPaused
          ? 'Paused'
          : remaining < 0
            ? 'Over'
            : 'Running',
  };
}

/** mm:ss, or h:mm:ss past an hour. Used by the UI and by the tests. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(rest).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Pausing: bank the live segment, then stop the clock.
 *
 * Returned as a patch rather than applied, so the same arithmetic runs in the
 * repository (which writes it) and in the tests (which check it).
 */
export function pausePatch(
  session: FocusSession,
  now: Date,
): { accumulatedSeconds: number; pausedAt: Date; interruptions: number } {
  return {
    accumulatedSeconds: elapsedSeconds(session, now),
    pausedAt: now,
    interruptions: session.interruptions + 1,
  };
}

/**
 * Resuming: restart the clock from now, keeping what was banked.
 *
 * `startedAt` moves, which is why nothing may derive the session's age from
 * it. Age comes from `created_at`; this field is the start of the *current*
 * run segment.
 */
export function resumePatch(now: Date): { startedAt: Date; pausedAt: null } {
  return { startedAt: now, pausedAt: null };
}

export function finishPatch(
  session: FocusSession,
  now: Date,
  status: Extract<FocusStatus, 'completed' | 'abandoned'>,
): { accumulatedSeconds: number; endedAt: Date; pausedAt: null; status: FocusStatus } {
  return {
    accumulatedSeconds: elapsedSeconds(session, now),
    endedAt: now,
    pausedAt: null,
    status,
  };
}

/**
 * Should this session be counted as a real focus session?
 *
 * A session abandoned after nine seconds is noise in the history, and a
 * history full of noise is one nobody reads. The threshold is deliberately
 * generous: a minute of real work is real work.
 */
export const MINIMUM_COUNTED_SECONDS = 60;

export function countsAsFocus(session: FocusSession, now: Date): boolean {
  return session.kind === 'work' && elapsedSeconds(session, now) >= MINIMUM_COUNTED_SECONDS;
}

/** What the session was for, in the words it was linked with. */
export function describeLink(session: FocusSession): string {
  if (session.taskTitleSnapshot !== null) return session.taskTitleSnapshot;
  if (session.goalTitleSnapshot !== null) return session.goalTitleSnapshot;
  return 'Unlinked';
}

/**
 * What a screen reader hears about a running timer.
 *
 * A live region that held the clock would be read out every second. This
 * changes only every five minutes, then once for the last minute and once at
 * the end — often enough to know where you are, rarely enough to ignore.
 */
export function timerAnnouncement(remainingSeconds: number, overtimeSeconds = 0): string {
  if (overtimeSeconds > 0 || remainingSeconds <= 0) return 'Time is up.';
  if (remainingSeconds <= 60) return 'Less than a minute remaining.';
  const minutes = Math.ceil(remainingSeconds / 60);
  const rounded = Math.ceil(minutes / 5) * 5;
  return `About ${rounded} minutes remaining.`;
}
