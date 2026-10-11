import { onboardingProfileSchema, type OnboardingProfile } from '../onboarding';

/**
 * Fixture personas.
 *
 * Each one is a person the plan generator has to handle differently, and
 * together they are the evidence that it does. They are deliberately awkward:
 * the brand-new sedentary user, the one with a heart history, the pregnant one,
 * the sixteen-year-old, the one with a severe injury, and the one who skipped
 * every question. A generator that produces the same week for all of these is
 * not a generator, it is a template.
 */
export interface Persona {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly profile: OnboardingProfile;
}

function profile(partial: unknown): OnboardingProfile {
  return onboardingProfileSchema.parse(partial);
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'skipped',
    name: 'Someone who skipped everything',
    summary: 'Answered nothing. Must still get a sane, gentle week.',
    profile: profile({}),
  },
  {
    id: 'new-sedentary',
    name: 'Brand new, nothing recent',
    summary: 'Never trained, no equipment, wants consistency and calm.',
    profile: profile({
      intent: { focuses: ['consistency', 'calm'], goals: ['Stop starting over'] },
      schedule: { availableWeekdays: [1, 2, 3, 4, 5], planningStyle: 'light' },
      training: {
        experience: 'new',
        recentActivity: 'none',
        equipment: ['none'],
        sessionMinutes: 20,
      },
      mind: { meditationExperience: 'new' },
      minimum: { minimumDaySize: 1 },
    }),
  },
  {
    id: 'experienced',
    name: 'Experienced, full gym, five days free',
    summary: 'Trains already, wants fitness and focus, 60-minute sessions.',
    profile: profile({
      intent: { focuses: ['fitness', 'focus'], goals: ['Squat bodyweight', 'Ship the book'] },
      schedule: { availableWeekdays: [0, 1, 2, 3, 4, 5, 6], planningStyle: 'structured' },
      training: {
        experience: 'experienced',
        recentActivity: 'high',
        equipment: ['barbell', 'dumbbells', 'machines'],
        sessionMinutes: 60,
        preferredWeekdays: [1, 2, 4, 5, 6],
      },
      mind: { meditationExperience: 'regular' },
      minimum: { minimumDaySize: 2 },
    }),
  },
  {
    id: 'pregnant',
    name: 'Pregnant, returning to training',
    summary: 'Heat, cold and end-range loading must all come out.',
    profile: profile({
      intent: { focuses: ['fitness', 'calm'] },
      schedule: { availableWeekdays: [1, 3, 5, 6] },
      training: {
        experience: 'returning',
        recentActivity: 'moderate',
        equipment: ['bands'],
        sessionMinutes: 30,
      },
      health: { pregnancyStatus: 'pregnant' },
      mind: { meditationExperience: 'some', chosenPackSlugs: ['contrast-therapy'] },
    }),
  },
  {
    id: 'cardiac-history',
    name: 'Has fainted before',
    summary: 'Cold immersion and sauna out; intensity routed down; clearance recommended.',
    profile: profile({
      intent: { focuses: ['fitness'] },
      training: { experience: 'consistent', recentActivity: 'moderate', sessionMinutes: 45 },
      health: { cardiovascularOrFaintingHistory: true },
      mind: { chosenPackSlugs: ['contrast-therapy'] },
    }),
  },
  {
    id: 'minor',
    name: 'Sixteen, wants to get fitter',
    summary: 'No calorie prescription, no fasting, no guardian confirmation yet.',
    profile: profile({
      intent: { focuses: ['fitness', 'food'] },
      training: { experience: 'returning', recentActivity: 'moderate', sessionMinutes: 45 },
      food: { loggingGoal: 'full_macros' },
      age: { birthYear: 2010 },
    }),
  },
  {
    id: 'severe-injury',
    name: 'Severe hamstring problem, wants flexibility',
    summary: 'Nothing may load the hamstrings; mobility becomes unloaded.',
    profile: profile({
      intent: { focuses: ['flexibility'] },
      training: { experience: 'returning', recentActivity: 'light', sessionMinutes: 30 },
      health: { injuries: [{ region: 'hamstrings', severity: 'severe' }] },
    }),
  },
  {
    id: 'private',
    name: 'Preferred not to answer',
    summary: 'Declined the pregnancy question. Must not be punished for it.',
    profile: profile({
      intent: { focuses: ['calm'] },
      health: { pregnancyStatus: 'prefer_not_to_say' },
      mind: { chosenPackSlugs: ['contrast-therapy'] },
    }),
  },
  {
    id: 'no-numbers',
    name: 'Food awareness without numbers',
    summary: 'Wants to notice what they eat, and never to see a calorie total.',
    profile: profile({
      intent: { focuses: ['food', 'reflection'] },
      food: { loggingGoal: 'awareness', hideCalorieNumbers: true },
      minimum: { minimumDaySize: 3 },
    }),
  },
];

export function persona(id: string): Persona {
  const found = PERSONAS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No persona ${id}`);
  return found;
}
