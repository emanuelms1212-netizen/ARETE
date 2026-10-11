import { z } from 'zod';

/**
 * What onboarding asks, and what a skipped answer means.
 *
 * Every step is skippable and every field has a default, because the flow has
 * to be completable in four minutes by someone who wants to answer almost
 * nothing. A skipped step is not an empty profile — it is the conservative
 * profile, which is the one that generates the gentlest plan.
 *
 * Nothing here is asked twice and nothing is inferred. Religion, ethnicity and
 * body weight are not asked at all (PRODUCT_SPEC §5.1).
 */
export const ONBOARDING_STEPS = [
  'intent',
  'schedule',
  'training',
  'health',
  'food',
  'mind',
  'age',
  'minimum',
  'review',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Shown above each step: why this is being asked at all. */
export const STEP_RATIONALE: Record<OnboardingStep, string> = {
  intent: 'So the first week is about what you actually came here for.',
  schedule: 'So nothing is scheduled on a day you are never free.',
  training: 'So the first week matches what you can currently do, not what you might manage later.',
  health: 'So the app can decline to suggest something unwise, and tell you why it declined.',
  food: 'So food logging matches what you want from it — including not seeing numbers at all.',
  mind: 'So you are offered practices you chose, and never ones you did not.',
  age: 'Only the year, and only to avoid generating calorie targets for anyone under 18.',
  minimum: 'So a bad day has a version of itself that still counts.',
  review: 'Nothing is saved until you have seen the whole week and changed what you want.',
};

export const FOCUS_AREAS = [
  'consistency',
  'focus',
  'fitness',
  'flexibility',
  'food',
  'calm',
  'reflection',
] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const intentAnswersSchema = z.object({
  focuses: z.array(z.enum(FOCUS_AREAS)).max(7).default([]),
  /** Three at most. A list of twelve goals is a list of none. */
  goals: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
});

export const scheduleAnswersSchema = z.object({
  availableWeekdays: z.array(z.int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  planningStyle: z.enum(['light', 'structured']).default('light'),
  weekdayConstraint: z.enum(['none', 'work', 'school', 'shift', 'caring']).default('none'),
  /** Both optional, and no default is imposed. See SOURCE_MAP §1. */
  wakeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  sleepTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export const EQUIPMENT = [
  'none',
  'bands',
  'dumbbells',
  'barbell',
  'machines',
  'pull_up_bar',
  'pool',
] as const;

export const trainingAnswersSchema = z.object({
  experience: z.enum(['new', 'returning', 'consistent', 'experienced']).default('returning'),
  recentActivity: z.enum(['none', 'light', 'moderate', 'high']).default('light'),
  desiredOutcomes: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
  equipment: z.array(z.enum(EQUIPMENT)).min(1).default(['none']),
  sessionMinutes: z.int().min(5).max(180).default(30),
  preferredWeekdays: z.array(z.int().min(0).max(6)).default([]),
});

export const BODY_REGIONS = [
  'hamstrings',
  'hips',
  'spine',
  'shoulders',
  'knees',
  'ankles',
  'wrists',
  'neck',
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export const injurySchema = z.object({
  region: z.enum(BODY_REGIONS),
  severity: z.enum(['mild', 'moderate', 'severe']),
  since: z.iso.date().optional(),
});
export type Injury = z.infer<typeof injurySchema>;

export const healthAnswersSchema = z.object({
  pregnancyStatus: z
    .enum(['not_applicable', 'pregnant', 'postpartum', 'prefer_not_to_say'])
    .default('not_applicable'),
  cardiovascularOrFaintingHistory: z.boolean().default(false),
  heatSensitivity: z.boolean().default(false),
  coldSensitivity: z.boolean().default(false),
  medicalClearanceNeeded: z.boolean().default(false),
  medicalClearanceConfirmed: z.boolean().default(false),
  injuries: z.array(injurySchema).max(8).default([]),
  mobilityLimitations: z.string().trim().max(400).optional(),
});

export const foodAnswersSchema = z.object({
  loggingGoal: z.enum(['none', 'awareness', 'protein', 'full_macros']).default('awareness'),
  hideCalorieNumbers: z.boolean().default(false),
  dietaryPreferences: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  allergies: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  unitSystem: z.enum(['metric', 'us']).default('metric'),
});

export const mindAnswersSchema = z.object({
  meditationExperience: z.enum(['new', 'some', 'regular']).default('new'),
  breathworkExperience: z.enum(['new', 'some', 'regular']).default('new'),
  /** Only ever written from an explicit choice. Never inferred from anything. */
  chosenPackSlugs: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});

export const ageAnswersSchema = z.object({
  birthYear: z.int().min(1900).max(2100).optional(),
  /** Set only when a guardian or clinician has agreed targets for a minor. */
  guardianConfirmed: z.boolean().default(false),
});

export const minimumAnswersSchema = z.object({
  /** One, two or three things. Not five. The point is that it survives a bad day. */
  minimumDaySize: z.int().min(1).max(3).default(1),
});

/**
 * `prefault` rather than `default`: it supplies `{}` *before* parsing, so each
 * step's own field defaults fill in. A skipped step therefore yields the
 * conservative answers rather than an absent object the generator would have to
 * guess around.
 */
export const onboardingProfileSchema = z.object({
  intent: intentAnswersSchema.prefault({}),
  schedule: scheduleAnswersSchema.prefault({}),
  training: trainingAnswersSchema.prefault({}),
  health: healthAnswersSchema.prefault({}),
  food: foodAnswersSchema.prefault({}),
  mind: mindAnswersSchema.prefault({}),
  age: ageAnswersSchema.prefault({}),
  minimum: minimumAnswersSchema.prefault({}),
});

export type IntentAnswers = z.infer<typeof intentAnswersSchema>;
export type ScheduleAnswers = z.infer<typeof scheduleAnswersSchema>;
export type TrainingAnswers = z.infer<typeof trainingAnswersSchema>;
export type HealthAnswers = z.infer<typeof healthAnswersSchema>;
export type FoodAnswers = z.infer<typeof foodAnswersSchema>;
export type MindAnswers = z.infer<typeof mindAnswersSchema>;
export type AgeAnswers = z.infer<typeof ageAnswersSchema>;
export type MinimumAnswers = z.infer<typeof minimumAnswersSchema>;
export type OnboardingProfile = z.infer<typeof onboardingProfileSchema>;

/** The conservative profile: what a user who skipped everything gets. */
export function defaultProfile(): OnboardingProfile {
  return onboardingProfileSchema.parse({});
}

const stepSchemas = {
  intent: intentAnswersSchema,
  schedule: scheduleAnswersSchema,
  training: trainingAnswersSchema,
  health: healthAnswersSchema,
  food: foodAnswersSchema,
  mind: mindAnswersSchema,
  age: ageAnswersSchema,
  minimum: minimumAnswersSchema,
} as const;

export type AnswerableStep = keyof typeof stepSchemas;

export function isAnswerableStep(step: string): step is AnswerableStep {
  return step in stepSchemas;
}

/** Validates one step's answers. Throws with a readable message if they are wrong. */
export function parseStepAnswers(step: AnswerableStep, value: unknown) {
  return stepSchemas[step].parse(value);
}

export interface OnboardingProgress {
  readonly currentStep: OnboardingStep;
  readonly completedSteps: readonly OnboardingStep[];
  readonly skippedSteps: readonly OnboardingStep[];
  readonly completedAt: string | null;
}

/** The next step after `step`, or null at the end. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[index + 1] ?? null;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index > 0 ? (ONBOARDING_STEPS[index - 1] ?? null) : null;
}

/** 0 to 1, for the progress indicator. `review` is the end, not a step to fill in. */
export function completionRatio(progress: OnboardingProgress): number {
  const answerable = ONBOARDING_STEPS.length - 1;
  const seen = new Set([...progress.completedSteps, ...progress.skippedSteps]);
  seen.delete('review');
  return Math.min(1, seen.size / answerable);
}
