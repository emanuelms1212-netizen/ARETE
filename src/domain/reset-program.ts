import { z } from 'zod';
import { addDays, daysBetween, formatLocalDate } from './local-day';
import type { IsoDate } from './types';

/**
 * The 60-day reset, as a programme a person can inspect, change and live with.
 *
 * The source (SOURCE_MAP §1–2) prescribes by calendar date: 4 L of water,
 * 10 km runs, two-hour gym sessions and a 06:00 alarm for everybody. ARETE
 * keeps its shape — the same daily components, the same five blocks — and
 * replaces every fixed number with a suggested range worked out from the
 * person: their body size, the climate they are in, their schedule, their
 * experience and how they are recovering. Every range can be edited before
 * the start and at any time after it.
 *
 * Days 61–66 of the source are an optional "extension week", off unless the
 * person adds it — before starting or at the finish (SOURCE_MAP §1).
 */

export const RESET_BASE_DAYS = 60;
export const RESET_EXTENSION_DAYS = 6;

export const RESET_COMPONENTS = [
  'wake',
  'hydration',
  'movement',
  'study',
  'reading',
  'meditation',
  'cold',
  'screen',
  'evening',
  'sleep',
  'weekly',
] as const;
export type ResetComponent = (typeof RESET_COMPONENTS)[number];

export const RESET_COMPONENT_LABEL: Record<ResetComponent, string> = {
  wake: 'Wake window',
  hydration: 'Water',
  movement: 'Movement',
  study: 'Focused study',
  reading: 'Reading',
  meditation: 'Meditation',
  cold: 'Cool finish to a shower',
  screen: 'Social media limit',
  evening: 'Plan tomorrow',
  sleep: 'Sleep window',
  weekly: 'Weekly reflection',
};

/** Off unless chosen: cold needs a safety acknowledgement, and a screen cap is a choice, not a virtue. */
export const RESET_OPT_IN: readonly ResetComponent[] = ['cold', 'screen'];

/** The cold-water note a person reads before turning the cold finish on. */
export const COLD_NOTICE_VERSION = '2026-10-19';
export const COLD_NOTICE =
  'A cool finish to a shower is the whole of it: 15–30 seconds, cool rather than icy. Skip it if you have a heart condition, high blood pressure, Raynaud’s or are pregnant, and stop at once if you feel faint or short of breath. Never use cold water alone.';

/** What a minimum day keeps. Everything else is shown as optional for the day. */
export const RESET_MINIMUM: readonly ResetComponent[] = ['hydration', 'movement', 'sleep'];

export interface ResetPhase {
  readonly index: number;
  readonly name: string;
  readonly from: number;
  readonly to: number;
  /** One line on what this block is for, in ARETE's words. */
  readonly purpose: string;
}

/** The source's five blocks, renamed, with the extension week after them. */
export const RESET_PHASES: readonly ResetPhase[] = [
  { index: 0, name: 'Foundation', from: 1, to: 7, purpose: 'Small, easy versions of everything.' },
  { index: 1, name: 'Build', from: 8, to: 21, purpose: 'A little more, once the habits exist.' },
  { index: 2, name: 'Steady', from: 22, to: 42, purpose: 'The longest block: the routine itself.' },
  {
    index: 3,
    name: 'Stretch',
    from: 43,
    to: 56,
    purpose: 'The upper end of your ranges, if they feel right.',
  },
  {
    index: 4,
    name: 'Consolidate',
    from: 57,
    to: 60,
    purpose: 'Keep what worked; drop what did not.',
  },
  {
    index: 5,
    name: 'Extension week',
    from: 61,
    to: 66,
    purpose: 'Optional. The source’s last six days.',
  },
];

export function phaseFor(programDay: number): ResetPhase {
  return (
    RESET_PHASES.find((phase) => programDay >= phase.from && programDay <= phase.to) ??
    RESET_PHASES[4]!
  );
}

// ---------------------------------------------------------------------------
// The person
// ---------------------------------------------------------------------------

export const RESET_ENVIRONMENTS = ['temperate', 'hot', 'cold'] as const;
export type ResetEnvironment = (typeof RESET_ENVIRONMENTS)[number];

export interface ResetPersonInputs {
  /** Latest weigh-in, if there is one. Water is a general range without it. */
  readonly weightKg: number | null;
  readonly environment: ResetEnvironment;
  readonly experience: 'new' | 'returning' | 'consistent' | 'experienced';
  /** What the person said a session can be (Train setup or onboarding). */
  readonly sessionMinutes: number;
  readonly mindExperience: 'new' | 'some' | 'regular';
  /** Work, school, shifts or caring: less room in the day. */
  readonly busyWeekdays: boolean;
  /** A moderate or severe pain flag anywhere. Movement stays gentle. */
  readonly recoveryFlag: boolean;
}

// ---------------------------------------------------------------------------
// Customisation: everything the person may change
// ---------------------------------------------------------------------------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 07:00.');

export const resetRangeSchema = z
  .object({ min: z.number().min(0).max(10_000), max: z.number().min(0).max(10_000) })
  .refine((range) => range.max >= range.min, 'The upper end must not be below the lower.');
export type ResetRange = z.infer<typeof resetRangeSchema>;

export const resetCustomisationSchema = z.object({
  enabled: z.partialRecord(z.enum(RESET_COMPONENTS), z.boolean()).default({}),
  /** A fixed range the person chose, replacing the suggestion for every day. */
  ranges: z.partialRecord(z.enum(RESET_COMPONENTS), resetRangeSchema).default({}),
  wakeTime: time.nullable().default(null),
  bedTime: time.nullable().default(null),
  environment: z.enum(RESET_ENVIRONMENTS).default('temperate'),
  /** −2 … +2. Shifts every numeric suggestion by 10% a step; weekly check-ins move it. */
  intensity: z.int().min(-2).max(2).default(0),
  screenCapMinutes: z.int().min(5).max(240).default(30),
  includeExtension: z.boolean().default(false),
});
export type ResetCustomisation = z.infer<typeof resetCustomisationSchema>;

export function isEnabled(component: ResetComponent, customisation: ResetCustomisation): boolean {
  const chosen = customisation.enabled[component];
  if (chosen !== undefined) return chosen;
  if (RESET_OPT_IN.includes(component)) return false;
  // A wake or sleep window needs a time; none is imposed.
  if (component === 'wake') return customisation.wakeTime !== null;
  if (component === 'sleep') return true;
  return true;
}

export function programLength(customisation: ResetCustomisation): number {
  return RESET_BASE_DAYS + (customisation.includeExtension ? RESET_EXTENSION_DAYS : 0);
}

// ---------------------------------------------------------------------------
// Suggested ranges
// ---------------------------------------------------------------------------

export interface ResetTarget {
  readonly component: ResetComponent;
  readonly label: string;
  /** Null for a yes/no item (plan tomorrow) or a time window. */
  readonly range: ResetRange | null;
  readonly unit: string;
  /** What the screen says, e.g. "20–30 min" or "06:30–07:30". */
  readonly text: string;
  /** Why this range, in a sentence. */
  readonly why: string;
  readonly custom: boolean;
}

const round = (value: number, step: number) => Math.max(step, Math.round(value / step) * step);
const scaled = (range: ResetRange, factor: number, step: number): ResetRange => ({
  min: round(range.min * factor, step),
  max: Math.max(round(range.min * factor, step), round(range.max * factor, step)),
});

function shiftTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const PHASE_FACTOR = [0.6, 0.8, 1, 1, 1, 1];

/** Meditation minutes by experience and block. The source runs 5 → 25 for everybody. */
const MEDITATION: Record<ResetPersonInputs['mindExperience'], ResetRange[]> = {
  new: [
    { min: 3, max: 5 },
    { min: 5, max: 8 },
    { min: 8, max: 10 },
    { min: 10, max: 12 },
    { min: 10, max: 15 },
  ],
  some: [
    { min: 5, max: 8 },
    { min: 8, max: 10 },
    { min: 10, max: 15 },
    { min: 12, max: 18 },
    { min: 15, max: 20 },
  ],
  regular: [
    { min: 10, max: 15 },
    { min: 12, max: 18 },
    { min: 15, max: 20 },
    { min: 18, max: 25 },
    { min: 20, max: 25 },
  ],
};

const READING: ResetRange[] = [
  { min: 5, max: 10 },
  { min: 10, max: 15 },
  { min: 10, max: 20 },
  { min: 15, max: 25 },
  { min: 15, max: 30 },
];

const STUDY: ResetRange[] = [
  { min: 20, max: 30 },
  { min: 30, max: 45 },
  { min: 30, max: 60 },
  { min: 30, max: 60 },
  { min: 30, max: 60 },
];

const MOVEMENT_CAP = 90;

/**
 * The day's targets. Pure: the same inputs give the same day, so a
 * customisation change shows on every future day at once and the preview is
 * the programme itself rather than a copy of it.
 */
export function resetTargets(
  programDay: number,
  person: ResetPersonInputs,
  customisation: ResetCustomisation,
  mode: 'normal' | 'travel' | 'minimum' = 'normal',
): ResetTarget[] {
  const phase = phaseFor(programDay);
  const block = Math.min(phase.index, 4);
  const factor = 1 + customisation.intensity * 0.1;
  const targets: ResetTarget[] = [];

  const push = (
    component: ResetComponent,
    suggested: ResetRange | null,
    unit: string,
    why: string,
    format?: (range: ResetRange) => string,
  ) => {
    if (!isEnabled(component, customisation)) return;
    const own = customisation.ranges[component];
    const range = own ?? suggested;
    const text = range
      ? format
        ? format(range)
        : range.min === range.max
          ? `${range.min} ${unit}`
          : `${range.min}–${range.max} ${unit}`
      : '';
    targets.push({
      component,
      label: RESET_COMPONENT_LABEL[component],
      range,
      unit,
      text,
      why: own ? 'Your own range.' : why,
      custom: own !== undefined,
    });
  };

  // Wake: a window around the person's own time. Never the source's 06:00.
  if (customisation.wakeTime) {
    const window = `${shiftTime(customisation.wakeTime, -30)}–${shiftTime(customisation.wakeTime, 30)}`;
    if (isEnabled('wake', customisation)) {
      targets.push({
        component: 'wake',
        label: RESET_COMPONENT_LABEL.wake,
        range: null,
        unit: '',
        text: window,
        why: 'Half an hour either side of the time you chose. Consistency matters more than earliness.',
        custom: false,
      });
    }
  }

  // Water: from body size and climate, not a ramp to 4 L.
  const waterBase: ResetRange =
    person.weightKg === null
      ? { min: 1.5, max: 2.5 }
      : { min: (person.weightKg * 30) / 1000, max: (person.weightKg * 35) / 1000 };
  const heat = customisation.environment === 'hot' ? 0.5 : 0;
  const water = {
    min: Math.round((waterBase.min + heat) * 10) / 10,
    max: Math.min(3.5 + heat, Math.round((waterBase.max + heat) * 10) / 10),
  };
  push(
    'hydration',
    { min: Math.min(water.min, water.max), max: water.max },
    'L',
    person.weightKg === null
      ? 'A general adult range; add a weigh-in under Food for one fitted to you. Food counts too.'
      : `30–35 ml per kg${heat ? ', plus half a litre for the heat' : ''}. Food and drinks together; not a target to force.`,
  );

  // Movement: the person's session length, eased in, gentler with a pain flag.
  let movement: ResetRange = scaled(
    { min: person.sessionMinutes * 0.75, max: person.sessionMinutes },
    PHASE_FACTOR[block]! * factor,
    5,
  );
  if (person.experience === 'new') movement = scaled(movement, 0.8, 5);
  if (person.recoveryFlag)
    movement = { min: Math.min(movement.min, 15), max: Math.min(movement.max, 30) };
  if (mode === 'travel') movement = { min: 10, max: Math.min(30, movement.max) };
  if (mode === 'minimum') movement = { min: 10, max: 10 };
  movement = {
    min: Math.min(movement.min, MOVEMENT_CAP),
    max: Math.min(movement.max, MOVEMENT_CAP),
  };
  push(
    'movement',
    movement,
    'min',
    mode === 'travel'
      ? 'Travel: a walk or a bodyweight session wherever you are.'
      : mode === 'minimum'
        ? 'A minimum day: ten minutes counts.'
        : person.recoveryFlag
          ? 'Kept gentle because of the pain flag you recorded. Your Train plan decides the session.'
          : 'Built from the session length you gave Train. On rest days, a walk.',
  );

  if (mode !== 'minimum') {
    const study = scaled(STUDY[block]!, factor * (person.busyWeekdays ? 0.75 : 1), 5);
    push(
      'study',
      mode === 'travel' ? { min: 15, max: Math.min(30, study.max) } : study,
      'min',
      person.busyWeekdays
        ? 'Scaled down because work, school, shifts or caring take part of the day.'
        : 'Focused time on one thing you are learning.',
    );
    push(
      'reading',
      scaled(READING[block]!, factor, 1),
      'pages',
      'Any book. Pages, not minutes, so it is easy to count.',
    );
    push(
      'meditation',
      scaled(MEDITATION[person.mindExperience][block]!, factor, 1),
      'min',
      'Built from the experience you gave in onboarding. Mind has the practices.',
    );
    push(
      'cold',
      { min: 15, max: 30 },
      's',
      'Opt-in. Cool, not icy, and never alone in cold water. See the safety note.',
    );
    push(
      'screen',
      { min: 0, max: customisation.screenCapMinutes },
      'min',
      'The cap you chose. A choice, not a test of character.',
      (range) => `${range.max} min or less`,
    );
    push('evening', null, '', 'Write one thing for tomorrow before bed.');
  }

  // Sleep: 7–9 hours, as a window if the person gave a time.
  const bed =
    customisation.bedTime ??
    (customisation.wakeTime ? shiftTime(customisation.wakeTime, -8 * 60) : null);
  push(
    'sleep',
    { min: 7, max: 9 },
    'h',
    bed ? `Lights out around ${bed}.` : '7–9 hours for most adults.',
  );

  if (programDay % 7 === 0 && mode !== 'minimum') {
    push('weekly', null, '', 'Look back at the week and adjust the next one.');
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Breaks: pause, travel, sick or injured
// ---------------------------------------------------------------------------

export const RESET_BREAK_KINDS = ['pause', 'travel', 'sick'] as const;
export type ResetBreakKind = (typeof RESET_BREAK_KINDS)[number];

export const RESET_BREAK_LABEL: Record<ResetBreakKind, string> = {
  pause: 'Paused',
  travel: 'Travelling',
  sick: 'Sick or injured',
};

export interface ResetBreak {
  readonly id: string;
  readonly kind: ResetBreakKind;
  readonly from: IsoDate;
  /** Inclusive. Null while it is still going. */
  readonly to: IsoDate | null;
}

/** Pause and sick stop the programme clock; travel keeps it running with travel versions. */
export const CLOCK_STOPS: readonly ResetBreakKind[] = ['pause', 'sick'];

export type ResetDayState =
  | { readonly kind: 'not_started'; readonly startsIn: number }
  | { readonly kind: 'active'; readonly programDay: number; readonly mode: 'normal' | 'travel' }
  | { readonly kind: 'paused' | 'sick'; readonly programDay: number; readonly breakId: string }
  | { readonly kind: 'complete'; readonly programDay: number };

function breakOn(breaks: readonly ResetBreak[], date: IsoDate, kinds: readonly ResetBreakKind[]) {
  return breaks.find(
    (entry) =>
      kinds.includes(entry.kind) && entry.from <= date && (entry.to === null || date <= entry.to),
  );
}

/**
 * Which programme day a calendar day is.
 *
 * Counted, never stored: the number of days from the start to this one that
 * the clock was running. A pause or a sick spell stops it, so the programme
 * resumes where it left off; travel does not. Logs keep the programme day
 * they were made on, so adding or ending a break later never rewrites them.
 */
export function resetDayState(
  startedOn: IsoDate,
  length: number,
  breaks: readonly ResetBreak[],
  date: IsoDate,
): ResetDayState {
  if (date < startedOn) return { kind: 'not_started', startsIn: daysBetween(date, startedOn) };
  let counted = 0;
  for (let day = startedOn; day <= date; day = addDays(day, 1)) {
    if (!breakOn(breaks, day, CLOCK_STOPS)) counted += 1;
  }
  const stopped = breakOn(breaks, date, CLOCK_STOPS);
  if (stopped) {
    return {
      kind: stopped.kind === 'sick' ? 'sick' : 'paused',
      programDay: counted,
      breakId: stopped.id,
    };
  }
  if (counted > length) return { kind: 'complete', programDay: length };
  return {
    kind: 'active',
    programDay: counted,
    mode: breakOn(breaks, date, ['travel']) ? 'travel' : 'normal',
  };
}

/** The calendar date a future programme day falls on, given the breaks known now. */
export function dateOfProgramDay(
  startedOn: IsoDate,
  breaks: readonly ResetBreak[],
  programDay: number,
): IsoDate {
  let counted = 0;
  for (let day = startedOn, guard = 0; guard < 2000; day = addDays(day, 1), guard += 1) {
    if (!breakOn(breaks, day, CLOCK_STOPS)) counted += 1;
    if (counted === programDay) return day;
  }
  throw new RangeError('Programme day out of range');
}

/** A new break must not overlap another, and may not start before the programme or in the past. */
export function breakProblem(
  breaks: readonly ResetBreak[],
  candidate: { kind: ResetBreakKind; from: IsoDate; to: IsoDate | null },
  today: IsoDate,
): string | null {
  if (candidate.from < today) return 'A break starts today or later; past days stay as they were.';
  if (candidate.to !== null && candidate.to < candidate.from) return 'The end is before the start.';
  if (candidate.kind === 'travel' && candidate.to === null) return 'Travel needs an end date.';
  if (candidate.to !== null && daysBetween(candidate.from, candidate.to) > 60)
    return 'Sixty days at most. For longer, end the programme and start again later.';
  const end = candidate.to ?? '9999-12-31';
  const clash = breaks.find(
    (entry) => entry.from <= end && candidate.from <= (entry.to ?? '9999-12-31'),
  );
  return clash
    ? `That overlaps ${RESET_BREAK_LABEL[clash.kind].toLowerCase()} from ${formatLocalDate(clash.from, 'short')}.`
    : null;
}

// ---------------------------------------------------------------------------
// Logs, weekly check-ins and the finish
// ---------------------------------------------------------------------------

export const RESET_LOG_STATUSES = ['done', 'skipped'] as const;
export type ResetLogStatus = (typeof RESET_LOG_STATUSES)[number];

export interface ResetLog {
  readonly localDate: IsoDate;
  readonly programDay: number;
  readonly component: ResetComponent;
  readonly status: ResetLogStatus;
  /** What the target said that day, kept so a later edit never rewrites history. */
  readonly targetText: string;
}

export const RESET_CHECKIN_CHOICES = ['easier', 'same', 'harder'] as const;
export type ResetCheckinChoice = (typeof RESET_CHECKIN_CHOICES)[number];

export const RESET_CHECKIN_LABEL: Record<ResetCheckinChoice, string> = {
  easier: 'Ease off next week',
  same: 'Keep it as it is',
  harder: 'A little more next week',
};

export interface ResetCheckin {
  readonly programWeek: number;
  readonly choice: ResetCheckinChoice;
  readonly note: string | null;
}

/** A weekly check-in moves intensity one step, never past ±2. */
export function adjustIntensity(current: number, choice: ResetCheckinChoice): number {
  const next = current + (choice === 'harder' ? 1 : choice === 'easier' ? -1 : 0);
  return Math.max(-2, Math.min(2, next));
}

export interface ResetSummary {
  readonly daysWithSomething: number;
  readonly days: number;
  readonly byComponent: readonly { component: ResetComponent; done: number }[];
}

/** Counts, not a grade: what was done, never a percentage of what was not. */
export function resetSummary(logs: readonly ResetLog[], length: number): ResetSummary {
  const done = logs.filter((log) => log.status === 'done');
  return {
    daysWithSomething: new Set(done.map((log) => log.programDay)).size,
    days: length,
    byComponent: RESET_COMPONENTS.map((component) => ({
      component,
      done: done.filter((log) => log.component === component).length,
    })).filter((entry) => entry.done > 0),
  };
}

/** The source's original numbers for a block, shown beside ARETE's ranges in the preview. */
export const SOURCE_BLOCK_NOTES: readonly string[] = [
  'Source: wake 07:00, 2 L water, 10 push-ups, a 2 km run or 60 min gym, 5 min meditation, 10 pages.',
  'Source: 2.5 L, runs of 2–3 km, 20–30 push-ups, 10–15 min meditation, 15–20 pages.',
  'Source: wake 06:30, 3 L, 40–60 push-ups, runs to 5 km, gym to 90 min, 20 min meditation, 25 pages.',
  'Source: wake 06:00, 3.5 L, 70–80 push-ups, runs to 9 km, gym to 105 min, 25–30 pages.',
  'Source: 4 L, runs to 10 km, gym to 120 min, 25 min meditation, social media to 0.',
  'Source: the same as the last block, with push-ups to 100.',
];
