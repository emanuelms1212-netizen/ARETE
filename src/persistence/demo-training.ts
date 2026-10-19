import { EXERCISES } from '@/content/train/exercises';
import {
  buildWorkout,
  generateTrainingPlan,
  sessionForWeekday,
  trainingSetupSchema,
  type Availability,
  type TrainingSetup,
  type WorkoutSession,
  type WorkoutSetLog,
} from '@/domain';

/**
 * The demo account's training: a setup and two finished workouts.
 *
 * Built by running the real plan engine rather than typed out, so the history
 * always matches the plan it claims to come from. The logged numbers are
 * chosen to show each progression rule at least once on the demo's Monday:
 * a clean top-of-range session that moves up, an in-range one that adds a
 * rep, a hard one that holds, and one with mild discomfort that holds and
 * says why.
 */
export const DEMO_TRAINING_SETUP: TrainingSetup = trainingSetupSchema.parse({
  goal: 'general',
  experience: 'consistent',
  equipment: ['dumbbells', 'bands'],
  trainingWeekdays: [1, 3, 5],
  sessionMinutes: 35,
  activities: ['walking'],
});

const availability: Availability = {
  equipment: DEMO_TRAINING_SETUP.equipment,
  excludedRegions: [],
  gentleRegions: [],
  avoid: [],
};

function finished(
  id: string,
  localDate: string,
  weekday: number,
  shape: (index: number, slug: string) => Partial<WorkoutSetLog> | null,
): WorkoutSession {
  const plan = generateTrainingPlan(DEMO_TRAINING_SETUP, EXERCISES, { recentSessions: 2 });
  const session = sessionForWeekday(plan, weekday)!;
  const snapshot = buildWorkout({
    session,
    readiness: 'normal',
    minimumMode: false,
    history: [],
    library: EXERCISES,
    availability,
  });

  const sets: WorkoutSetLog[] = [];
  let minute = 5;
  snapshot.items.forEach((item, index) => {
    if (item.block !== 'primary' && item.block !== 'accessory') return;
    const values = shape(index, item.exerciseSlug);
    if (values === null) return;
    for (let set = 1; set <= item.sets; set += 1) {
      minute += 2;
      sets.push({
        exerciseSlug: item.exerciseSlug,
        block: item.block,
        setIndex: set,
        reps: item.reps ? item.reps.max : null,
        loadKg: null,
        seconds: item.seconds,
        distanceM: null,
        rpe: 7,
        pain: 0,
        completed: true,
        formOk: true,
        notes: null,
        substitutedFrom: null,
        performedAt: `${localDate}T07:${String(minute).padStart(2, '0')}:00.000Z`,
        ...values,
      });
    }
  });

  return {
    id,
    localDate,
    status: 'completed',
    startedAt: `${localDate}T07:00:00.000Z`,
    endedAt: `${localDate}T07:${String(Math.min(59, minute + 6)).padStart(2, '0')}:00.000Z`,
    title: snapshot.title,
    sessionKey: snapshot.sessionKey,
    readiness: 'normal',
    minimumMode: false,
    snapshot,
    notes: null,
    sets,
  };
}

export function demoTraining(): { setup: TrainingSetup; workouts: WorkoutSession[] } {
  // The Monday before the demo's "today", and the Friday between. Where both
  // include an exercise, the Friday is the one progression reads.
  const shapes: Record<string, Partial<WorkoutSetLog>> = {
    // Top of the range, on target, form held: the load goes up.
    'goblet-squat': { reps: 12, loadKg: 14, rpe: 7, formOk: true },
    // In range: one more rep next time.
    'dumbbell-floor-press': { reps: 10, loadKg: 12, rpe: 7 },
    // Top of the range but too hard: holds.
    'good-morning': { reps: 15, rpe: 8.5 },
    // Mild discomfort: holds, and says why.
    'band-row': { reps: 12, rpe: 7, pain: 2 },
    // A hold done easily: a few seconds longer.
    plank: { seconds: 40, rpe: 6 },
  };
  const shape = (_index: number, slug: string) => shapes[slug] ?? { rpe: 7 };
  const monday = finished('demo-workout-1', '2026-03-09', 1, shape);
  const friday = finished('demo-workout-2', '2026-03-13', 5, shape);
  return { setup: DEMO_TRAINING_SETUP, workouts: [monday, friday] };
}
