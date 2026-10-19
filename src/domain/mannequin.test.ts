import { describe, expect, it } from 'vitest';
import {
  BODY,
  ankleForToe,
  dir,
  ease,
  poseAt,
  solvePose,
  solveTwoBone,
  thetaOf,
  validateAnimation,
  wrap,
  type ExerciseAnimation,
} from './mannequin';

const standing: ExerciseAnimation = {
  slug: 'test-stand',
  title: 'Stand',
  views: ['side'],
  durationMs: 2000,
  loop: { from: 0, to: 1 },
  pinned: {},
  keyframes: [
    { at: 0, pose: { pelvis: { x: 0, y: 93 }, trunk: 0, neck: 0 } },
    { at: 1, pose: { pelvis: { x: 0, y: 93 }, trunk: 0, neck: 0 } },
  ],
  cues: [{ from: 0, to: 1, text: 'Stand.' }],
  highlight: { joints: [], segments: [], label: 'Nothing.' },
  contacts: ['nearHeel', 'nearToe'],
};

describe('angles', () => {
  it('measures θ from straight down, forward positive', () => {
    expect(dir(0).x).toBeCloseTo(0);
    expect(dir(0).y).toBeCloseTo(-1);
    expect(dir(90).x).toBeCloseTo(1);
    expect(thetaOf({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
    expect(thetaOf({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(0);
  });

  it('folds differences into a half-turn either side', () => {
    expect(wrap(190)).toBe(-170);
    expect(wrap(-190)).toBe(170);
    expect(wrap(45)).toBe(45);
  });
});

describe('ease', () => {
  it('starts at 0, ends at 1, and is symmetric for inOut', () => {
    for (const kind of ['linear', 'in', 'out', 'inOut'] as const) {
      expect(ease(kind, 0)).toBe(0);
      expect(ease(kind, 1)).toBe(1);
    }
    expect(ease('inOut', 0.5)).toBeCloseTo(0.5);
    expect(ease('in', 0.5)).toBeLessThan(0.5);
    expect(ease('out', 0.5)).toBeGreaterThan(0.5);
  });

  it('clamps out-of-range input', () => {
    expect(ease('linear', -1)).toBe(0);
    expect(ease('linear', 2)).toBe(1);
  });
});

describe('solveTwoBone', () => {
  it('meets a reachable target exactly', () => {
    const solved = solveTwoBone({ x: 0, y: 0 }, { x: 30, y: -50 }, 43, 43, 1);
    expect(solved.reachError).toBe(0);
    expect(solved.end.x).toBeCloseTo(30, 6);
    expect(solved.end.y).toBeCloseTo(-50, 6);
    expect(Math.hypot(solved.middle.x, solved.middle.y)).toBeCloseTo(43, 6);
  });

  it('reports, rather than hides, a target out of reach', () => {
    const solved = solveTwoBone({ x: 0, y: 0 }, { x: 0, y: -100 }, 43, 43, 1);
    expect(solved.reachError).toBeCloseTo(14, 3);
  });

  it('bends the middle joint to the requested side', () => {
    const forward = solveTwoBone({ x: 0, y: 0 }, { x: 0, y: -60 }, 43, 43, 1);
    const back = solveTwoBone({ x: 0, y: 0 }, { x: 0, y: -60 }, 43, 43, -1);
    expect(forward.middle.x).toBeGreaterThan(0);
    expect(back.middle.x).toBeLessThan(0);
  });
});

describe('solvePose', () => {
  it('stands a figure with straight limbs at the expected heights', () => {
    const solved = solvePose(poseAt(standing, 0), standing.pinned);
    expect(solved.points.shoulder.y).toBeCloseTo(93 + BODY.trunk);
    expect(solved.points.nearAnkle.y).toBeCloseTo(93 - BODY.thigh - BODY.shin);
    expect(solved.points.nearHeel.y).toBeCloseTo(0);
    expect(solved.points.nearToe.y).toBeCloseTo(0);
  });

  it('keeps a pinned toe where it was put, whatever the foot angle', () => {
    for (const rotation of [0, -20, -45]) {
      const solved = solvePose(
        {
          pelvis: { x: 0, y: 85 },
          trunk: 0,
          neck: 0,
          pins: { nearLeg: { x: 20, y: 0 } },
          feet: { near: rotation },
        },
        { nearLeg: 1 },
      );
      expect(solved.points.nearToe.x).toBeCloseTo(20, 6);
      expect(solved.points.nearToe.y).toBeCloseTo(0, 6);
      expect(solved.points.nearAnkle.x).toBeCloseTo(ankleForToe({ x: 20, y: 0 }, rotation).x, 6);
    }
  });

  it('treats dorsiflexion as lifting the toe of a vertical shin', () => {
    const solved = solvePose(
      { pelvis: { x: 0, y: 100 }, trunk: 0, neck: 0, nearLeg: { hip: 0, knee: 0, ankle: 20 } },
      {},
    );
    expect(solved.points.nearToe.y).toBeGreaterThan(solved.points.nearHeel.y);
  });
});

describe('validateAnimation', () => {
  it('passes a figure standing still', () => {
    expect(validateAnimation(standing)).toEqual([]);
  });

  it('catches a figure sunk into the floor', () => {
    const sunk = {
      ...standing,
      keyframes: standing.keyframes.map((frame) => ({
        ...frame,
        pose: { ...frame.pose, pelvis: { x: 0, y: 80 } },
      })),
    };
    const problems = validateAnimation(sunk).map((problem) => problem.problem);
    expect(problems.some((problem) => problem.includes('below the floor'))).toBe(true);
  });

  it('catches a stretched limb', () => {
    const stretched: ExerciseAnimation = {
      ...standing,
      pinned: { nearLeg: 1 },
      keyframes: standing.keyframes.map((frame) => ({
        ...frame,
        pose: { ...frame.pose, pelvis: { x: 0, y: 120 }, pins: { nearLeg: { x: 20, y: 0 } } },
      })),
      contacts: [],
    };
    const problems = validateAnimation(stretched).map((problem) => problem.problem);
    expect(problems.some((problem) => problem.includes('stretched'))).toBe(true);
  });

  it('catches impossible joint angles and missing captions', () => {
    const broken: ExerciseAnimation = {
      ...standing,
      cues: [],
      keyframes: standing.keyframes.map((frame) => ({
        ...frame,
        pose: { ...frame.pose, pelvis: { x: 0, y: 140 }, nearLeg: { hip: 0, knee: -40, ankle: 0 } },
      })),
      contacts: [],
    };
    const problems = validateAnimation(broken).map((problem) => problem.problem);
    expect(problems.some((problem) => problem.includes('knee flexion'))).toBe(true);
    expect(problems.some((problem) => problem.includes('captioned'))).toBe(true);
  });

  it('catches keyframes that do not span the cycle', () => {
    const partial = {
      ...standing,
      keyframes: [standing.keyframes[0]!, { ...standing.keyframes[1]!, at: 0.8 }],
    };
    expect(
      validateAnimation(partial).some((problem) => problem.problem.includes('last keyframe')),
    ).toBe(true);
  });
});
