import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/content/train/exercises';
import { isAvailable, type Availability, type Exercise } from './exercise';
import { TRAINING_FIXTURES, trainingFixture } from './fixtures/training-users';
import {
  adaptForReadiness,
  estimateMinutes,
  fitToMinutes,
  generateTrainingPlan,
  minimumOf,
  mondayFirst,
  sessionForWeekday,
  suggestedSetup,
  trainingSetupSchema,
  type PlannedSession,
  type TrainingPlan,
} from './workout-plan';

const bySlug = new Map(EXERCISES.map((exercise) => [exercise.slug, exercise]));
const exercise = (slug: string): Exercise => {
  const found = bySlug.get(slug);
  if (!found) throw new Error(`missing ${slug}`);
  return found;
};

const LEG_HEAVY = new Set([
  'full_a',
  'full_b',
  'full_c',
  'lower_a',
  'lower_b',
  'court',
  'run_intervals',
  'run_long',
]);

function planFor(id: string): TrainingPlan {
  const fixture = trainingFixture(id);
  return generateTrainingPlan(fixture.setup, EXERCISES, fixture.context);
}

describe.each(TRAINING_FIXTURES.map((fixture) => [fixture.id, fixture] as const))(
  'fixture %s',
  (_id, fixture) => {
    const plan = generateTrainingPlan(fixture.setup, EXERCISES, fixture.context);
    const owned: Availability = {
      equipment: fixture.setup.equipment,
      excludedRegions: fixture.setup.painFlags
        .filter((flag) => flag.severity === 'severe')
        .map((flag) => flag.region),
      gentleRegions: [],
      avoid: fixture.setup.avoidExercises,
    };

    it('trains only on the chosen days, once each', () => {
      const days = plan.sessions.map((session) => session.weekday);
      expect(days.sort()).toEqual([...fixture.setup.trainingWeekdays].sort());
    });

    it('uses only equipment the person has, and nothing a severe flag rules out', () => {
      for (const session of plan.sessions) {
        for (const item of session.items) {
          expect(
            isAvailable(exercise(item.exerciseSlug), owned),
            `${session.title}: ${item.exerciseSlug}`,
          ).toBe(true);
        }
      }
    });

    it('fits the time available, or has a minimum that does', () => {
      for (const session of plan.sessions) {
        expect(session.estimatedMinutes).toBe(estimateMinutes(session.items));
        expect(session.minimum.estimatedMinutes).toBeLessThanOrEqual(
          Math.max(fixture.setup.sessionMinutes, session.minimum.estimatedMinutes),
        );
        if (fixture.setup.sessionMinutes >= 20) {
          expect(session.estimatedMinutes, session.title).toBeLessThanOrEqual(
            fixture.setup.sessionMinutes,
          );
        }
      }
    });

    it('gives every session a warm-up, main work and a cool-down, with a minimum version', () => {
      for (const session of plan.sessions) {
        const blocks = new Set(session.items.map((item) => item.block));
        expect(blocks.has('warmup'), session.title).toBe(true);
        expect(blocks.has('primary'), session.title).toBe(true);
        if (fixture.setup.sessionMinutes >= 20)
          expect(blocks.has('cooldown'), session.title).toBe(true);
        expect(session.minimum.items.length).toBeGreaterThan(0);
        expect(session.minimum.items.some((item) => item.block === 'primary')).toBe(true);
        expect(session.minimum.estimatedMinutes).toBeLessThanOrEqual(session.estimatedMinutes);
      }
    });

    it('prescribes sets, reps or time, rest, and an effort target for the main work', () => {
      for (const session of plan.sessions) {
        for (const item of session.items) {
          expect(item.sets).toBeGreaterThan(0);
          expect(item.reps !== null || item.seconds !== null).toBe(true);
          expect(item.restSeconds).toBeGreaterThanOrEqual(0);
          if (item.block === 'primary' || item.block === 'accessory') {
            expect(item.rpe).not.toBeNull();
            expect(item.rir).toBe(10 - (item.rpe ?? 0));
          }
        }
      }
    });

    it('offers substitutes that keep the movement pattern and are available', () => {
      for (const session of plan.sessions) {
        for (const item of session.items) {
          const original = exercise(item.exerciseSlug);
          for (const slug of item.substitutes) {
            const option = exercise(slug);
            expect(option.pattern).toBe(original.pattern);
            expect(isAvailable(option, owned)).toBe(true);
          }
        }
      }
    });

    it('never repeats an exercise within a session', () => {
      for (const session of plan.sessions) {
        const slugs = session.items.map((item) => item.exerciseSlug);
        expect(new Set(slugs).size).toBe(slugs.length);
      }
    });

    it('explains itself', () => {
      expect(plan.rules.length).toBeGreaterThan(2);
      for (const rule of plan.rules) expect(rule.length).toBeGreaterThan(10);
    });

    it('is deterministic', () => {
      expect(generateTrainingPlan(fixture.setup, EXERCISES, fixture.context)).toEqual(plan);
    });
  },
);

describe('the fixtures get different plans', () => {
  it('no two fixtures share a week', () => {
    const fingerprints = TRAINING_FIXTURES.map((fixture) =>
      JSON.stringify(
        generateTrainingPlan(fixture.setup, EXERCISES, fixture.context).sessions.map((session) => [
          session.weekday,
          session.kind,
          session.items.map((item) => `${item.exerciseSlug}:${item.sets}`),
        ]),
      ),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});

describe('specific people', () => {
  it('gives someone new with a sore knee the easiest squat, and says why', () => {
    const plan = planFor('maya');
    const squats = plan.sessions
      .flatMap((session) => session.items)
      .filter((item) => exercise(item.exerciseSlug).pattern === 'squat');
    expect(squats.length).toBeGreaterThan(0);
    for (const item of squats) {
      expect(item.exerciseSlug).toBe('box-squat');
      expect(item.note).toMatch(/pain flag/);
    }
    expect(plan.rules.join(' ')).toMatch(/knees/);
  });

  it('caps someone new at three hard sessions however many days they pick', () => {
    const plan = generateTrainingPlan(
      trainingSetupSchema.parse({
        goal: 'strength',
        experience: 'new',
        trainingWeekdays: [1, 2, 3, 4, 5, 6],
        sessionMinutes: 30,
      }),
      EXERCISES,
    );
    const hard = plan.sessions.filter(
      (session) => !['conditioning', 'easy_movement', 'run_easy'].includes(session.kind),
    );
    expect(hard.length).toBeLessThanOrEqual(3);
    expect(plan.rules.join(' ')).toMatch(/At most 3 hard sessions/);
  });

  it('gives an experienced lifter barbell work and an upper/lower split', () => {
    const plan = planFor('daniel');
    expect(plan.sessions.map((session) => session.kind)).toEqual([
      'upper_a',
      'lower_a',
      'upper_b',
      'lower_b',
    ]);
    const slugs = plan.sessions.flatMap((session) =>
      session.items.map((item) => item.exerciseSlug),
    );
    expect(slugs).toContain('back-squat');
    const primarySquat = plan.sessions[1]!.items.find(
      (item) => item.exerciseSlug === 'back-squat',
    )!;
    expect(primarySquat.reps).toEqual({ min: 5, max: 8 });
    expect(primarySquat.restSeconds).toBeGreaterThanOrEqual(120);
  });

  it('gives a runner runs, including tempo work once they are consistent', () => {
    const plan = planFor('priya');
    const kinds = plan.sessions.map((session) => session.kind);
    expect(kinds.filter((kind) => kind.startsWith('run')).length).toBe(3);
    const slugs = plan.sessions.flatMap((session) =>
      session.items.map((item) => item.exerciseSlug),
    );
    expect(slugs).toContain('tempo-intervals');
  });

  it('keeps tempo work off the plan when the safety rules say so', () => {
    const fixture = trainingFixture('priya');
    const plan = generateTrainingPlan(fixture.setup, EXERCISES, {
      ...fixture.context,
      highIntensityAllowed: false,
    });
    const slugs = plan.sessions.flatMap((session) =>
      session.items.map((item) => item.exerciseSlug),
    );
    expect(slugs).not.toContain('tempo-intervals');
    expect(plan.rules.join(' ')).toMatch(/intervals off the plan/);
  });

  it('keeps leg-heavy sessions off the day before tennis', () => {
    const plan = planFor('sam');
    const tuesday = sessionForWeekday(plan, 2)!;
    expect(LEG_HEAVY.has(tuesday.kind)).toBe(false);
    expect(plan.activityDays.map((day) => day.weekday)).toEqual([3, 6]);
    expect(plan.rules.join(' ')).toMatch(/Tennis on Wed and Sat/);
  });

  it('keeps everything off a severely flagged back', () => {
    const plan = planFor('ana');
    for (const session of plan.sessions) {
      for (const item of session.items)
        expect(exercise(item.exerciseSlug).loads).not.toContain('spine');
    }
    expect(plan.rules.join(' ')).toMatch(/Nothing loads your spine/);
  });

  it('still produces a session, and a minimum, in ten minutes', () => {
    const plan = planFor('leo');
    for (const session of plan.sessions) {
      expect(session.items.some((item) => item.block === 'primary')).toBe(true);
      expect(session.minimum.estimatedMinutes).toBeLessThanOrEqual(10);
    }
  });

  it('takes a set off everything for someone with nothing logged in two weeks', () => {
    const fixture = trainingFixture('daniel');
    const back = generateTrainingPlan(fixture.setup, EXERCISES, { recentSessions: 0 });
    const usual = generateTrainingPlan(fixture.setup, EXERCISES, { recentSessions: 8 });
    const setsOf = (plan: TrainingPlan) =>
      plan.sessions
        .flatMap((session) => session.items)
        .filter((item) => item.block === 'primary')
        .map((item) => item.sets);
    expect(Math.max(...setsOf(back))).toBeLessThan(Math.max(...setsOf(usual)));
    expect(back.rules.join(' ')).toMatch(/No workouts logged in the last two weeks/);
  });

  it('never offers an exercise the person asked to avoid', () => {
    const fixture = trainingFixture('daniel');
    const plan = generateTrainingPlan(
      { ...fixture.setup, avoidExercises: ['back-squat'] },
      EXERCISES,
      fixture.context,
    );
    const slugs = plan.sessions.flatMap((session) =>
      session.items.flatMap((item) => [item.exerciseSlug, ...item.substitutes]),
    );
    expect(slugs).not.toContain('back-squat');
  });
});

describe('setup validation', () => {
  it('rejects fewer than two or more than six days', () => {
    expect(trainingSetupSchema.safeParse({ trainingWeekdays: [1] }).success).toBe(false);
    expect(trainingSetupSchema.safeParse({ trainingWeekdays: [0, 1, 2, 3, 4, 5, 6] }).success).toBe(
      false,
    );
    expect(trainingSetupSchema.safeParse({ trainingWeekdays: [1, 1] }).success).toBe(false);
  });

  it('rejects tennis days without tennis', () => {
    expect(
      trainingSetupSchema.safeParse({ trainingWeekdays: [1, 3], tennisWeekdays: [5] }).success,
    ).toBe(false);
    expect(
      trainingSetupSchema.safeParse({
        trainingWeekdays: [1, 3],
        tennisWeekdays: [5],
        activities: ['tennis'],
      }).success,
    ).toBe(true);
  });
});

describe('fitting and minimums', () => {
  const plan = planFor('daniel');
  const session: PlannedSession = plan.sessions[0]!;

  it('trims accessories before main work', () => {
    const trimmed = fitToMinutes(session.items, 20);
    expect(estimateMinutes(trimmed)).toBeLessThanOrEqual(20);
    expect(trimmed.filter((item) => item.block === 'primary').length).toBeGreaterThan(0);
    expect(trimmed.filter((item) => item.block === 'accessory').length).toBeLessThan(
      session.items.filter((item) => item.block === 'accessory').length,
    );
  });

  it('makes the minimum the first warm-up and the first main exercise', () => {
    const minimum = minimumOf(session.items);
    expect(minimum.map((item) => item.block)).toEqual(['warmup', 'primary']);
    expect(minimum[1]!.sets).toBeLessThanOrEqual(2);
  });
});

describe('readiness', () => {
  const items = planFor('daniel').sessions[0]!.items;

  it('takes a set off and lowers the effort when readiness is low', () => {
    const { items: adapted, note } = adaptForReadiness(items, 'low');
    items.forEach((item, index) => {
      const after = adapted[index]!;
      if (item.block === 'primary' || item.block === 'accessory') {
        expect(after.sets).toBe(Math.max(1, item.sets - 1));
        expect(after.rpe).toBe((item.rpe ?? 0) - 1);
      } else {
        expect(after).toEqual(item);
      }
    });
    expect(note).toMatch(/minimum version also counts/);
  });

  it('never adds anything when readiness is high', () => {
    const { items: adapted, note } = adaptForReadiness(items, 'high');
    expect(adapted).toEqual(items);
    expect(note).toMatch(/stays as written/);
  });
});

describe('suggestedSetup', () => {
  it('starts from onboarding answers and spreads the days', () => {
    const setup = suggestedSetup({
      experience: 'new',
      equipment: ['dumbbells'],
      sessionMinutes: 25,
      preferredWeekdays: [],
      availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      injuries: [{ region: 'knees', severity: 'mild' }],
    });
    expect(setup.trainingWeekdays).toHaveLength(3);
    expect(mondayFirst(setup.trainingWeekdays)).toEqual([1, 3, 5]);
    expect(setup.painFlags).toHaveLength(1);
    expect(setup.equipment).toEqual(['dumbbells']);
  });
});
