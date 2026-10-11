import { addDays, weekdayOf } from './local-day';
import type { FocusArea, OnboardingProfile } from './onboarding';
import {
  evaluateSafety,
  isBlocked,
  notableDecisions,
  type SafetyModule,
  type SafetyReport,
} from './safety';
import type { CommitmentKind, IsoDate } from './types';

/**
 * The first-week plan generator.
 *
 * Deterministic and pure: the same profile and start date always produce the
 * same week, byte for byte. No clock is read, no randomness is used, and no
 * model is consulted — which is what makes the persona tests in
 * `plan-generator.test.ts` meaningful rather than decorative.
 *
 * It is also, on purpose, **conservative**. Week one is not the week that
 * proves anything. Someone who can train five days gets four, someone brand new
 * gets two, and every day has a version that survives a bad day. The failure
 * this is designed against is the one in the source material: a calendar that
 * escalates on a schedule regardless of the person following it.
 */
export interface PlanItem {
  readonly id: string;
  readonly kind: CommitmentKind;
  readonly title: string;
  readonly isMinimum: boolean;
  /** Why this is here, in the user's terms. Every item has one. */
  readonly because: string;
  readonly minutes?: number;
  /** Set when a safety rule governs this item. */
  readonly module?: SafetyModule;
}

export type DayShape = 'train' | 'move' | 'rest';

export interface DraftDay {
  readonly date: IsoDate;
  readonly weekday: number;
  readonly shape: DayShape;
  readonly items: readonly PlanItem[];
}

export interface DraftHabit {
  readonly title: string;
  readonly because: string;
}

export interface DraftWeek {
  readonly startsOn: IsoDate;
  readonly timeZone: string;
  readonly days: readonly DraftDay[];
  /** Three at most, ever. */
  readonly habits: readonly DraftHabit[];
  readonly safety: SafetyReport;
  /** Plain-English explanations shown above the week. */
  readonly notes: readonly string[];
}

export interface GenerateOptions {
  readonly startDate: IsoDate;
  readonly timeZone: string;
}

/** Hard cap. Not a default — a cap. Week one never schedules more than this. */
const MAX_TRAINING_DAYS = 4;
const MAX_HABITS = 3;

const BASE_TRAINING_DAYS: Record<OnboardingProfile['training']['experience'], number> = {
  new: 2,
  returning: 3,
  consistent: 3,
  experienced: 4,
};

const MEDITATION_MINUTES: Record<OnboardingProfile['mind']['meditationExperience'], number> = {
  new: 5,
  some: 10,
  regular: 15,
};

const MEDITATION_DAYS: Record<OnboardingProfile['mind']['meditationExperience'], number> = {
  new: 3,
  some: 4,
  regular: 5,
};

function has(focuses: readonly FocusArea[], area: FocusArea): boolean {
  return focuses.includes(area);
}

/**
 * Picks `count` dates, preferring the user's chosen weekdays and avoiding
 * back-to-back days. Falls back in a stated order rather than silently
 * scheduling on a day the user said they are never free.
 */
function spreadDays(
  dates: readonly IsoDate[],
  allowedWeekdays: ReadonlySet<number>,
  count: number,
): IsoDate[] {
  if (count <= 0) return [];

  const candidates = dates.filter((date) => allowedWeekdays.has(weekdayOf(date)));
  const chosen: IsoDate[] = [];

  // First pass: never two days running.
  for (const date of candidates) {
    if (chosen.length >= count) break;
    const previous = chosen[chosen.length - 1];
    if (previous && Math.abs(Date.parse(date) - Date.parse(previous)) <= 86_400_000) continue;
    chosen.push(date);
  }

  // Second pass: if the week is too short for that, accept adjacency rather
  // than quietly dropping sessions the user asked for.
  for (const date of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(date)) chosen.push(date);
  }

  return chosen.sort();
}

function trainingDayCount(profile: OnboardingProfile, safety: SafetyReport): number {
  const { training } = profile;
  let count = BASE_TRAINING_DAYS[training.experience];

  if (training.recentActivity === 'none') count -= 1;
  if (training.recentActivity === 'high') count += 1;

  // A rerouted or blocked high-intensity decision means the week should also be
  // shorter, not merely gentler.
  const intensity = safety.decisions.find((decision) => decision.module === 'high_intensity');
  if (intensity && intensity.outcome !== 'allowed') count = Math.min(count, 3);
  if (safety.clearanceRecommended) count = Math.min(count, 2);

  return Math.max(1, Math.min(MAX_TRAINING_DAYS, count));
}

function chooseHabits(profile: OnboardingProfile): DraftHabit[] {
  const { intent, mind, food } = profile;
  const focuses = intent.focuses;
  const candidates: DraftHabit[] = [];

  if (has(focuses, 'calm') || mind.meditationExperience !== 'new') {
    candidates.push({
      title: `Sit for ${MEDITATION_MINUTES[mind.meditationExperience]} minutes`,
      because:
        'You said calm was part of why you are here, and this is the smallest version of it.',
    });
  }

  if (has(focuses, 'focus')) {
    candidates.push({
      title: 'One focus block',
      because: 'One uninterrupted block a day is the habit; the length can come later.',
    });
  }

  if (has(focuses, 'reflection')) {
    candidates.push({
      title: 'Two lines in the evening',
      because: 'Two lines is short enough to actually do, and long enough to notice a pattern.',
    });
  }

  if (has(focuses, 'food') && food.loggingGoal !== 'none') {
    candidates.push({
      title: 'Log one meal',
      because:
        food.loggingGoal === 'awareness'
          ? 'Awareness, not accounting. One meal is enough to start noticing.'
          : 'One meal a day is a sustainable place to start tracking from.',
    });
  }

  if (has(focuses, 'consistency')) {
    candidates.push({
      title: 'Plan tomorrow in one line',
      because: 'Deciding tomorrow tonight is most of what consistency actually is.',
    });
  }

  if (candidates.length === 0) {
    candidates.push(
      {
        title: `Sit for ${MEDITATION_MINUTES[mind.meditationExperience]} minutes`,
        because: 'A quiet default, since you skipped the question. Change or remove it.',
      },
      {
        title: 'Plan tomorrow in one line',
        because: 'A quiet default, since you skipped the question. Change or remove it.',
      },
    );
  }

  return candidates.slice(0, MAX_HABITS);
}

function trainingTitle(profile: OnboardingProfile, safety: SafetyReport): string {
  const { training } = profile;
  const equipment = training.equipment.includes('none') ? 'Bodyweight' : 'Full-body';
  const effort = isBlocked(safety, 'high_intensity') ? 'easy' : 'moderate';
  return `${equipment} session · ${effort}`;
}

function mobilityTitle(safety: SafetyReport): { title: string; because: string } {
  if (isBlocked(safety, 'loaded_mobility')) {
    return {
      title: 'Gentle mobility · unloaded',
      because:
        'Nothing loads the area you told us about. This is range of motion only, and you can stop at any point.',
    };
  }
  if (safety.regressedRegions.length > 0) {
    return {
      title: 'Mobility · easier versions',
      because: `The easier version of each movement, because you told us your ${safety.regressedRegions.join(' and ')} is not right at the moment.`,
    };
  }
  return {
    title: 'Mobility',
    because: 'Short and frequent beats long and occasional for range of motion.',
  };
}

/**
 * Generates the seven-day draft.
 *
 * Nothing here is saved. The user sees the whole week, changes what they want,
 * and only then does any of it become their plan.
 */
export function generateFirstWeek(profile: OnboardingProfile, options: GenerateOptions): DraftWeek {
  const safety = evaluateSafety(profile, options.startDate);
  const dates = Array.from({ length: 7 }, (_, offset) => addDays(options.startDate, offset));

  const available = new Set(
    profile.schedule.availableWeekdays.length > 0
      ? profile.schedule.availableWeekdays
      : [0, 1, 2, 3, 4, 5, 6],
  );

  const preferred = new Set(profile.training.preferredWeekdays.filter((day) => available.has(day)));

  const trainingWeekdays = preferred.size > 0 ? preferred : available;
  const trainingDates = new Set(
    spreadDays(dates, trainingWeekdays, trainingDayCount(profile, safety)),
  );

  const wantsFlexibility = has(profile.intent.focuses, 'flexibility');
  const mobilityTarget = wantsFlexibility ? 3 : 2;
  const mobilityDates = new Set(
    spreadDays(
      dates.filter((date) => !trainingDates.has(date)),
      available,
      mobilityTarget,
    ),
  );

  const mindTarget = Math.min(
    5,
    MEDITATION_DAYS[profile.mind.meditationExperience] +
      (has(profile.intent.focuses, 'calm') ? 1 : 0),
  );
  const mindDates = new Set(spreadDays(dates, available, mindTarget));

  // Contrast therapy is only ever scheduled because the user chose the pack.
  // When they have and a safety rule says no, the slot is not silently dropped:
  // it becomes the stated alternative, so the week still has a recovery ritual
  // in it and the reason is visible.
  const choseContrast = profile.mind.chosenPackSlugs.includes('contrast-therapy');
  const contrastDecision = safety.decisions.find(
    (decision) => decision.module === 'contrast_therapy',
  );
  const contrastDates = choseContrast
    ? new Set(spreadDays(dates, available, 2))
    : new Set<IsoDate>();

  const habits = chooseHabits(profile);
  const wantsFocusBlocks =
    has(profile.intent.focuses, 'focus') || profile.schedule.planningStyle === 'structured';

  const mobility = mobilityTitle(safety);
  const days: DraftDay[] = dates.map((date) => {
    const items: PlanItem[] = [];
    const push = (item: Omit<PlanItem, 'id'>): void => {
      items.push({ ...item, id: `${date}-${items.length + 1}` });
    };

    const isTraining = trainingDates.has(date);
    const isMobility = mobilityDates.has(date);
    const isAvailable = available.has(weekdayOf(date));

    if (isTraining) {
      push({
        kind: 'workout',
        title: trainingTitle(profile, safety),
        isMinimum: false,
        because:
          profile.training.preferredWeekdays.length > 0
            ? 'One of the days you said you prefer to train.'
            : 'Spaced out across the week so no two hard days run together.',
        minutes: profile.training.sessionMinutes,
        module: 'high_intensity',
      });
    }

    if (isMobility) {
      push({
        kind: 'mobility',
        title: mobility.title,
        isMinimum: false,
        because: mobility.because,
        minutes: 10,
        module: 'loaded_mobility',
      });
    }

    if (contrastDates.has(date) && contrastDecision) {
      if (contrastDecision.outcome === 'blocked') {
        push({
          kind: 'mind',
          title: 'Warm shower and five quiet minutes',
          isMinimum: false,
          because: `${contrastDecision.reason} This is the gentle version of the same slot.`,
          minutes: 5,
          module: 'contrast_therapy',
        });
      } else if (contrastDecision.outcome === 'rerouted') {
        push({
          kind: 'mind',
          title: contrastDecision.alternative ?? 'Warm shower and gentle mobility',
          isMinimum: false,
          because: contrastDecision.reason,
          minutes: 10,
          module: 'contrast_therapy',
        });
      } else {
        push({
          kind: 'mind',
          title: 'Contrast therapy · conservative cycle',
          isMinimum: false,
          because:
            contrastDecision.outcome === 'requires_acknowledgement'
              ? 'You chose this pack. It opens behind a safety notice, and the defaults are milder than the source material.'
              : 'You chose this pack. The defaults are milder than the source material, and you can stop at any point.',
          minutes: 15,
          module: 'contrast_therapy',
        });
      }
    }

    if (mindDates.has(date)) {
      push({
        kind: 'mind',
        // The duration lives in `minutes` and is rendered beside the title.
        // Putting it in the title too makes the row say it twice.
        title: 'Sit quietly',
        isMinimum: false,
        because:
          profile.mind.meditationExperience === 'new'
            ? 'Five minutes is a real practice. Longer sittings can wait.'
            : 'Matched to the practice you said you already have.',
        minutes: MEDITATION_MINUTES[profile.mind.meditationExperience],
      });
    }

    if (wantsFocusBlocks && isAvailable && !items.some((item) => item.kind === 'focus')) {
      push({
        kind: 'focus',
        title: 'One focus block',
        isMinimum: false,
        because: 'One block, on a day you said you are free. Length is adjustable.',
        minutes: 25,
      });
    }

    if (profile.food.loggingGoal !== 'none') {
      push({
        kind: 'food',
        title: profile.food.hideCalorieNumbers ? 'Note what you ate' : 'Log one meal',
        isMinimum: false,
        because: profile.food.hideCalorieNumbers
          ? 'You asked not to see numbers, so this is a note rather than a total.'
          : 'One meal, not every meal. Awareness first.',
      });
    }

    push({
      kind: 'review',
      title: 'Two lines before bed',
      isMinimum: false,
      because: 'The evening review is what makes the rest of the week adapt.',
    });

    // The minimum viable day: the smallest, most reliable things first, so that
    // a bad day still has a version that counts. Training is last on the list
    // on purpose — a minimum that depends on a gym session is not a minimum.
    const minimumOrder: CommitmentKind[] = [
      'mind',
      'review',
      'food',
      'focus',
      'mobility',
      'workout',
    ];
    const wanted = Math.min(profile.minimum.minimumDaySize, items.length);
    const minimumIds = new Set<string>();
    for (const kind of minimumOrder) {
      if (minimumIds.size >= wanted) break;
      for (const candidate of items.filter((item) => item.kind === kind)) {
        if (minimumIds.size >= wanted) break;
        minimumIds.add(candidate.id);
      }
    }

    const shape: DayShape = isTraining ? 'train' : isMobility ? 'move' : 'rest';

    return {
      date,
      weekday: weekdayOf(date),
      shape,
      items: items.map((item) => (minimumIds.has(item.id) ? { ...item, isMinimum: true } : item)),
    };
  });

  const notes: string[] = [
    'This first week is deliberately lighter than what you can probably manage. Week one is for showing up, not for proving anything.',
    `Every day has a minimum version — ${profile.minimum.minimumDaySize === 1 ? 'one thing' : `${profile.minimum.minimumDaySize} things`} that still counts when the day is against you.`,
  ];

  if (days.some((day) => day.shape === 'rest')) {
    notes.push('The quiet days are part of the plan, not gaps in it.');
  }

  for (const decision of notableDecisions(safety)) {
    notes.push(
      decision.alternative
        ? `${decision.reason} Instead: ${decision.alternative}`
        : decision.reason,
    );
  }

  if (safety.clearanceRecommended) {
    notes.push(
      'Worth raising with a clinician before you push the intensity up. ARETE is not able to tell you whether that is necessary.',
    );
  }

  return { startsOn: options.startDate, timeZone: options.timeZone, days, habits, safety, notes };
}

/** Total scheduled minutes in the week — used by the review screen and the tests. */
export function weeklyMinutes(week: DraftWeek): number {
  return week.days.reduce(
    (total, day) => total + day.items.reduce((sum, item) => sum + (item.minutes ?? 0), 0),
    0,
  );
}

export function countDays(week: DraftWeek, shape: DayShape): number {
  return week.days.filter((day) => day.shape === shape).length;
}
