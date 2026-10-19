import { z } from 'zod';
import { addDays, daysBetween, weekdayOf } from './local-day';
import type { BodyRegion, Injury } from './onboarding';

/**
 * Flexibility programmes: structure, progress and the weekly self-report.
 *
 * A programme is a fixed number of weeks with a fixed number of sessions in
 * each. Progress moves by what has been done, never by the calendar: the
 * current week is the first one with a session still open, any open session
 * in it can be done in any order, and a missed day changes nothing except the
 * date the next session is suggested for. That is the source's own rule
 * ("as long as you complete three days within a week… simply continue on the
 * following day"), and it is also the only honest way to run a programme for
 * someone whose week does not go to plan.
 */

// ---------------------------------------------------------------------------
// Programme shape
// ---------------------------------------------------------------------------

export interface FlexMovement {
  readonly slug: string;
  readonly name: string;
  readonly measure: 'reps' | 'time';
  /** Done on each side in turn. */
  readonly perSide: boolean;
  readonly steps: readonly string[];
  readonly cues: readonly string[];
  readonly mistakes: readonly string[];
  readonly stopIf: readonly string[];
  /** The easier version, always available. */
  readonly easier: { readonly name: string; readonly how: string };
  readonly animation: string | null;
  readonly loads: readonly BodyRegion[];
  /**
   * A loaded end-range position (pancake, roll down). Shown with an extra
   * caution, and replaced by its easier version for anyone with a flag on a
   * region it loads.
   */
  readonly endRange: boolean;
}

export interface FlexPrescription {
  readonly movementSlug: string;
  readonly sets: number;
  readonly reps: number | null;
  readonly seconds: number | null;
}

export interface FlexSessionTemplate {
  readonly week: number;
  readonly day: number;
  readonly items: readonly FlexPrescription[];
}

export type RightsStatus = 'cleared' | 'pending' | 'blocked';

export interface FlexProgram {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly region: BodyRegion;
  readonly weeks: number;
  readonly sessionsPerWeek: number;
  /** A realistic estimate, warm-up included. */
  readonly minutes: number;
  readonly warmup: readonly FlexPrescription[];
  /** For anyone who cannot or would rather not jog or jump. */
  readonly noImpactWarmup: readonly FlexPrescription[];
  readonly sessions: readonly FlexSessionTemplate[];
  readonly maintenance: readonly string[];
  readonly provenance: {
    readonly sourceSlug: string;
    readonly filename: string;
    readonly note: string;
  };
  readonly rightsStatus: RightsStatus;
}

/**
 * Whether a programme may be offered. Cleared always; pending only where the
 * caller allows it (demo mode); blocked never.
 */
export function isProgramOffered(status: RightsStatus, includeRightsPending: boolean): boolean {
  return status === 'cleared' || (includeRightsPending && status === 'pending');
}

export function sessionKey(week: number, day: number): string {
  return `w${week}d${day}`;
}

export function templateFor(
  program: FlexProgram,
  week: number,
  day: number,
): FlexSessionTemplate | null {
  return program.sessions.find((session) => session.week === week && session.day === day) ?? null;
}

// ---------------------------------------------------------------------------
// Enrolment and session records
// ---------------------------------------------------------------------------

export const WARMUP_CHOICES = ['standard', 'no_impact', 'already_warm'] as const;
export type WarmupChoice = (typeof WARMUP_CHOICES)[number];

export const flexWeekdaysSchema = z
  .array(z.int().min(0).max(6))
  .length(3, 'Pick three days.')
  .refine((days) => new Set(days).size === days.length, 'Each day once.');

export interface FlexEnrolment {
  readonly id: string;
  readonly programSlug: string;
  readonly startedOn: string;
  readonly weekdays: readonly number[];
  readonly status: 'active' | 'completed' | 'ended';
  readonly endedAt: string | null;
}

export const flexItemSchema = z.object({
  movementSlug: z.string().trim().min(1).max(60),
  side: z.enum(['left', 'right', 'both']),
  setsDone: z.int().min(0).max(10),
  easier: z.boolean().default(false),
  /** How strong the stretch felt, 1–10. Mild tension is roughly 3 to 5. */
  intensity: z.int().min(1).max(10).nullable().default(null),
});
export type FlexItemRecord = z.infer<typeof flexItemSchema>;

export type FlexSessionStatus = 'running' | 'completed' | 'stopped' | 'skipped';

export interface FlexSessionRecord {
  readonly id: string;
  readonly enrolmentId: string;
  readonly week: number;
  readonly day: number;
  readonly localDate: string;
  readonly status: FlexSessionStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly warmup: WarmupChoice | null;
  readonly items: readonly FlexItemRecord[];
  readonly notes: string | null;
  readonly painReported: boolean;
  readonly painNote: string | null;
  readonly skipReason: string | null;
}

// ---------------------------------------------------------------------------
// Where the person is
// ---------------------------------------------------------------------------

export interface FlexPlannedSession {
  readonly template: FlexSessionTemplate;
  /** The next day on their schedule this session is suggested for. */
  readonly suggestedDate: string;
}

export interface FlexProgramState {
  readonly finished: boolean;
  /** 1-based. Equal to `weeks` once finished. */
  readonly currentWeek: number;
  /** Open sessions in the current week, in day order; any may be done next. */
  readonly open: readonly FlexPlannedSession[];
  /** Plain array rather than a Set, so the state crosses the server/client boundary as is. */
  readonly closedKeys: readonly string[];
  readonly completed: number;
  readonly skipped: number;
  readonly total: number;
  /** Scheduled days since the last session that passed with nothing done. */
  readonly missedDays: number;
  /** Days since the last completed session, or since enrolment. */
  readonly gapDays: number;
  /** After a long gap, start with the easier versions. */
  readonly easeBackIn: boolean;
  /** One sentence about the above, or null when there is nothing to say. */
  readonly message: string | null;
}

const EASE_BACK_AFTER_DAYS = 14;

function nextScheduledDates(weekdays: readonly number[], from: string, count: number): string[] {
  const allowed = new Set(weekdays);
  const dates: string[] = [];
  for (let offset = 0; dates.length < count && offset < 7 * (count + 1); offset += 1) {
    const date = addDays(from, offset);
    if (allowed.has(weekdayOf(date))) dates.push(date);
  }
  return dates;
}

/**
 * Derives where someone is from what they have done.
 *
 * Only `completed` and `skipped` close a session. A session stopped for pain
 * stays open — the person did not finish it, and pretending otherwise would
 * move them on to harder positions on the strength of a session that hurt.
 */
export function programState(
  program: FlexProgram,
  enrolment: FlexEnrolment,
  records: readonly FlexSessionRecord[],
  today: string,
): FlexProgramState {
  const mine = records.filter((record) => record.enrolmentId === enrolment.id);
  const closedKeys = new Set(
    mine
      .filter((record) => record.status === 'completed' || record.status === 'skipped')
      .map((record) => sessionKey(record.week, record.day)),
  );
  const completed = new Set(
    mine
      .filter((record) => record.status === 'completed')
      .map((record) => sessionKey(record.week, record.day)),
  ).size;
  const skipped = closedKeys.size - completed;
  const total = program.sessions.length;

  let currentWeek = program.weeks;
  let finished = true;
  for (let week = 1; week <= program.weeks; week += 1) {
    const open = program.sessions.some(
      (session) => session.week === week && !closedKeys.has(sessionKey(session.week, session.day)),
    );
    if (open) {
      currentWeek = week;
      finished = false;
      break;
    }
  }

  const openTemplates = finished
    ? []
    : program.sessions
        .filter(
          (session) =>
            session.week === currentWeek && !closedKeys.has(sessionKey(session.week, session.day)),
        )
        .sort((a, b) => a.day - b.day);
  const dates = nextScheduledDates(enrolment.weekdays, today, openTemplates.length);
  const open = openTemplates.map((template, index) => ({
    template,
    suggestedDate: dates[index] ?? today,
  }));

  const lastDone = mine
    .filter((record) => record.status === 'completed')
    .map((record) => record.localDate)
    .sort()
    .at(-1);
  const since = lastDone ?? addDays(enrolment.startedOn, -1);
  const gapDays = Math.max(0, daysBetween(lastDone ?? enrolment.startedOn, today));

  let missedDays = 0;
  if (!finished) {
    const allowed = new Set(enrolment.weekdays);
    for (let date = addDays(since, 1); date < today; date = addDays(date, 1)) {
      if (allowed.has(weekdayOf(date))) missedDays += 1;
    }
  }

  const easeBackIn = !finished && lastDone !== undefined && gapDays >= EASE_BACK_AFTER_DAYS;

  let message: string | null = null;
  if (finished) {
    message = 'All four weeks done. What you keep depends on keeping at it — see below for how.';
  } else if (easeBackIn) {
    message = `It has been ${gapDays} days. Nothing is lost: carry on from week ${currentWeek}, and start with the easier version of each movement this time.`;
  } else if (missedDays > 0) {
    message = `${missedDays === 1 ? 'One planned day' : `${missedDays} planned days`} passed without a session. Nothing is lost — the next session is still week ${currentWeek}, whenever you do it.`;
  }

  return {
    finished,
    currentWeek,
    open,
    closedKeys: [...closedKeys].sort(),
    completed,
    skipped,
    total,
    missedDays,
    gapDays,
    easeBackIn,
    message,
  };
}

// ---------------------------------------------------------------------------
// Who should not start, and who should start gently
// ---------------------------------------------------------------------------

export type FlexEligibility =
  | { readonly kind: 'ok' }
  | { readonly kind: 'gentle'; readonly regions: readonly BodyRegion[]; readonly message: string }
  | {
      readonly kind: 'professional';
      readonly regions: readonly BodyRegion[];
      readonly message: string;
    };

/**
 * Decides whether the programme should be offered as written.
 *
 * A severe flag on a region the programme loads routes to professional
 * guidance rather than to the programme: stretching an acutely injured
 * hamstring or back is not a self-management decision. A mild or moderate
 * flag offers the programme with every movement in its easier version.
 */
export function flexEligibility(
  program: FlexProgram,
  flags: readonly Injury[],
  movements: readonly FlexMovement[],
): FlexEligibility {
  const loaded = new Set<BodyRegion>([program.region]);
  for (const session of program.sessions) {
    for (const item of session.items) {
      for (const region of movements.find((movement) => movement.slug === item.movementSlug)
        ?.loads ?? [])
        loaded.add(region);
    }
  }
  const relevant = flags.filter((flag) => loaded.has(flag.region));
  const severe = [
    ...new Set(relevant.filter((flag) => flag.severity === 'severe').map((flag) => flag.region)),
  ];
  if (severe.length > 0) {
    return {
      kind: 'professional',
      regions: severe,
      message: `You flagged a severe problem with your ${severe.join(' and ')}. Please have it looked at by a physiotherapist or doctor before starting a stretching programme; they can tell you which of these movements suit you.`,
    };
  }
  const milder = [...new Set(relevant.map((flag) => flag.region))];
  if (milder.length > 0) {
    return {
      kind: 'gentle',
      regions: milder,
      message: `Because your ${milder.join(' and ')} ${milder.length === 1 ? 'is' : 'are'} flagged, every movement starts in its easier version. If it has been bothering you for a while, a physiotherapist is worth seeing.`,
    };
  }
  return { kind: 'ok' };
}

export const PAIN_RULE = {
  expected:
    'Mild tension in the back of the thigh is expected. It should ease when you come out of the stretch.',
  stop: 'Sharp, radiating (travelling down the leg) or worsening pain ends the session. Stop, and do not push through it.',
  injury: 'If you have an injury that is not fully healed, ask a physiotherapist before starting.',
} as const;

export const FLEX_DISCLAIMER =
  'Stretching is not guaranteed to prevent injury, and four weeks is not a promise of a result. Range of motion changes at different speeds for different people.';

// ---------------------------------------------------------------------------
// The weekly self-report
// ---------------------------------------------------------------------------

export const TOE_TOUCH_LEVELS = [
  'knees',
  'mid_shin',
  'ankles',
  'toes',
  'floor_fingertips',
  'floor_palms',
] as const;
export const LEG_RAISE_LEVELS = ['below_45', 'to_70', 'to_90', 'past_90'] as const;
export const EASE_LEVELS = ['hard', 'some_effort', 'easy'] as const;
export const PAIN_LEVELS = ['none', 'mild', 'more'] as const;

export const TOE_TOUCH_LABEL: Record<(typeof TOE_TOUCH_LEVELS)[number], string> = {
  knees: 'Knees',
  mid_shin: 'Mid-shin',
  ankles: 'Ankles',
  toes: 'Toes',
  floor_fingertips: 'Floor, fingertips',
  floor_palms: 'Floor, palms',
};

export const LEG_RAISE_LABEL: Record<(typeof LEG_RAISE_LEVELS)[number], string> = {
  below_45: 'Below 45°',
  to_70: '45–70°',
  to_90: '70–90°',
  past_90: 'Past vertical',
};

export const EASE_LABEL: Record<(typeof EASE_LEVELS)[number], string> = {
  hard: 'Hard',
  some_effort: 'Some effort',
  easy: 'Easy',
};

export const PAIN_LABEL: Record<(typeof PAIN_LEVELS)[number], string> = {
  none: 'No pain',
  mild: 'Mild discomfort',
  more: 'More than mild',
};

export const checkinSchema = z.object({
  /** 0 is the baseline, before week one. */
  week: z.int().min(0).max(12),
  /** Standing forward fold, knees straight, as far as is pain-free. */
  toeTouch: z.enum(TOE_TOUCH_LEVELS),
  /** Lying straight-leg raise, each side, as far as is pain-free. */
  legRaiseLeft: z.enum(LEG_RAISE_LEVELS),
  legRaiseRight: z.enum(LEG_RAISE_LEVELS),
  /** How tight the backs of the thighs feel, 0–10. */
  tightness: z.int().min(0).max(10),
  /** Putting on socks standing up. */
  socks: z.enum(EASE_LEVELS),
  /** Picking something up from the floor with straight-ish legs. */
  pickUp: z.enum(EASE_LEVELS),
  pain: z.enum(PAIN_LEVELS),
  notes: z.string().trim().max(500).nullable().default(null),
});
export type Checkin = z.infer<typeof checkinSchema>;
export type CheckinInput = z.input<typeof checkinSchema>;

export interface StoredCheckin extends Checkin {
  readonly localDate: string;
}

export interface CheckinChange {
  readonly measure: string;
  readonly from: string;
  readonly to: string;
  /** In words, and never a verdict: "further", "less far", "the same". */
  readonly change: string;
  readonly direction: 'more' | 'less' | 'same';
}

function ordinalChange<T extends string>(
  measure: string,
  levels: readonly T[],
  labels: Record<T, string>,
  from: T,
  to: T,
  words: { more: string; less: string },
): CheckinChange {
  const delta = levels.indexOf(to) - levels.indexOf(from);
  return {
    measure,
    from: labels[from],
    to: labels[to],
    direction: delta > 0 ? 'more' : delta < 0 ? 'less' : 'same',
    change: delta > 0 ? words.more : delta < 0 ? words.less : 'the same',
  };
}

/**
 * Compares two self-reports, measure by measure.
 *
 * There is no total and no score: the measures are not commensurable, and a
 * single number would invite the person to chase it. Each line says what
 * moved and which way, in plain words.
 */
export function compareCheckins(from: Checkin, to: Checkin): CheckinChange[] {
  const tightnessDelta = to.tightness - from.tightness;
  return [
    ordinalChange(
      'Forward fold reach',
      TOE_TOUCH_LEVELS,
      TOE_TOUCH_LABEL,
      from.toeTouch,
      to.toeTouch,
      { more: 'further', less: 'less far' },
    ),
    ordinalChange(
      'Leg raise, left',
      LEG_RAISE_LEVELS,
      LEG_RAISE_LABEL,
      from.legRaiseLeft,
      to.legRaiseLeft,
      { more: 'higher', less: 'lower' },
    ),
    ordinalChange(
      'Leg raise, right',
      LEG_RAISE_LEVELS,
      LEG_RAISE_LABEL,
      from.legRaiseRight,
      to.legRaiseRight,
      { more: 'higher', less: 'lower' },
    ),
    {
      measure: 'Tightness',
      from: `${from.tightness}/10`,
      to: `${to.tightness}/10`,
      direction: tightnessDelta < 0 ? 'more' : tightnessDelta > 0 ? 'less' : 'same',
      change: tightnessDelta < 0 ? 'looser' : tightnessDelta > 0 ? 'tighter' : 'the same',
    },
    ordinalChange('Socks, standing', EASE_LEVELS, EASE_LABEL, from.socks, to.socks, {
      more: 'easier',
      less: 'harder',
    }),
    ordinalChange('Picking things up', EASE_LEVELS, EASE_LABEL, from.pickUp, to.pickUp, {
      more: 'easier',
      less: 'harder',
    }),
  ];
}

/** Which check-in, if any, is due now: the baseline first, then one per finished week. */
export function checkinDue(
  state: FlexProgramState,
  checkins: readonly Pick<Checkin, 'week'>[],
): number | null {
  const done = new Set(checkins.map((checkin) => checkin.week));
  if (!done.has(0)) return 0;
  const lastFinishedWeek = state.finished ? state.currentWeek : state.currentWeek - 1;
  if (lastFinishedWeek >= 1 && !done.has(lastFinishedWeek)) return lastFinishedWeek;
  return null;
}

/** A self-report of more-than-mild pain routes to professional guidance. */
export function checkinNeedsGuidance(checkin: Pick<Checkin, 'pain'>): boolean {
  return checkin.pain === 'more';
}
