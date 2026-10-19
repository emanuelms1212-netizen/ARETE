import { trainingSetupSchema, type PlanContext, type TrainingSetup } from '../workout-plan';

/**
 * Fixture trainees.
 *
 * Six people whose weeks must come out different, each for a reason a coach
 * would recognise: two days and a sore knee; a lifter with a full gym; a
 * runner; a tennis player whose legs need to be fresh on court days; someone
 * training around a severe back flag; and someone with ten minutes. The plan
 * tests run every one of them and check that the week fits their calendar,
 * their equipment and their body.
 */
export interface TrainingFixture {
  readonly id: string;
  readonly summary: string;
  readonly setup: TrainingSetup;
  readonly context: PlanContext;
}

const setup = (input: unknown) => trainingSetupSchema.parse(input);

export const TRAINING_FIXTURES: readonly TrainingFixture[] = [
  {
    id: 'maya',
    summary: 'New, bodyweight only, Tuesday and Thursday, 25 minutes, a sore knee.',
    setup: setup({
      goal: 'general',
      experience: 'new',
      equipment: ['none'],
      trainingWeekdays: [2, 4],
      sessionMinutes: 25,
      painFlags: [{ region: 'knees', severity: 'moderate' }],
    }),
    context: { recentSessions: 0 },
  },
  {
    id: 'daniel',
    summary: 'Experienced lifter, full gym, four days, an hour each.',
    setup: setup({
      goal: 'strength',
      experience: 'experienced',
      equipment: ['barbell', 'dumbbells', 'machines', 'pull_up_bar'],
      trainingWeekdays: [1, 2, 4, 5],
      sessionMinutes: 60,
    }),
    context: { recentSessions: 8 },
  },
  {
    id: 'priya',
    summary: 'Consistent runner with dumbbells, five days, 45 minutes.',
    setup: setup({
      goal: 'running',
      experience: 'consistent',
      equipment: ['dumbbells'],
      trainingWeekdays: [1, 2, 3, 5, 6],
      sessionMinutes: 45,
      activities: ['running'],
    }),
    context: { recentSessions: 9 },
  },
  {
    id: 'sam',
    summary: 'Returning tennis player, bands and dumbbells, tennis Wednesday and Saturday.',
    setup: setup({
      goal: 'tennis',
      experience: 'returning',
      equipment: ['bands', 'dumbbells'],
      trainingWeekdays: [0, 1, 2, 4],
      sessionMinutes: 40,
      activities: ['tennis'],
      tennisWeekdays: [3, 6],
    }),
    context: { recentSessions: 4 },
  },
  {
    id: 'ana',
    summary: 'Six days at home with bands, a severe back flag.',
    setup: setup({
      goal: 'general',
      experience: 'consistent',
      equipment: ['bands'],
      trainingWeekdays: [1, 2, 3, 4, 5, 6],
      sessionMinutes: 30,
      painFlags: [{ region: 'spine', severity: 'severe' }],
    }),
    context: { recentSessions: 6 },
  },
  {
    id: 'leo',
    summary: 'New, ten minutes, three days.',
    setup: setup({
      goal: 'general',
      experience: 'new',
      equipment: ['none'],
      trainingWeekdays: [1, 3, 5],
      sessionMinutes: 10,
    }),
    context: { recentSessions: 0 },
  },
];

export function trainingFixture(id: string): TrainingFixture {
  const found = TRAINING_FIXTURES.find((fixture) => fixture.id === id);
  if (!found) throw new Error(`No training fixture ${id}`);
  return found;
}
