import type { Exercise } from './exercise';
import type { Prescription } from './workout-plan';

/**
 * Conservative progression, with the rule said out loud.
 *
 * One function decides what the next session asks for, from what the last one
 * recorded. It is deliberately boring: load goes up only when every set
 * reached the top of the range, the effort stayed at or under target, and the
 * person said their form held. Reps go up one at a time before load does. Any
 * pain of 4/10 or more takes load off; any pain at all stops it going up.
 * Two hard sessions in a row with fewer reps the second time is a deload.
 *
 * The first matching rule wins, and every result carries the sentence the
 * screen shows, so "why is it 22 kg today?" always has an answer.
 */

export interface LoggedSet {
  readonly setIndex: number;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly seconds: number | null;
  readonly distanceM: number | null;
  /** How hard it felt, 1–10. */
  readonly rpe: number | null;
  /** 0 = none, 10 = worst imaginable. */
  readonly pain: number | null;
  readonly completed: boolean;
}

export interface ExercisePerformance {
  readonly localDate: string;
  readonly exerciseSlug: string;
  readonly sets: readonly LoggedSet[];
  /** The person's own call: did form hold on every set? Null if not answered. */
  readonly formOk: boolean | null;
}

export type ProgressionDecision =
  | 'start'
  | 'increase_load'
  | 'increase_reps'
  | 'add_set'
  | 'harder_variant'
  | 'increase_time'
  | 'hold'
  | 'reduce'
  | 'deload';

export interface Target {
  readonly sets: number;
  readonly reps: { readonly min: number; readonly max: number } | null;
  /** The number to aim for on every set this time. */
  readonly repsGoal: number | null;
  /** Null when bodyweight, or when the person has not logged a load yet. */
  readonly loadKg: number | null;
  readonly seconds: number | null;
  readonly rpe: number | null;
}

export interface Progression {
  readonly decision: ProgressionDecision;
  readonly target: Target;
  /** One or two sentences: what changed and why. */
  readonly rule: string;
  /** Set when the person is ready for a harder or easier exercise. */
  readonly suggestSlug: string | null;
}

export const PAIN_STOP = 4;
const MAX_SETS = 4;

function roundTo(value: number, step: number, mode: 'nearest' | 'down'): number {
  const scaled = value / step;
  const rounded = mode === 'down' ? Math.floor(scaled + 1e-9) : Math.round(scaled);
  return Math.round(rounded * step * 100) / 100;
}

function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}

const done = (sets: readonly LoggedSet[]) => sets.filter((set) => set.completed);
const maxOf = (values: readonly (number | null)[]) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : Math.max(...present);
};
const minOf = (values: readonly (number | null)[]) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : Math.min(...present);
};
const totalReps = (sets: readonly LoggedSet[]) =>
  done(sets).reduce((sum, set) => sum + (set.reps ?? 0), 0);
const meanRpe = (sets: readonly LoggedSet[]) => {
  const values = done(sets)
    .map((set) => set.rpe)
    .filter((value): value is number => value !== null);
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
};

export function baseTarget(prescription: Prescription): Target {
  return {
    sets: prescription.sets,
    reps: prescription.reps,
    repsGoal: prescription.reps?.min ?? null,
    loadKg: null,
    seconds: prescription.seconds,
    rpe: prescription.rpe,
  };
}

/**
 * Decides today's target for one exercise.
 *
 * `history` is this exercise's past sessions, most recent first. Only the
 * last two are ever read: progression responds to what just happened, not to
 * a trend that would need explaining.
 */
export function decideProgression(
  prescription: Prescription,
  exercise: Exercise,
  history: readonly ExercisePerformance[],
  options: { readonly harder?: Exercise | null; readonly easier?: Exercise | null } = {},
): Progression {
  const base = baseTarget(prescription);
  const last = history[0];

  // Warm-ups and cool-downs do not progress. They are there to be done.
  if (prescription.block === 'warmup' || prescription.block === 'cooldown') {
    return {
      decision: 'hold',
      target: base,
      rule: 'Warm-up and cool-down stay the same every time.',
      suggestSlug: null,
    };
  }

  if (!last || done(last.sets).length === 0) {
    return {
      decision: 'start',
      target: base,
      rule: exercise.loadable
        ? 'First time: choose a load that leaves two or three reps in reserve at the bottom of the range. Log it, and the next session builds from there.'
        : 'First time: aim for the bottom of the range with good form, and log how it felt.',
      suggestSlug: null,
    };
  }

  const sets = done(last.sets);
  const lastLoad = maxOf(sets.map((set) => set.loadKg));
  const lastTarget: Target = { ...base, loadKg: lastLoad };
  const pain = maxOf(last.sets.map((set) => set.pain)) ?? 0;
  const topRpe = maxOf(sets.map((set) => set.rpe));
  const increment = exercise.incrementKg ?? 0;

  // 1. Pain at or above the line: take something off.
  if (pain >= PAIN_STOP) {
    const easier = options.easier ?? null;
    let target: Target = lastTarget;
    let change: string;
    if (lastLoad !== null && lastLoad > 0 && exercise.loadable && increment > 0) {
      const lighter = roundTo(lastLoad * 0.9, increment, 'down');
      target = {
        ...lastTarget,
        loadKg: Math.max(0, lighter === lastLoad ? lastLoad - increment : lighter),
      };
      change = `the load drops to ${formatKg(target.loadKg ?? 0)}`;
    } else if (exercise.measure === 'time' && base.seconds !== null) {
      const lastSeconds = maxOf(sets.map((set) => set.seconds)) ?? base.seconds;
      target = { ...lastTarget, seconds: Math.max(10, Math.round((lastSeconds * 0.75) / 5) * 5) };
      change = `the time drops to ${target.seconds} s`;
    } else {
      target = {
        ...lastTarget,
        repsGoal: base.reps?.min ?? null,
        sets: Math.max(1, base.sets - 1),
      };
      change = 'there is one set fewer, at the bottom of the rep range';
    }
    return {
      decision: 'reduce',
      target,
      rule: `Pain reached ${pain}/10 last time, so ${change}.${easier ? ` If it hurts again, swap to ${easier.name}.` : ' If it hurts again, skip it and say so.'}`,
      suggestSlug: easier?.slug ?? null,
    };
  }

  // 2. Two hard sessions in a row, with fewer reps the second time: deload.
  const previous = history[1];
  if (previous && exercise.measure === 'reps') {
    const nowRpe = meanRpe(last.sets);
    const thenRpe = meanRpe(previous.sets);
    if (
      nowRpe !== null &&
      thenRpe !== null &&
      nowRpe >= 9 &&
      thenRpe >= 9 &&
      totalReps(last.sets) < totalReps(previous.sets)
    ) {
      const target =
        lastLoad !== null && exercise.loadable && increment > 0
          ? {
              ...lastTarget,
              loadKg: roundTo(lastLoad * 0.9, increment, 'down'),
              repsGoal: base.reps?.min ?? null,
            }
          : { ...lastTarget, sets: Math.max(1, base.sets - 1), repsGoal: base.reps?.min ?? null };
      return {
        decision: 'deload',
        target,
        rule: 'Two sessions in a row felt very hard, and reps went down. A lighter session lets you recover; it moves up again from there.',
        suggestSlug: null,
      };
    }
  }

  // 3. Any discomfort at all: hold.
  if (pain > 0) {
    return {
      decision: 'hold',
      target: { ...lastTarget, repsGoal: minOf(sets.map((set) => set.reps)) ?? base.repsGoal },
      rule: `Some discomfort (${pain}/10) last time, so it holds steady rather than adding. It moves again after a pain-free session.`,
      suggestSlug: null,
    };
  }

  // 4. Not every set done: same again.
  if (sets.length < base.sets) {
    return {
      decision: 'hold',
      target: { ...lastTarget, repsGoal: minOf(sets.map((set) => set.reps)) ?? base.repsGoal },
      rule: `Last time ${sets.length} of ${base.sets} sets were done. Same again until all of them are.`,
      suggestSlug: null,
    };
  }

  const targetRpe = base.rpe ?? 7;
  const effortKnown = topRpe !== null;
  const effortOk = topRpe !== null && topRpe <= targetRpe;

  // 5. Timed work: a little longer, at most 10% (and at least 5 s).
  if (exercise.measure === 'time' || exercise.measure === 'distance') {
    const lastSeconds = minOf(sets.map((set) => set.seconds));
    const goal = base.seconds ?? 0;
    if (lastSeconds !== null && lastSeconds >= goal && effortOk) {
      const longer =
        goal >= 600
          ? Math.round((lastSeconds * 1.1) / 60) * 60
          : lastSeconds + Math.max(5, Math.round((lastSeconds * 0.1) / 5) * 5);
      return {
        decision: 'increase_time',
        target: { ...lastTarget, seconds: longer },
        rule:
          goal >= 600
            ? `Every minute done at an easy effort, so it grows by about 10% to ${Math.round(longer / 60)} minutes. Never more than that in a week.`
            : `Every set held for the full time at RPE ${topRpe} or easier, so it grows to ${longer} s.`,
        suggestSlug: null,
      };
    }
    return {
      decision: 'hold',
      target: { ...lastTarget, seconds: Math.max(goal, lastSeconds ?? goal) },
      rule: effortKnown
        ? 'Last time was short of the full time or harder than the target effort. Same again.'
        : 'Log how hard it felt (RPE) so the time can grow when it is ready.',
      suggestSlug: null,
    };
  }

  // Rep-counted work from here.
  const range = base.reps ?? { min: 8, max: 12 };
  const fewest = minOf(sets.map((set) => set.reps)) ?? 0;
  const allAtTop = sets.every((set) => (set.reps ?? 0) >= range.max);
  const allInRange = sets.every((set) => (set.reps ?? 0) >= range.min);

  // 6. Top of the range, effort at or under target, form held: move up.
  if (allAtTop) {
    if (!effortKnown) {
      return {
        decision: 'hold',
        target: { ...lastTarget, repsGoal: range.max },
        rule: 'You reached the top of the range. Log how hard it felt (RPE) so it can move up next time.',
        suggestSlug: null,
      };
    }
    if (!effortOk) {
      return {
        decision: 'hold',
        target: { ...lastTarget, repsGoal: range.max },
        rule: `You reached the top of the range, but at RPE ${topRpe} — above the target of ${targetRpe}. Same again until it feels easier.`,
        suggestSlug: null,
      };
    }
    if (last.formOk !== true) {
      return {
        decision: 'hold',
        target: { ...lastTarget, repsGoal: range.max },
        rule: 'You reached the top of the range at the right effort, but form was not marked as solid, so it stays. Tick “form held” when it does.',
        suggestSlug: null,
      };
    }
    if (exercise.loadable && lastLoad !== null && increment > 0) {
      const heavier = roundTo(lastLoad + increment, increment, 'nearest');
      return {
        decision: 'increase_load',
        target: { ...lastTarget, loadKg: heavier, repsGoal: range.min },
        rule: `Every set reached ${range.max} at RPE ${topRpe} or easier with solid form, so the load goes up ${formatKg(increment)} to ${formatKg(heavier)}, and reps start again at ${range.min}.`,
        suggestSlug: null,
      };
    }
    const harder = options.harder ?? null;
    if (harder) {
      return {
        decision: 'harder_variant',
        target: { ...lastTarget, repsGoal: range.max },
        rule: `Every set reached ${range.max} at the right effort with solid form. You are ready for ${harder.name} — swap to it, starting at ${range.min} reps.`,
        suggestSlug: harder.slug,
      };
    }
    if (base.sets < MAX_SETS) {
      return {
        decision: 'add_set',
        target: { ...lastTarget, sets: base.sets + 1, repsGoal: range.min },
        rule: `Every set reached ${range.max} with solid form and there is no harder version you can do yet, so one more set, at ${range.min} reps.`,
        suggestSlug: null,
      };
    }
    return {
      decision: 'hold',
      target: { ...lastTarget, repsGoal: range.max },
      rule: 'At the top of the range on every set. Slow the lowering to three seconds to keep it working.',
      suggestSlug: null,
    };
  }

  // 7. In range, effort close to target: one more rep per set.
  if (allInRange && topRpe !== null && topRpe <= targetRpe + 1) {
    const goal = Math.min(range.max, fewest + 1);
    return {
      decision: 'increase_reps',
      target: { ...lastTarget, repsGoal: goal },
      rule: `All sets were in range, so aim for ${goal} reps on each this time. Reps go up before load does.`,
      suggestSlug: null,
    };
  }

  // 8. Otherwise: same again.
  return {
    decision: 'hold',
    target: { ...lastTarget, repsGoal: Math.max(range.min, fewest) },
    rule: !effortKnown
      ? 'Log how hard each set felt (RPE) so the plan can tell when to move on.'
      : allInRange
        ? `The effort ran above target (RPE ${topRpe}). Same again until it settles.`
        : `Some sets fell short of ${range.min} reps. Same load again; no need to chase it.`,
    suggestSlug: null,
  };
}
