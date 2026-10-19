import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/content/train/exercises';
import type { Availability } from './exercise';
import { trainingFixture } from './fixtures/training-users';
import { generateTrainingPlan } from './workout-plan';
import {
  SubstitutionError,
  buildWorkout,
  describeWorkout,
  performancesFor,
  recentSessionCount,
  restRemaining,
  setLogSchema,
  substitute,
  summariseWorkout,
  type WorkoutSession,
  type WorkoutSetLog,
} from './workout-session';

const fixture = trainingFixture('priya');
const plan = generateTrainingPlan(fixture.setup, EXERCISES, fixture.context);
const fullBody = plan.sessions.find((session) => session.kind === 'full_a')!;
const availability: Availability = {
  equipment: fixture.setup.equipment,
  excludedRegions: [],
  gentleRegions: [],
  avoid: [],
};

function set(slug: string, index: number, values: Partial<WorkoutSetLog> = {}): WorkoutSetLog {
  return {
    exerciseSlug: slug,
    block: 'primary',
    setIndex: index,
    reps: 12,
    loadKg: 16,
    seconds: null,
    distanceM: null,
    rpe: 7,
    pain: 0,
    completed: true,
    formOk: true,
    notes: null,
    substitutedFrom: null,
    performedAt: '2026-10-05T08:10:00Z',
    ...values,
  };
}

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const snapshot = buildWorkout({
    session: fullBody,
    readiness: 'normal',
    minimumMode: false,
    history: [],
    library: EXERCISES,
    availability,
  });
  return {
    id: 'w1',
    localDate: '2026-10-05',
    status: 'completed',
    startedAt: '2026-10-05T08:00:00Z',
    endedAt: '2026-10-05T08:40:00Z',
    title: snapshot.title,
    sessionKey: snapshot.sessionKey,
    readiness: 'normal',
    minimumMode: false,
    snapshot,
    notes: null,
    sets: [1, 2, 3].map((index) => set('goblet-squat', index)),
    ...overrides,
  };
}

describe('buildWorkout', () => {
  it('copies the plan and attaches a target and its rule to every item', () => {
    const snapshot = buildWorkout({
      session: fullBody,
      readiness: 'normal',
      minimumMode: false,
      history: [],
      library: EXERCISES,
      availability,
    });
    expect(snapshot.items.map((item) => item.exerciseSlug)).toEqual(
      fullBody.items.map((item) => item.exerciseSlug),
    );
    for (const item of snapshot.items) expect(item.rule.length).toBeGreaterThan(10);
  });

  it('progresses from history: a clean session at the top of the range adds load', () => {
    const snapshot = buildWorkout({
      session: fullBody,
      readiness: 'normal',
      minimumMode: false,
      history: [session()],
      library: EXERCISES,
      availability,
    });
    const squat = snapshot.items.find((item) => item.exerciseSlug === 'goblet-squat')!;
    expect(squat.decision).toBe('increase_load');
    expect(squat.target.loadKg).toBe(18);
  });

  it('builds only the minimum when asked', () => {
    const snapshot = buildWorkout({
      session: fullBody,
      readiness: 'normal',
      minimumMode: true,
      history: [],
      library: EXERCISES,
      availability,
    });
    expect(snapshot.items).toHaveLength(fullBody.minimum.items.length);
    expect(snapshot.title).toMatch(/minimum/);
  });

  it('never lets progression push past what low readiness allows', () => {
    const snapshot = buildWorkout({
      session: fullBody,
      readiness: 'low',
      minimumMode: false,
      history: [session()],
      library: EXERCISES,
      availability,
    });
    const squat = snapshot.items.find((item) => item.exerciseSlug === 'goblet-squat')!;
    const planned = fullBody.items.find((item) => item.exerciseSlug === 'goblet-squat')!;
    expect(squat.target.sets).toBe(planned.sets - 1);
    expect(squat.target.rpe).toBe((planned.rpe ?? 0) - 1);
    expect(snapshot.readinessNote).toMatch(/Low readiness/);
  });
});

describe('substitute', () => {
  const snapshot = buildWorkout({
    session: fullBody,
    readiness: 'normal',
    minimumMode: false,
    history: [],
    library: EXERCISES,
    availability,
  });

  it('swaps within a movement pattern and records what it replaced', () => {
    const swapped = substitute(
      snapshot,
      'goblet-squat',
      'bodyweight-squat',
      EXERCISES,
      availability,
      [],
    );
    const item = swapped.items.find((entry) => entry.exerciseSlug === 'bodyweight-squat')!;
    expect(item.substitutedFrom).toBe('goblet-squat');
    expect(item.note).toMatch(/same movement/);
    expect(swapped.items).toHaveLength(snapshot.items.length);
  });

  it('refuses a swap that changes the movement', () => {
    expect(() =>
      substitute(snapshot, 'goblet-squat', 'push-up', EXERCISES, availability, []),
    ).toThrow(SubstitutionError);
  });

  it('refuses equipment the person does not have', () => {
    expect(() =>
      substitute(snapshot, 'goblet-squat', 'back-squat', EXERCISES, availability, []),
    ).toThrow(/equipment/);
  });

  it('keeps the original slug when a substitute is substituted again', () => {
    const once = substitute(
      snapshot,
      'goblet-squat',
      'bodyweight-squat',
      EXERCISES,
      availability,
      [],
    );
    const twice = substitute(once, 'bodyweight-squat', 'box-squat', EXERCISES, availability, []);
    expect(twice.items.find((item) => item.exerciseSlug === 'box-squat')!.substitutedFrom).toBe(
      'goblet-squat',
    );
  });
});

describe('history', () => {
  it('reads only finished sessions, most recent first', () => {
    const older = session({ id: 'a', localDate: '2026-10-01', startedAt: '2026-10-01T08:00:00Z' });
    const newer = session({ id: 'b', localDate: '2026-10-04', startedAt: '2026-10-04T08:00:00Z' });
    const running = session({ id: 'c', localDate: '2026-10-06', status: 'running' });
    const found = performancesFor('goblet-squat', [older, running, newer]);
    expect(found.map((entry) => entry.localDate)).toEqual(['2026-10-04', '2026-10-01']);
  });

  it('counts form as held only when every set says so', () => {
    const mixed = session({
      sets: [set('goblet-squat', 1), set('goblet-squat', 2, { formOk: false })],
    });
    expect(performancesFor('goblet-squat', [mixed])[0]!.formOk).toBe(false);
    const unanswered = session({ sets: [set('goblet-squat', 1, { formOk: null })] });
    expect(performancesFor('goblet-squat', [unanswered])[0]!.formOk).toBeNull();
  });

  it('counts completed workouts in the last fourteen days', () => {
    const sessions = [
      session({ localDate: '2026-10-10' }),
      session({ localDate: '2026-09-27' }),
      session({ localDate: '2026-09-26' }),
      session({ localDate: '2026-10-09', status: 'abandoned' }),
    ];
    expect(recentSessionCount(sessions, '2026-10-10')).toBe(2);
  });
});

describe('restRemaining', () => {
  it('counts down from the last logged set, and never below zero', () => {
    const last = new Date('2026-10-05T08:00:00Z');
    expect(restRemaining(90, last, new Date('2026-10-05T08:00:30Z'))).toBe(60);
    expect(restRemaining(90, last, new Date('2026-10-05T08:05:00Z'))).toBe(0);
    expect(restRemaining(90, null, new Date())).toBe(0);
  });
});

describe('setLogSchema', () => {
  it('accepts a normal set and rejects nonsense', () => {
    expect(
      setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1, reps: 10, rpe: 7.5 }).success,
    ).toBe(true);
    expect(
      setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1, reps: 10, rpe: 11 }).success,
    ).toBe(false);
    expect(
      setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1, reps: 10, pain: 12 }).success,
    ).toBe(false);
    expect(setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1, reps: -1 }).success).toBe(
      false,
    );
    expect(
      setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1, rpe: 7.3, reps: 5 }).success,
    ).toBe(false);
  });

  it('needs something measured for a completed set', () => {
    expect(setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1 }).success).toBe(false);
    expect(
      setLogSchema.safeParse({ exerciseSlug: 'push-up', setIndex: 1, completed: false }).success,
    ).toBe(true);
  });
});

describe('summaries', () => {
  it('adds up what was done, plainly', () => {
    const summary = summariseWorkout(session());
    expect(summary.setsDone).toBe(3);
    expect(summary.totalReps).toBe(36);
    expect(summary.volumeKg).toBe(576);
    expect(summary.minutes).toBe(40);
    expect(describeWorkout(session())).toBe('3 sets logged · 40 min · 576 kg moved.');
  });

  it('describes stopping early without judgement', () => {
    expect(describeWorkout(session({ status: 'abandoned', sets: [] }))).toMatch(/you started/);
    expect(describeWorkout(session({ status: 'abandoned' }))).toMatch(/Stopping when you need to/);
  });

  it('says that the minimum counts, and flags pain for next time', () => {
    expect(describeWorkout(session({ minimumMode: true }))).toMatch(
      /minimum counts as a full session/,
    );
    expect(describeWorkout(session({ sets: [set('goblet-squat', 1, { pain: 5 })] }))).toMatch(
      /next time is lighter/,
    );
  });
});
