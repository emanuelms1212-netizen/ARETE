import { describe, expect, it } from 'vitest';
import { exerciseBySlug } from '@/content/train/exercises';
import type { Exercise } from './exercise';
import { decideProgression, type ExercisePerformance, type LoggedSet } from './progression';
import type { Prescription } from './workout-plan';

const ex = (slug: string): Exercise => exerciseBySlug(slug)!;

const goblet: Prescription = {
  exerciseSlug: 'goblet-squat',
  block: 'primary',
  sets: 3,
  reps: { min: 8, max: 12 },
  seconds: null,
  restSeconds: 90,
  rpe: 7,
  rir: 3,
  perSide: false,
  substitutes: [],
  note: null,
};

const pushUp: Prescription = { ...goblet, exerciseSlug: 'push-up' };
const plank: Prescription = { ...goblet, exerciseSlug: 'plank', reps: null, seconds: 30 };
const run: Prescription = {
  ...goblet,
  exerciseSlug: 'easy-run',
  reps: null,
  seconds: 1800,
  sets: 1,
  rpe: 4,
};

function sets(
  count: number,
  values: Partial<LoggedSet> & { reps?: number | null },
  overrides: Partial<LoggedSet>[] = [],
): LoggedSet[] {
  return Array.from({ length: count }, (_, index) => ({
    setIndex: index + 1,
    reps: null,
    loadKg: null,
    seconds: null,
    distanceM: null,
    rpe: null,
    pain: null,
    completed: true,
    ...values,
    ...(overrides[index] ?? {}),
  }));
}

function performance(
  slug: string,
  logged: LoggedSet[],
  formOk: boolean | null = true,
  localDate = '2026-10-10',
): ExercisePerformance {
  return { localDate, exerciseSlug: slug, sets: logged, formOk };
}

describe('decideProgression', () => {
  it('starts from the prescription with nothing logged, and says how to choose a load', () => {
    const result = decideProgression(goblet, ex('goblet-squat'), []);
    expect(result.decision).toBe('start');
    expect(result.target.repsGoal).toBe(8);
    expect(result.target.loadKg).toBeNull();
    expect(result.rule).toMatch(/two or three reps in reserve/);
  });

  it('adds load only when every set hit the top of the range, at or under target effort, with form held', () => {
    const history = [performance('goblet-squat', sets(3, { reps: 12, loadKg: 20, rpe: 7 }))];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('increase_load');
    expect(result.target.loadKg).toBe(22);
    expect(result.target.repsGoal).toBe(8);
    expect(result.rule).toMatch(/goes up 2 kg to 22 kg/);
  });

  it('holds when form was not marked as solid, and says so', () => {
    const history = [performance('goblet-squat', sets(3, { reps: 12, loadKg: 20, rpe: 7 }), null)];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('hold');
    expect(result.target.loadKg).toBe(20);
    expect(result.rule).toMatch(/form was not marked as solid/);
  });

  it('holds when the top of the range came at too high an effort', () => {
    const history = [performance('goblet-squat', sets(3, { reps: 12, loadKg: 20, rpe: 8.5 }))];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('hold');
    expect(result.rule).toMatch(/RPE 8.5/);
  });

  it('holds and asks for RPE when effort was not logged', () => {
    const history = [performance('goblet-squat', sets(3, { reps: 12, loadKg: 20 }))];
    expect(decideProgression(goblet, ex('goblet-squat'), history).rule).toMatch(
      /Log how hard it felt/,
    );
  });

  it('adds a rep before it adds load', () => {
    const history = [
      performance('goblet-squat', sets(3, { reps: 9, loadKg: 20, rpe: 7 }, [{}, {}, { reps: 8 }])),
    ];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('increase_reps');
    expect(result.target.repsGoal).toBe(9);
    expect(result.target.loadKg).toBe(20);
  });

  it('holds when sets fell short of the range', () => {
    const history = [performance('goblet-squat', sets(3, { reps: 6, loadKg: 20, rpe: 8 }))];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('hold');
    expect(result.rule).toMatch(/fell short of 8/);
  });

  it('holds when not every set was done', () => {
    const history = [performance('goblet-squat', sets(2, { reps: 12, loadKg: 20, rpe: 6 }))];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('hold');
    expect(result.rule).toMatch(/2 of 3 sets/);
  });

  it('reduces the load by about 10% after pain of 4/10 or more, and names the easier option', () => {
    const history = [
      performance('goblet-squat', sets(3, { reps: 10, loadKg: 20, rpe: 7 }, [{}, { pain: 5 }])),
    ];
    const result = decideProgression(goblet, ex('goblet-squat'), history, {
      easier: ex('bodyweight-squat'),
    });
    expect(result.decision).toBe('reduce');
    expect(result.target.loadKg).toBe(18);
    expect(result.rule).toMatch(/Pain reached 5\/10/);
    expect(result.rule).toMatch(/Bodyweight squat/);
    expect(result.suggestSlug).toBe('bodyweight-squat');
  });

  it('pain trumps everything, even a perfect session', () => {
    const history = [
      performance('goblet-squat', sets(3, { reps: 12, loadKg: 20, rpe: 6, pain: 4 })),
    ];
    expect(decideProgression(goblet, ex('goblet-squat'), history).decision).toBe('reduce');
  });

  it('holds on mild discomfort rather than adding', () => {
    const history = [
      performance('goblet-squat', sets(3, { reps: 12, loadKg: 20, rpe: 7, pain: 2 })),
    ];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('hold');
    expect(result.target.loadKg).toBe(20);
    expect(result.rule).toMatch(/discomfort \(2\/10\)/);
  });

  it('deloads after two very hard sessions with reps going down', () => {
    const history = [
      performance('goblet-squat', sets(3, { reps: 8, loadKg: 24, rpe: 9.5 }), true, '2026-10-10'),
      performance('goblet-squat', sets(3, { reps: 10, loadKg: 24, rpe: 9 }), true, '2026-10-07'),
    ];
    const result = decideProgression(goblet, ex('goblet-squat'), history);
    expect(result.decision).toBe('deload');
    expect(result.target.loadKg).toBe(20);
  });

  it('suggests the harder variant for bodyweight work at the top of the range', () => {
    const history = [performance('push-up', sets(3, { reps: 12, rpe: 7 }))];
    const result = decideProgression(pushUp, ex('push-up'), history, {
      harder: ex('dumbbell-floor-press'),
    });
    expect(result.decision).toBe('harder_variant');
    expect(result.suggestSlug).toBe('dumbbell-floor-press');
  });

  it('adds a set when bodyweight work tops out and there is no harder option', () => {
    const history = [performance('push-up', sets(3, { reps: 12, rpe: 7 }))];
    const result = decideProgression(pushUp, ex('push-up'), history, { harder: null });
    expect(result.decision).toBe('add_set');
    expect(result.target.sets).toBe(4);
  });

  it('lengthens a hold by at least five seconds once the full time is done easily', () => {
    const history = [performance('plank', sets(3, { seconds: 30, rpe: 6 }))];
    const result = decideProgression(plank, ex('plank'), history);
    expect(result.decision).toBe('increase_time');
    expect(result.target.seconds).toBe(35);
  });

  it('grows a run by about 10%, never more', () => {
    const history = [performance('easy-run', sets(1, { seconds: 1800, rpe: 4 }))];
    const result = decideProgression(run, ex('easy-run'), history);
    expect(result.decision).toBe('increase_time');
    expect(result.target.seconds).toBe(1980);
    expect(result.target.seconds! / 1800).toBeLessThanOrEqual(1.1);
  });

  it('never progresses warm-ups', () => {
    const warmup: Prescription = {
      ...goblet,
      exerciseSlug: 'leg-swing',
      block: 'warmup',
      rpe: null,
      rir: null,
    };
    expect(decideProgression(warmup, ex('leg-swing'), []).decision).toBe('hold');
  });

  it('is deterministic: the same history always gives the same answer', () => {
    const history = [performance('goblet-squat', sets(3, { reps: 12, loadKg: 20, rpe: 7 }))];
    const first = decideProgression(goblet, ex('goblet-squat'), history);
    for (let index = 0; index < 5; index += 1) {
      expect(decideProgression(goblet, ex('goblet-squat'), history)).toEqual(first);
    }
  });
});
