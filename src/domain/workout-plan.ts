import { z } from 'zod';
import {
  PATTERN_LABEL,
  isAvailable,
  substitutesFor,
  touchesGentleRegion,
  type Availability,
  type Exercise,
  type MovementPattern,
} from './exercise';
import { EQUIPMENT, injurySchema, type BodyRegion, type Injury } from './onboarding';

/**
 * The Train plan engine.
 *
 * Pure and deterministic: the same setup and the same context always give the
 * same week, down to the order of substitutions. Nothing here reads a clock,
 * a random number or a model. That is what lets the tests say "this person
 * gets this plan" and mean it, and what lets the screen explain a plan by
 * listing the rules that produced it rather than by guessing at them.
 *
 * It is also conservative by construction. Where a choice exists between more
 * and less, the default is less: fewer hard days for someone new, the easier
 * variant for a sore region, a shorter first week back after a break. More
 * can always be added; an injury in week two cannot be taken back.
 */

export const TRAINING_GOALS = ['general', 'strength', 'running', 'tennis'] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const GOAL_LABEL: Record<TrainingGoal, string> = {
  general: 'General fitness',
  strength: 'Strength',
  running: 'Running',
  tennis: 'Tennis-ready',
};

export const ACTIVITIES = ['running', 'tennis', 'walking'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const EXPERIENCE_LEVELS = ['new', 'returning', 'consistent', 'experienced'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const READINESS = ['low', 'normal', 'high'] as const;
export type Readiness = (typeof READINESS)[number];

const weekday = z.int().min(0).max(6);
const uniqueWeekdays = (days: readonly number[]) => new Set(days).size === days.length;

export const trainingSetupSchema = z
  .object({
    goal: z.enum(TRAINING_GOALS).default('general'),
    experience: z.enum(EXPERIENCE_LEVELS).default('returning'),
    equipment: z.array(z.enum(EQUIPMENT)).min(1).default(['none']),
    trainingWeekdays: z
      .array(weekday)
      .min(2, 'Pick at least two days.')
      .max(6, 'Six days at most — one day off is not optional.')
      .refine(uniqueWeekdays, 'Each day once.'),
    sessionMinutes: z.int().min(10).max(120).default(30),
    activities: z.array(z.enum(ACTIVITIES)).max(ACTIVITIES.length).default([]),
    tennisWeekdays: z.array(weekday).max(6).refine(uniqueWeekdays, 'Each day once.').default([]),
    painFlags: z.array(injurySchema).max(8).default([]),
    avoidExercises: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  })
  .refine(
    (setup) =>
      setup.tennisWeekdays.length === 0 ||
      setup.activities.includes('tennis') ||
      setup.goal === 'tennis',
    {
      message: 'Tennis days are only used when tennis is one of your activities.',
      path: ['tennisWeekdays'],
    },
  );

export type TrainingSetup = z.infer<typeof trainingSetupSchema>;

export type Block = 'warmup' | 'primary' | 'accessory' | 'cooldown';

export const BLOCK_LABEL: Record<Block, string> = {
  warmup: 'Warm-up',
  primary: 'Main work',
  accessory: 'Accessories',
  cooldown: 'Cool-down',
};

export interface Prescription {
  readonly exerciseSlug: string;
  readonly block: Block;
  readonly sets: number;
  /** For rep-counted work. */
  readonly reps: { readonly min: number; readonly max: number } | null;
  /** For timed work: seconds per set (per side, when `perSide`). */
  readonly seconds: number | null;
  readonly restSeconds: number;
  /** Target effort, 1–10. Null for warm-up and cool-down. */
  readonly rpe: number | null;
  /** Reps in reserve, the same target said the other way round. */
  readonly rir: number | null;
  readonly perSide: boolean;
  /** Same-pattern alternatives this person can do, nearest first. */
  readonly substitutes: readonly string[];
  /** Why this one was chosen, when that is not obvious. */
  readonly note: string | null;
}

export type SessionKind =
  | 'full_a'
  | 'full_b'
  | 'full_c'
  | 'upper_a'
  | 'upper_b'
  | 'lower_a'
  | 'lower_b'
  | 'conditioning'
  | 'court'
  | 'run_easy'
  | 'run_intervals'
  | 'run_long'
  | 'easy_movement';

export const SESSION_TITLE: Record<SessionKind, string> = {
  full_a: 'Full body A',
  full_b: 'Full body B',
  full_c: 'Full body C',
  upper_a: 'Upper body A',
  upper_b: 'Upper body B',
  lower_a: 'Lower body A',
  lower_b: 'Lower body B',
  conditioning: 'Conditioning',
  court: 'Court conditioning',
  run_easy: 'Easy run',
  run_intervals: 'Tempo run',
  run_long: 'Longer easy run',
  easy_movement: 'Easy movement',
};

export interface PlannedSession {
  /** Stable for a given setup: the weekday and the kind. */
  readonly key: string;
  readonly weekday: number;
  readonly kind: SessionKind;
  readonly title: string;
  readonly items: readonly Prescription[];
  readonly estimatedMinutes: number;
  /** The version that still counts on a bad day. */
  readonly minimum: {
    readonly items: readonly Prescription[];
    readonly estimatedMinutes: number;
  };
}

export interface ActivityDay {
  readonly weekday: number;
  readonly activity: 'tennis';
  readonly title: string;
}

export interface TrainingPlan {
  readonly sessions: readonly PlannedSession[];
  readonly activityDays: readonly ActivityDay[];
  /** Every rule that shaped the week, in words. Shown under "Why this plan". */
  readonly rules: readonly string[];
  /** Patterns that could not be filled and were left out, with the reason. */
  readonly omissions: readonly string[];
}

export interface PlanContext {
  /** Regions the onboarding safety rules say nothing may load. */
  readonly excludedRegions?: readonly BodyRegion[];
  /** Regions the onboarding safety rules say to treat gently. */
  readonly regressedRegions?: readonly BodyRegion[];
  /** False when the safety rules reroute high-intensity work. */
  readonly highIntensityAllowed?: boolean;
  /** Completed workouts in the last fourteen days. */
  readonly recentSessions?: number;
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Monday-first order, which is how a training week is read. */
export function mondayFirst(days: readonly number[]): number[] {
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

// ---------------------------------------------------------------------------
// The week's shape
// ---------------------------------------------------------------------------

const HARD: ReadonlySet<SessionKind> = new Set([
  'full_a',
  'full_b',
  'full_c',
  'upper_a',
  'upper_b',
  'lower_a',
  'lower_b',
  'court',
  'run_intervals',
  'run_long',
]);

/** Sessions that leave the legs tired the next day. */
const LEG_HEAVY: ReadonlySet<SessionKind> = new Set([
  'full_a',
  'full_b',
  'full_c',
  'lower_a',
  'lower_b',
  'court',
  'run_intervals',
  'run_long',
]);

function weekShape(goal: TrainingGoal, days: number): SessionKind[] {
  const shapes: Record<TrainingGoal, Record<number, SessionKind[]>> = {
    general: {
      2: ['full_a', 'full_b'],
      3: ['full_a', 'full_b', 'full_c'],
      4: ['full_a', 'conditioning', 'full_b', 'full_c'],
      5: ['full_a', 'conditioning', 'full_b', 'conditioning', 'full_c'],
      6: ['full_a', 'conditioning', 'full_b', 'easy_movement', 'full_c', 'conditioning'],
    },
    strength: {
      2: ['full_a', 'full_b'],
      3: ['full_a', 'full_b', 'full_c'],
      4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
      5: ['upper_a', 'lower_a', 'conditioning', 'upper_b', 'lower_b'],
      6: ['upper_a', 'lower_a', 'conditioning', 'upper_b', 'lower_b', 'easy_movement'],
    },
    running: {
      2: ['run_easy', 'full_a'],
      3: ['run_easy', 'full_a', 'run_long'],
      4: ['run_easy', 'full_a', 'run_intervals', 'run_long'],
      5: ['run_easy', 'full_a', 'run_intervals', 'full_b', 'run_long'],
      6: ['run_easy', 'full_a', 'run_intervals', 'run_easy', 'full_b', 'run_long'],
    },
    tennis: {
      2: ['full_a', 'full_b'],
      3: ['full_a', 'court', 'full_b'],
      4: ['upper_a', 'lower_a', 'court', 'full_b'],
      5: ['upper_a', 'lower_a', 'court', 'upper_b', 'full_b'],
      6: ['upper_a', 'lower_a', 'court', 'upper_b', 'full_b', 'easy_movement'],
    },
  };
  return [...(shapes[goal][days] ?? shapes[goal][3]!)];
}

/** Hard sessions a week, at most, by experience. */
const HARD_CAP: Record<Experience, number> = {
  new: 3,
  returning: 4,
  consistent: 5,
  experienced: 6,
};

function penalty(
  order: readonly SessionKind[],
  weekdays: readonly number[],
  tennis: ReadonlySet<number>,
): number {
  let score = 0;
  const byDay = new Map<number, SessionKind>();
  order.forEach((kind, index) => byDay.set(weekdays[index]!, kind));

  for (const [day, kind] of byDay) {
    const tomorrow = (day + 1) % 7;
    const next = byDay.get(tomorrow);
    if (tennis.has(tomorrow) && LEG_HEAVY.has(kind)) score += 4;
    if (tennis.has(day) && LEG_HEAVY.has(kind)) score += 4;
    if (next !== undefined) {
      if (LEG_HEAVY.has(kind) && LEG_HEAVY.has(next)) score += 1;
      if (kind === next) score += 1;
    }
  }
  return score;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([item, ...tail]);
  });
  return out;
}

/**
 * Lays the session kinds onto the chosen weekdays.
 *
 * Every ordering is scored (six days is 720 orderings, which is nothing) and
 * the lowest penalty wins; ties go to the ordering closest to the template,
 * so the result is the same every time and the template is only rearranged
 * when there is a reason to.
 */
function arrange(
  kinds: readonly SessionKind[],
  weekdays: readonly number[],
  tennis: ReadonlySet<number>,
): SessionKind[] {
  const indices = kinds.map((_, index) => index);
  let best: number[] = indices;
  let bestScore = penalty(kinds, weekdays, tennis);
  for (const candidate of permutations(indices)) {
    const order = candidate.map((index) => kinds[index]!);
    const score = penalty(order, weekdays, tennis);
    if (score < bestScore || (score === bestScore && candidate.join() < best.join())) {
      best = candidate;
      bestScore = score;
    }
  }
  return best.map((index) => kinds[index]!);
}

// ---------------------------------------------------------------------------
// Choosing exercises
// ---------------------------------------------------------------------------

interface SlotSpec {
  readonly primary: readonly MovementPattern[][];
  readonly accessory: readonly MovementPattern[][];
}

/**
 * Each slot lists patterns, each with fallbacks in order: `[pull_vertical,
 * pull_horizontal]` means "a pull-down if you can, otherwise a row".
 */
const SLOTS: Record<SessionKind, SlotSpec> = {
  full_a: {
    primary: [['squat'], ['push_horizontal']],
    accessory: [['hinge'], ['pull_horizontal', 'pull_vertical'], ['core']],
  },
  full_b: {
    primary: [['hinge'], ['pull_vertical', 'pull_horizontal']],
    accessory: [['lunge', 'squat'], ['push_vertical', 'push_horizontal'], ['core']],
  },
  full_c: {
    primary: [['lunge', 'squat'], ['push_horizontal']],
    accessory: [['hinge'], ['pull_horizontal', 'pull_vertical'], ['carry', 'core']],
  },
  upper_a: {
    primary: [['push_horizontal'], ['pull_horizontal', 'pull_vertical']],
    accessory: [
      ['push_vertical', 'push_horizontal'],
      ['pull_vertical', 'pull_horizontal'],
      ['core'],
    ],
  },
  upper_b: {
    primary: [
      ['push_vertical', 'push_horizontal'],
      ['pull_vertical', 'pull_horizontal'],
    ],
    accessory: [['push_horizontal'], ['pull_horizontal'], ['core']],
  },
  lower_a: {
    primary: [['squat']],
    accessory: [['hinge'], ['lunge'], ['core']],
  },
  lower_b: {
    primary: [['hinge']],
    accessory: [['lunge', 'squat'], ['squat'], ['carry', 'core']],
  },
  conditioning: { primary: [['conditioning']], accessory: [['core']] },
  court: { primary: [['agility'], ['conditioning']], accessory: [['lunge'], ['core']] },
  run_easy: { primary: [['run']], accessory: [] },
  run_intervals: { primary: [['run']], accessory: [] },
  run_long: { primary: [['run']], accessory: [] },
  easy_movement: { primary: [['conditioning']], accessory: [] },
};

const TARGET_DIFFICULTY: Record<Experience, number> = {
  new: 1,
  returning: 2,
  consistent: 3,
  experienced: 4,
};

function pick(
  pattern: MovementPattern,
  library: readonly Exercise[],
  availability: Availability,
  target: number,
  preferLoadable: boolean,
  taken: ReadonlySet<string>,
): { exercise: Exercise; gentle: boolean } | null {
  const candidates = library.filter(
    (exercise) =>
      exercise.pattern === pattern &&
      isAvailable(exercise, availability) &&
      !taken.has(exercise.slug),
  );
  if (candidates.length === 0) return null;

  const gentle = candidates.some((exercise) => touchesGentleRegion(exercise, availability));
  const sorted = [...candidates].sort((a, b) => {
    if (gentle) return a.difficulty - b.difficulty || a.name.localeCompare(b.name);
    const distance = Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target);
    if (distance !== 0) return distance;
    // Between two equally good fits, the easier one. Conservative by default.
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    if (preferLoadable && a.loadable !== b.loadable) return a.loadable ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const exercise = sorted[0]!;
  return { exercise, gentle: gentle && touchesGentleRegion(exercise, availability) };
}

function runFor(kind: SessionKind, setup: TrainingSetup, highIntensityAllowed: boolean): string {
  if (setup.experience === 'new') return 'run-walk';
  if (kind === 'run_intervals') {
    const ready =
      highIntensityAllowed &&
      (setup.experience === 'consistent' || setup.experience === 'experienced');
    return ready ? 'tempo-intervals' : 'easy-run';
  }
  return 'easy-run';
}

// ---------------------------------------------------------------------------
// Dosage
// ---------------------------------------------------------------------------

function strengthDose(
  exercise: Exercise,
  block: 'primary' | 'accessory',
  setup: TrainingSetup,
): Pick<Prescription, 'sets' | 'reps' | 'seconds' | 'restSeconds' | 'rpe'> {
  const isNew = setup.experience === 'new';
  const veteran = setup.experience === 'consistent' || setup.experience === 'experienced';
  const rpe = isNew ? 6 : 7;

  if (exercise.measure === 'time') {
    const seconds = isNew ? 20 : veteran ? 40 : 30;
    return { sets: isNew ? 2 : 3, reps: null, seconds, restSeconds: 45, rpe };
  }

  if (block === 'primary') {
    const heavy = setup.goal === 'strength' && exercise.loadable && !isNew;
    return {
      sets: isNew ? 2 : 3,
      reps: heavy ? { min: 5, max: 8 } : { min: 8, max: 12 },
      seconds: null,
      restSeconds: heavy ? 150 : isNew ? 75 : 90,
      rpe,
    };
  }
  return {
    sets: veteran ? 3 : 2,
    reps: { min: 10, max: 15 },
    seconds: null,
    restSeconds: 60,
    rpe,
  };
}

function conditioningDose(
  exercise: Exercise,
  kind: SessionKind,
  setup: TrainingSetup,
  minutesForMain: number,
): Pick<Prescription, 'sets' | 'reps' | 'seconds' | 'restSeconds' | 'rpe'> {
  const isNew = setup.experience === 'new';
  switch (exercise.slug) {
    case 'march-intervals':
      return { sets: isNew ? 4 : 6, reps: null, seconds: 45, restSeconds: 75, rpe: 7 };
    case 'lateral-shuffle':
      return { sets: isNew ? 4 : 6, reps: null, seconds: 20, restSeconds: 40, rpe: 7 };
    case 'tempo-intervals':
      return { sets: 4, reps: null, seconds: 240, restSeconds: 120, rpe: 7 };
    default: {
      const base = kind === 'run_long' ? minutesForMain : Math.min(minutesForMain, isNew ? 20 : 30);
      return { sets: 1, reps: null, seconds: Math.max(5, base) * 60, restSeconds: 0, rpe: 4 };
    }
  }
}

const WARMUPS: Record<'legs' | 'upper' | 'run', readonly string[]> = {
  legs: ['leg-swing', 'elephant-walk', 'arm-circles'],
  upper: ['arm-circles', 'cat-cow'],
  run: ['leg-swing', 'elephant-walk'],
};
const COOLDOWNS: Record<'legs' | 'upper' | 'run', readonly string[]> = {
  legs: ['hamstring-stretch', 'easy-breathing'],
  upper: ['easy-breathing'],
  run: ['calf-stretch', 'hamstring-stretch'],
};

function bodyFocus(kind: SessionKind): 'legs' | 'upper' | 'run' {
  if (kind === 'upper_a' || kind === 'upper_b') return 'upper';
  if (kind.startsWith('run')) return 'run';
  return 'legs';
}

function warmupDose(
  exercise: Exercise,
): Pick<Prescription, 'sets' | 'reps' | 'seconds' | 'restSeconds' | 'rpe'> {
  if (exercise.measure === 'time')
    return { sets: 1, reps: null, seconds: 30, restSeconds: 0, rpe: null };
  return { sets: 1, reps: { min: 8, max: 10 }, seconds: null, restSeconds: 0, rpe: null };
}

function cooldownDose(
  exercise: Exercise,
): Pick<Prescription, 'sets' | 'reps' | 'seconds' | 'restSeconds' | 'rpe'> {
  return {
    sets: 1,
    reps: null,
    seconds: exercise.slug === 'easy-breathing' ? 120 : 30,
    restSeconds: 0,
    rpe: null,
  };
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

const SECONDS_PER_REP = 3.5;
const TRANSITION_SECONDS = 30;

/** Seconds a prescription takes, including rest between sets and moving on. */
export function prescriptionSeconds(
  item: Pick<Prescription, 'sets' | 'reps' | 'seconds' | 'restSeconds' | 'perSide' | 'block'>,
): number {
  const sides = item.perSide ? 2 : 1;
  const repSeconds = item.block === 'warmup' ? 2 : SECONDS_PER_REP;
  const work = item.reps
    ? ((item.reps.min + item.reps.max) / 2) * repSeconds * sides
    : (item.seconds ?? 0) * sides;
  return item.sets * work + Math.max(0, item.sets - 1) * item.restSeconds + TRANSITION_SECONDS;
}

export function estimateMinutes(items: readonly Prescription[]): number {
  return Math.ceil(items.reduce((total, item) => total + prescriptionSeconds(item), 0) / 60);
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** What this person can be given: their equipment, less anything their flags or the safety rules rule out. */
export function availabilityFor(setup: TrainingSetup, context: PlanContext): Availability {
  const flags: readonly Injury[] = setup.painFlags;
  const excluded = new Set<BodyRegion>(context.excludedRegions ?? []);
  const gentle = new Set<BodyRegion>(context.regressedRegions ?? []);
  for (const flag of flags) {
    if (flag.severity === 'severe') excluded.add(flag.region);
    else gentle.add(flag.region);
  }
  for (const region of excluded) gentle.delete(region);
  return {
    equipment: setup.equipment,
    excludedRegions: [...excluded].sort(),
    gentleRegions: [...gentle].sort(),
    avoid: setup.avoidExercises,
  };
}

function describeDays(days: readonly number[]): string {
  const names = mondayFirst(days).map((day) => WEEKDAY_SHORT[day]!);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function generateTrainingPlan(
  rawSetup: TrainingSetup,
  library: readonly Exercise[],
  context: PlanContext = {},
): TrainingPlan {
  const setup = trainingSetupSchema.parse(rawSetup);
  const rules: string[] = [];
  const omissions: string[] = [];
  const availability = availabilityFor(setup, context);
  const highIntensityAllowed = context.highIntensityAllowed ?? true;
  const weekdays = mondayFirst(setup.trainingWeekdays);
  const tennis = new Set(setup.tennisWeekdays);
  const goal = setup.goal;

  // --- Shape ---------------------------------------------------------------
  let kinds = weekShape(goal, weekdays.length);
  rules.push(
    `${weekdays.length} training days (${describeDays(weekdays)}) with a ${GOAL_LABEL[goal].toLowerCase()} goal: ${[
      ...new Set(kinds.map((kind) => SESSION_TITLE[kind])),
    ].join(', ')}.`,
  );

  const cap = HARD_CAP[setup.experience];
  let hard = 0;
  let softened = 0;
  kinds = kinds.map((kind) => {
    if (!HARD.has(kind)) return kind;
    hard += 1;
    if (hard > cap) {
      softened += 1;
      return 'easy_movement';
    }
    return kind;
  });
  if (softened > 0) {
    rules.push(
      `At most ${cap} hard sessions a week while you are ${setup.experience === 'new' ? 'new to this' : 'building back up'}; the other ${softened === 1 ? 'day is' : `${softened} days are`} easy movement.`,
    );
  }

  if (!highIntensityAllowed && kinds.includes('run_intervals')) {
    rules.push('Your safety answers keep intervals off the plan for now, so every run is easy.');
  }

  if (tennis.size > 0) {
    kinds = arrange(kinds, weekdays, tennis);
    const tennisNames = describeDays([...tennis]);
    rules.push(
      `Tennis on ${tennisNames}: leg-heavy sessions are kept off the day before and the day of, where your days allow it.`,
    );
  }

  // --- Recent volume --------------------------------------------------------
  const returningFromBreak = setup.experience !== 'new' && context.recentSessions === 0;
  if (returningFromBreak) {
    rules.push(
      'No workouts logged in the last two weeks, so this week has one set fewer per exercise. It comes back once you have trained.',
    );
  }

  if (availability.excludedRegions.length > 0) {
    rules.push(
      `Nothing loads your ${availability.excludedRegions.join(' or ')} while that flag is severe.`,
    );
  }
  if (availability.gentleRegions.length > 0) {
    rules.push(
      `Movements that load your ${availability.gentleRegions.join(' or ')} use the easiest version. Stop any movement if pain goes above 3 out of 10.`,
    );
  }
  if (setup.avoidExercises.length > 0) {
    rules.push(
      `${setup.avoidExercises.length} exercise${setup.avoidExercises.length === 1 ? '' : 's'} you asked to avoid ${setup.avoidExercises.length === 1 ? 'is' : 'are'} never offered.`,
    );
  }

  rules.push(
    'Effort is set by RPE (how hard it felt, 1–10) and reps in reserve: finish each set feeling you had two or three more in you.',
  );

  // --- Sessions -------------------------------------------------------------
  const target = TARGET_DIFFICULTY[setup.experience];
  const preferLoadable = goal === 'strength';
  const sessions: PlannedSession[] = [];
  const missing = new Map<string, Set<string>>();

  kinds.forEach((kind, index) => {
    const day = weekdays[index]!;
    const taken = new Set<string>();
    const focus = bodyFocus(kind);
    const items: Prescription[] = [];

    const make = (
      exercise: Exercise,
      block: Block,
      dose: Pick<Prescription, 'sets' | 'reps' | 'seconds' | 'restSeconds' | 'rpe'>,
      note: string | null,
    ): Prescription => ({
      exerciseSlug: exercise.slug,
      block,
      ...dose,
      sets:
        returningFromBreak && (block === 'primary' || block === 'accessory') && dose.sets > 2
          ? dose.sets - 1
          : dose.sets,
      rir: dose.rpe === null ? null : Math.max(0, 10 - dose.rpe),
      perSide: exercise.perSide,
      substitutes: substitutesFor(exercise, library, availability).map((option) => option.slug),
      note,
    });

    // Warm-up: two movers.
    for (const slug of WARMUPS[focus]) {
      if (items.filter((item) => item.block === 'warmup').length >= 2) break;
      const exercise = library.find((candidate) => candidate.slug === slug);
      if (!exercise || !isAvailable(exercise, availability)) continue;
      taken.add(slug);
      items.push(make(exercise, 'warmup', warmupDose(exercise), null));
    }

    const fill = (patterns: readonly MovementPattern[][], block: 'primary' | 'accessory') => {
      for (const options of patterns) {
        let chosen: { exercise: Exercise; gentle: boolean } | null = null;
        for (const pattern of options) {
          if (kind === 'easy_movement' && pattern === 'conditioning') {
            // Easy means easy: a walk, whatever the person's level.
            const walk = library.find((candidate) => candidate.slug === 'brisk-walk');
            if (walk && isAvailable(walk, availability)) chosen = { exercise: walk, gentle: false };
          } else if (pattern === 'run') {
            const slug = runFor(kind, setup, highIntensityAllowed);
            const exercise = library.find((candidate) => candidate.slug === slug);
            if (exercise && isAvailable(exercise, availability))
              chosen = { exercise, gentle: touchesGentleRegion(exercise, availability) };
          } else {
            // Accessories sit a step below the main lifts: they add volume, not risk.
            const level = block === 'accessory' ? Math.max(1, target - 1) : target;
            chosen = pick(pattern, library, availability, level, preferLoadable, taken);
          }
          if (chosen) break;
        }
        if (!chosen) {
          const what = options.map((pattern) => PATTERN_LABEL[pattern].toLowerCase()).join(' or ');
          missing.set(what, (missing.get(what) ?? new Set()).add(SESSION_TITLE[kind]));
          continue;
        }
        taken.add(chosen.exercise.slug);
        const isConditioning = ['conditioning', 'run', 'agility'].includes(chosen.exercise.pattern);
        const dose = isConditioning
          ? conditioningDose(chosen.exercise, kind, setup, Math.max(10, setup.sessionMinutes - 8))
          : strengthDose(chosen.exercise, block, setup);
        items.push(
          make(
            chosen.exercise,
            block,
            dose,
            chosen.gentle
              ? 'The easiest version, because of a pain flag. Stop if pain goes above 3/10.'
              : null,
          ),
        );
      }
    };
    fill(SLOTS[kind].primary, 'primary');
    fill(SLOTS[kind].accessory, 'accessory');

    for (const slug of COOLDOWNS[focus]) {
      const exercise = library.find((candidate) => candidate.slug === slug);
      if (!exercise || !isAvailable(exercise, availability) || taken.has(slug)) continue;
      taken.add(slug);
      items.push(make(exercise, 'cooldown', cooldownDose(exercise), null));
    }

    const fitted = fitToMinutes(items, setup.sessionMinutes);
    const minimum = minimumOf(fitted);
    sessions.push({
      key: `${day}-${kind}`,
      weekday: day,
      kind,
      title: SESSION_TITLE[kind],
      items: fitted,
      estimatedMinutes: estimateMinutes(fitted),
      minimum: { items: minimum, estimatedMinutes: estimateMinutes(minimum) },
    });
  });

  for (const [what, where] of missing) {
    omissions.push(
      `No ${what} movement fits your equipment and flags, so it is left out of ${[...where].join(', ')}.`,
    );
  }

  if (sessions.some((session) => session.estimatedMinutes > setup.sessionMinutes)) {
    rules.push(
      `${setup.sessionMinutes} minutes is tight for a full session; where it does not fit, do the minimum version, which always does.`,
    );
  } else {
    rules.push(
      `Every session is planned to fit in ${setup.sessionMinutes} minutes, warm-up and cool-down included.`,
    );
  }
  rules.push(
    'Each session has a minimum version: the warm-up and the first main exercise. On a bad day, that is the session.',
  );

  const activityDays: ActivityDay[] = mondayFirst([...tennis]).map((day) => ({
    weekday: day,
    activity: 'tennis',
    title: 'Tennis',
  }));

  return { sessions, activityDays, rules, omissions };
}

/**
 * Trims a session until it fits the time available, in this order: extra
 * accessory sets, then the last accessories, then a primary set, then the
 * second cool-down and warm-up items. Timed conditioning shrinks to fit
 * instead. Main work is the last thing to go, and the first primary exercise
 * never goes at all.
 */
export function fitToMinutes(items: readonly Prescription[], minutes: number): Prescription[] {
  let current = [...items];
  const fits = () => estimateMinutes(current) <= minutes;

  const steps: Array<() => boolean> = [
    () => {
      const index = current.findIndex((item) => item.block === 'accessory' && item.sets > 2);
      if (index < 0) return false;
      current[index] = { ...current[index]!, sets: current[index]!.sets - 1 };
      return true;
    },
    () => {
      const index = current.map((item) => item.block).lastIndexOf('accessory');
      if (index < 0) return false;
      current = current.filter((_, position) => position !== index);
      return true;
    },
    () => {
      const index = current.findIndex((item) => item.block === 'primary' && item.sets > 2);
      if (index < 0) return false;
      current[index] = { ...current[index]!, sets: current[index]!.sets - 1 };
      return true;
    },
    () => {
      const long = current.findIndex(
        (item) => item.block === 'primary' && item.sets === 1 && (item.seconds ?? 0) > 600,
      );
      if (long < 0) return false;
      current[long] = {
        ...current[long]!,
        seconds: Math.max(600, (current[long]!.seconds ?? 0) - 300),
      };
      return true;
    },
    () => {
      const cooldowns = current.filter((item) => item.block === 'cooldown');
      if (cooldowns.length < 2) return false;
      const index = current.map((item) => item.block).lastIndexOf('cooldown');
      current = current.filter((_, position) => position !== index);
      return true;
    },
    () => {
      const warmups = current.filter((item) => item.block === 'warmup');
      if (warmups.length < 2) return false;
      const index = current.map((item) => item.block).lastIndexOf('warmup');
      current = current.filter((_, position) => position !== index);
      return true;
    },
    () => {
      const primaries = current.filter((item) => item.block === 'primary');
      if (primaries.length < 2) return false;
      const index = current.map((item) => item.block).lastIndexOf('primary');
      current = current.filter((_, position) => position !== index);
      return true;
    },
  ];

  for (const step of steps) {
    while (!fits() && step()) {
      // Keep applying this step until it fits or the step has nothing left.
    }
    if (fits()) break;
  }
  return current;
}

/** The minimum version: the first warm-up item and the first main exercise, two sets. */
export function minimumOf(items: readonly Prescription[]): Prescription[] {
  const warmup = items.find((item) => item.block === 'warmup');
  const primary = items.find((item) => item.block === 'primary');
  const out: Prescription[] = [];
  if (warmup) out.push(warmup);
  if (primary) {
    const timedSingle = primary.sets === 1 && primary.seconds !== null;
    out.push(
      timedSingle
        ? { ...primary, seconds: Math.min(primary.seconds ?? 600, 600) }
        : { ...primary, sets: Math.min(primary.sets, 2) },
    );
  }
  return out;
}

export function sessionForWeekday(plan: TrainingPlan, day: number): PlannedSession | null {
  return plan.sessions.find((session) => session.weekday === day) ?? null;
}

/**
 * Adapts a session to how the person says they feel today.
 *
 * Low readiness takes a set off everything and lowers the effort target by
 * one; it never adds. High readiness changes nothing — feeling good is not a
 * reason to do more than the plan, which already progresses when the logged
 * numbers say so.
 */
export function adaptForReadiness(
  items: readonly Prescription[],
  readiness: Readiness,
): { items: Prescription[]; note: string | null } {
  if (readiness !== 'low') {
    return {
      items: [...items],
      note:
        readiness === 'high'
          ? 'Feeling good is welcome, but the plan stays as written. It moves up when your logged sets say so.'
          : null,
    };
  }
  return {
    items: items.map((item) =>
      item.block === 'primary' || item.block === 'accessory'
        ? {
            ...item,
            sets: Math.max(1, item.sets - 1),
            rpe: item.rpe === null ? null : Math.max(4, item.rpe - 1),
            rir: item.rir === null ? null : Math.min(6, item.rir + 1),
          }
        : item,
    ),
    note: 'Low readiness: one set fewer and an easier effort target. The minimum version also counts in full today.',
  };
}

/**
 * The setup a person has implicitly given already, from onboarding, so the
 * Train screen opens with something sensible in every field.
 */
export function suggestedSetup(input: {
  readonly experience: Experience;
  readonly equipment: readonly (typeof EQUIPMENT)[number][];
  readonly sessionMinutes: number;
  readonly preferredWeekdays: readonly number[];
  readonly availableWeekdays: readonly number[];
  readonly injuries: readonly Injury[];
}): TrainingSetup {
  const pool =
    input.preferredWeekdays.length >= 2 ? input.preferredWeekdays : input.availableWeekdays;
  const ordered = mondayFirst(pool.length >= 2 ? pool : [1, 3, 5]);
  // Spread three days across what is available rather than taking the first three.
  const count = Math.min(input.experience === 'new' ? 3 : 4, Math.max(2, ordered.length));
  const step = ordered.length / count;
  const days = Array.from({ length: count }, (_, index) => ordered[Math.floor(index * step)]!);

  return trainingSetupSchema.parse({
    goal: 'general',
    experience: input.experience,
    equipment: input.equipment.length > 0 ? input.equipment : ['none'],
    trainingWeekdays: [...new Set(days)].length >= 2 ? [...new Set(days)] : [1, 4],
    sessionMinutes: Math.min(120, Math.max(10, input.sessionMinutes)),
    activities: [],
    tennisWeekdays: [],
    painFlags: input.injuries,
    avoidExercises: [],
  });
}
