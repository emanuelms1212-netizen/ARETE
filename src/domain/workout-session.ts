import { z } from 'zod';
import {
  easierVariant,
  harderVariant,
  isAvailable,
  type Availability,
  type Exercise,
} from './exercise';
import { daysBetween } from './local-day';
import {
  decideProgression,
  type ExercisePerformance,
  type LoggedSet,
  type ProgressionDecision,
  type Target,
} from './progression';
import {
  adaptForReadiness,
  type PlannedSession,
  type Prescription,
  type Readiness,
  type SessionKind,
} from './workout-plan';

/**
 * A workout as it is actually done.
 *
 * When a session starts, the plan for it is copied into a snapshot: the
 * exercises, today's targets and the rule behind each one. Everything after
 * that — logging sets, swapping an exercise, finishing — works on the
 * snapshot. Editing the plan mid-workout therefore cannot move the goalposts
 * of the workout in progress, and a reload shows exactly what was prescribed
 * when the person started.
 */

export interface WorkoutItem extends Prescription {
  readonly target: Target;
  readonly decision: ProgressionDecision;
  readonly rule: string;
  readonly suggestSlug: string | null;
  /** Set when the person swapped this in for something else. */
  readonly substitutedFrom: string | null;
}

export interface WorkoutSnapshot {
  readonly sessionKey: string;
  readonly kind: SessionKind | 'custom';
  readonly title: string;
  readonly readiness: Readiness;
  readonly minimumMode: boolean;
  readonly readinessNote: string | null;
  readonly items: readonly WorkoutItem[];
}

export interface WorkoutSetLog extends LoggedSet {
  readonly exerciseSlug: string;
  readonly block: Prescription['block'];
  readonly formOk: boolean | null;
  readonly notes: string | null;
  readonly substitutedFrom: string | null;
  readonly performedAt: string;
}

export type WorkoutStatus = 'running' | 'completed' | 'abandoned';

export interface WorkoutSession {
  readonly id: string;
  readonly localDate: string;
  readonly status: WorkoutStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly title: string;
  readonly sessionKey: string;
  readonly readiness: Readiness;
  readonly minimumMode: boolean;
  readonly snapshot: WorkoutSnapshot;
  readonly notes: string | null;
  readonly sets: readonly WorkoutSetLog[];
}

/** Validates one logged set. Anything a person can type is checked here. */
export const setLogSchema = z
  .object({
    exerciseSlug: z.string().trim().min(1).max(60),
    setIndex: z.int().min(1).max(20),
    reps: z.int().min(0).max(500).nullable().default(null),
    loadKg: z.number().min(0).max(500).nullable().default(null),
    seconds: z
      .int()
      .min(0)
      .max(6 * 3600)
      .nullable()
      .default(null),
    distanceM: z.number().min(0).max(100_000).nullable().default(null),
    rpe: z.number().min(1).max(10).multipleOf(0.5).nullable().default(null),
    pain: z.int().min(0).max(10).nullable().default(null),
    completed: z.boolean().default(true),
    formOk: z.boolean().nullable().default(null),
    notes: z.string().trim().max(280).nullable().default(null),
  })
  .refine(
    (set) => !set.completed || set.reps !== null || set.seconds !== null || set.distanceM !== null,
    {
      message: 'A completed set needs reps, time or distance.',
      path: ['reps'],
    },
  );

export type SetLogInput = z.input<typeof setLogSchema>;

/** This exercise's past performances, most recent first, from finished sessions only. */
export function performancesFor(
  slug: string,
  sessions: readonly WorkoutSession[],
  before?: string,
): ExercisePerformance[] {
  return sessions
    .filter(
      (session) =>
        session.status === 'completed' && (before === undefined || session.localDate <= before),
    )
    .map((session) => {
      const sets = session.sets
        .filter((set) => set.exerciseSlug === slug)
        .sort((a, b) => a.setIndex - b.setIndex);
      const answered = sets.filter((set) => set.completed).map((set) => set.formOk);
      const formOk =
        answered.length === 0
          ? null
          : answered.some((value) => value === false)
            ? false
            : answered.every((value) => value === true)
              ? true
              : null;
      return {
        session,
        performance: {
          localDate: session.localDate,
          exerciseSlug: slug,
          sets,
          formOk,
        } satisfies ExercisePerformance,
      };
    })
    .filter((entry) => entry.performance.sets.length > 0)
    .sort(
      (a, b) =>
        b.session.localDate.localeCompare(a.session.localDate) ||
        b.session.startedAt.localeCompare(a.session.startedAt),
    )
    .map((entry) => entry.performance);
}

/** Completed workouts in the fourteen days up to and including `onDate`. */
export function recentSessionCount(sessions: readonly WorkoutSession[], onDate: string): number {
  return sessions.filter((session) => {
    if (session.status !== 'completed') return false;
    const age = daysBetween(session.localDate, onDate);
    return age >= 0 && age < 14;
  }).length;
}

function itemFor(
  prescription: Prescription,
  library: readonly Exercise[],
  availability: Availability,
  history: readonly WorkoutSession[],
  substitutedFrom: string | null = null,
): WorkoutItem {
  const exercise = library.find((candidate) => candidate.slug === prescription.exerciseSlug);
  if (!exercise) throw new Error(`Unknown exercise ${prescription.exerciseSlug}`);
  const progression = decideProgression(
    prescription,
    exercise,
    performancesFor(exercise.slug, history),
    {
      harder: harderVariant(exercise, library, availability),
      easier: easierVariant(exercise, library, availability),
    },
  );
  return {
    ...prescription,
    target: progression.target,
    decision: progression.decision,
    rule: progression.rule,
    suggestSlug: progression.suggestSlug,
    substitutedFrom,
  };
}

/** Builds today's workout from the planned session, how the person feels, and their history. */
export function buildWorkout(input: {
  readonly session: PlannedSession;
  readonly readiness: Readiness;
  readonly minimumMode: boolean;
  readonly history: readonly WorkoutSession[];
  readonly library: readonly Exercise[];
  readonly availability: Availability;
}): WorkoutSnapshot {
  const source = input.minimumMode ? input.session.minimum.items : input.session.items;
  const adapted = adaptForReadiness(source, input.readiness);
  return {
    sessionKey: input.session.key,
    kind: input.session.kind,
    title: input.minimumMode ? `${input.session.title} · minimum` : input.session.title,
    readiness: input.readiness,
    minimumMode: input.minimumMode,
    readinessNote: adapted.note,
    items: adapted.items.map((item) => {
      const built = itemFor(item, input.library, input.availability, input.history);
      // Readiness may have taken a set off after progression added one back.
      return input.readiness === 'low'
        ? {
            ...built,
            target: {
              ...built.target,
              sets: Math.min(built.target.sets, item.sets),
              rpe: item.rpe,
            },
          }
        : built;
    }),
  };
}

export class SubstitutionError extends Error {
  override readonly name = 'SubstitutionError';
}

/**
 * Swaps one exercise for another that keeps the same movement pattern.
 *
 * The pattern is the intent of the slot, so a swap that changes it is refused
 * rather than quietly allowed. The new exercise's target is worked out from
 * its own history, not the old one's — a load that suited a goblet squat says
 * nothing about a split squat.
 */
export function substitute(
  snapshot: WorkoutSnapshot,
  fromSlug: string,
  toSlug: string,
  library: readonly Exercise[],
  availability: Availability,
  history: readonly WorkoutSession[],
): WorkoutSnapshot {
  const index = snapshot.items.findIndex((item) => item.exerciseSlug === fromSlug);
  if (index < 0) throw new SubstitutionError(`${fromSlug} is not in this workout.`);
  const from = library.find((exercise) => exercise.slug === fromSlug);
  const to = library.find((exercise) => exercise.slug === toSlug);
  if (!from || !to) throw new SubstitutionError('Unknown exercise.');
  if (from.pattern !== to.pattern) {
    throw new SubstitutionError(
      `${to.name} trains a different movement from ${from.name}, so it cannot stand in for it.`,
    );
  }
  if (snapshot.items.some((item) => item.exerciseSlug === toSlug)) {
    throw new SubstitutionError(`${to.name} is already in this workout.`);
  }
  if (!isAvailable(to, availability)) {
    throw new SubstitutionError(
      `${to.name} needs equipment you have not listed, or loads a region you have flagged.`,
    );
  }

  const original = snapshot.items[index]!;
  const prescription: Prescription = {
    ...original,
    exerciseSlug: to.slug,
    perSide: to.perSide,
    // A timed movement swapped for a counted one, or the reverse, needs its own dose.
    reps: to.measure === 'reps' ? (original.reps ?? { min: 8, max: 12 }) : null,
    seconds: to.measure === 'reps' ? null : (original.seconds ?? 30),
    note: `Swapped in for ${from.name}: same movement, so the session keeps its intent.`,
  };
  const items = [...snapshot.items];
  items[index] = itemFor(
    prescription,
    library,
    availability,
    history,
    original.substitutedFrom ?? from.slug,
  );
  return { ...snapshot, items };
}

/** Seconds of rest left after the last logged set. Derived, never stored. */
export function restRemaining(restSeconds: number, lastSetAt: Date | null, now: Date): number {
  if (lastSetAt === null || restSeconds <= 0) return 0;
  const elapsed = Math.floor((now.getTime() - lastSetAt.getTime()) / 1000);
  return Math.max(0, restSeconds - elapsed);
}

export interface WorkoutSummary {
  readonly setsDone: number;
  readonly setsPlanned: number;
  readonly exercisesTouched: number;
  readonly totalReps: number;
  /** Sum of reps × load. Zero for bodyweight work, and shown only when it is not. */
  readonly volumeKg: number;
  readonly minutes: number | null;
  readonly maxPain: number;
}

export function summariseWorkout(session: WorkoutSession): WorkoutSummary {
  const completed = session.sets.filter((set) => set.completed);
  const end = session.endedAt === null ? null : Date.parse(session.endedAt);
  return {
    setsDone: completed.length,
    setsPlanned: session.snapshot.items
      .filter((item) => item.block === 'primary' || item.block === 'accessory')
      .reduce((sum, item) => sum + item.target.sets, 0),
    exercisesTouched: new Set(completed.map((set) => set.exerciseSlug)).size,
    totalReps: completed.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    volumeKg: Math.round(
      completed.reduce((sum, set) => sum + (set.reps ?? 0) * (set.loadKg ?? 0), 0),
    ),
    minutes:
      end === null ? null : Math.max(1, Math.round((end - Date.parse(session.startedAt)) / 60_000)),
    maxPain: Math.max(0, ...session.sets.map((set) => set.pain ?? 0)),
  };
}

/** One honest sentence about a finished workout. Never a verdict on the person. */
export function describeWorkout(session: WorkoutSession): string {
  const summary = summariseWorkout(session);
  if (session.status === 'abandoned') {
    return summary.setsDone === 0
      ? 'Stopped before any sets. Starting is the hard part, and you started.'
      : `Stopped after ${summary.setsDone} set${summary.setsDone === 1 ? '' : 's'}. Stopping when you need to is part of training.`;
  }
  const parts = [`${summary.setsDone} set${summary.setsDone === 1 ? '' : 's'} logged`];
  if (summary.minutes !== null) parts.push(`${summary.minutes} min`);
  if (summary.volumeKg > 0) parts.push(`${summary.volumeKg.toLocaleString('en-GB')} kg moved`);
  const pain =
    summary.maxPain >= 4 ? ' Pain was logged — next time is lighter for that exercise.' : '';
  return `${parts.join(' · ')}.${session.minimumMode ? ' The minimum counts as a full session.' : ''}${pain}`;
}
