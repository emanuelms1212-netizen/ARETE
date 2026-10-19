import { describe, expect, it } from 'vitest';
import {
  BODY,
  CONTACT_TOLERANCE,
  boundsOf,
  cueAt,
  frameAt,
  phaseAt,
  poseAt,
  solvePose,
  validateAnimation,
  type ExerciseAnimation,
  type SolvedFrame,
} from '@/domain/mannequin';
import {
  ANIMATIONS,
  ELEPHANT_WALK,
  GLUTE_BRIDGE,
  GOOD_MORNING,
  LEG_SWING,
  LUNGE,
  PLANK,
  PUSH_UP,
  SINGLE_LEG_RDL,
  SQUAT,
  animationFor,
} from './animations';

/**
 * Every animation is checked twice: once by the generic validator (pins
 * reachable, joints in range, nothing through the floor, contacts planted) and
 * once against what the movement is meant to teach. The second set is the one
 * that matters — an animation that passes the first and fails the second is a
 * well-drawn demonstration of bad form.
 */
const SAMPLES = 120;

function sample(animation: ExerciseAnimation): SolvedFrame[] {
  return Array.from({ length: SAMPLES + 1 }, (_, index) =>
    solvePose(poseAt(animation, index / SAMPLES), animation.pinned),
  );
}

const max = (values: number[]) => Math.max(...values);
const min = (values: number[]) => Math.min(...values);

describe('every animation', () => {
  it('includes the nine the build asks for', () => {
    expect(ANIMATIONS.map((animation) => animation.slug).sort()).toEqual(
      [
        'elephant-walk',
        'glute-bridge',
        'good-morning',
        'leg-swing',
        'lunge',
        'plank',
        'push-up',
        'single-leg-rdl',
        'squat',
      ].sort(),
    );
  });

  it.each(ANIMATIONS.map((animation) => [animation.slug, animation] as const))(
    '%s passes the generic validator',
    (_slug, animation) => {
      expect(validateAnimation(animation)).toEqual([]);
    },
  );

  it.each(ANIMATIONS.map((animation) => [animation.slug, animation] as const))(
    '%s has captions covering the whole cycle',
    (_slug, animation) => {
      for (let index = 0; index <= 100; index += 1) {
        expect(cueAt(animation, index / 100), `${animation.slug} at ${index}%`).not.toBeNull();
      }
    },
  );

  it.each(ANIMATIONS.map((animation) => [animation.slug, animation] as const))(
    '%s loops without a jump',
    (_slug, animation) => {
      const start = solvePose(poseAt(animation, animation.loop.from), animation.pinned).points;
      const end = solvePose(poseAt(animation, animation.loop.to), animation.pinned).points;
      for (const joint of Object.keys(start) as (keyof typeof start)[]) {
        expect(Math.abs(start[joint].x - end[joint].x)).toBeLessThan(0.01);
        expect(Math.abs(start[joint].y - end[joint].y)).toBeLessThan(0.01);
      }
    },
  );

  it.each(ANIMATIONS.map((animation) => [animation.slug, animation] as const))(
    '%s keeps every bone its own length',
    (_slug, animation) => {
      for (const frame of sample(animation)) {
        const p = frame.points;
        const length = (a: keyof typeof p, b: keyof typeof p) =>
          Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
        expect(length('pelvis', 'shoulder')).toBeCloseTo(BODY.trunk, 3);
        expect(length('pelvis', 'nearKnee')).toBeCloseTo(BODY.thigh, 3);
        expect(length('nearKnee', 'nearAnkle')).toBeCloseTo(BODY.shin, 3);
        expect(length('pelvis', 'farKnee')).toBeCloseTo(BODY.thigh, 3);
        expect(length('farKnee', 'farAnkle')).toBeCloseTo(BODY.shin, 3);
        expect(length('shoulder', 'nearElbow')).toBeCloseTo(BODY.upperArm, 3);
        expect(length('nearElbow', 'nearWrist')).toBeCloseTo(BODY.forearm, 3);
      }
    },
  );

  it('is found by slug, and unknown slugs find nothing', () => {
    expect(animationFor('squat')).toBe(SQUAT);
    expect(animationFor('handstand')).toBeNull();
    expect(animationFor(null)).toBeNull();
  });

  it('offers a front view only where one is drawn', () => {
    for (const animation of ANIMATIONS) {
      if (animation.views.includes('front')) {
        const frame = frameAt(animation, 0.5, 'front');
        // Left and right are mirrored about the midline.
        expect(frame.nearAnkle.x).toBeCloseTo(-frame.farAnkle.x, 6);
        expect(frame.nearKnee.y).toBeCloseTo(frameAt(animation, 0.5, 'side').nearKnee.y, 6);
      }
    }
    expect(SQUAT.views).toContain('front');
    expect(PUSH_UP.views).not.toContain('front');
  });

  it('frames the figure in a box that holds every frame', () => {
    for (const animation of ANIMATIONS) {
      for (const view of animation.views) {
        const box = boundsOf(animation, view);
        for (let index = 0; index <= 20; index += 1) {
          for (const point of Object.values(frameAt(animation, index / 20, view))) {
            expect(point.x).toBeGreaterThanOrEqual(box.minX);
            expect(point.x).toBeLessThanOrEqual(box.maxX);
            expect(point.y).toBeLessThanOrEqual(box.maxY);
          }
        }
      }
    }
  });

  it('solves a frame cheaply enough for a mid-range phone', () => {
    // 60 fps leaves ~16 ms a frame for everything. Solving a pose has to be a
    // rounding error inside that, even on a phone several times slower than
    // this machine.
    const frames = 20_000;
    const started = performance.now();
    for (let index = 0; index < frames; index += 1) {
      frameAt(ANIMATIONS[index % ANIMATIONS.length]!, (index % 97) / 97);
    }
    const perFrame = (performance.now() - started) / frames;
    expect(perFrame).toBeLessThan(0.05);
  });
});

describe('phaseAt', () => {
  it('plays the first pass from zero and then repeats the loop', () => {
    const animation = { ...SQUAT, durationMs: 1000, loop: { from: 0.2, to: 0.8 } };
    expect(phaseAt(animation, 0)).toBe(0);
    expect(phaseAt(animation, 500)).toBeCloseTo(0.5);
    expect(phaseAt(animation, 800)).toBeCloseTo(0.8);
    expect(phaseAt(animation, 900)).toBeCloseTo(0.3);
    expect(phaseAt(animation, 1400)).toBeCloseTo(0.2, 5);
  });
});

describe('squat', () => {
  const frames = sample(SQUAT);

  it('keeps both heels on the floor the whole way down', () => {
    for (const frame of frames) {
      expect(Math.abs(frame.points.nearHeel.y)).toBeLessThan(CONTACT_TOLERANCE);
      expect(Math.abs(frame.points.farHeel.y)).toBeLessThan(CONTACT_TOLERANCE);
    }
  });

  it('reaches a working depth: knees past 90° at the bottom', () => {
    expect(max(frames.map((frame) => frame.angles.nearKnee))).toBeGreaterThan(90);
  });

  it('keeps the chest up: trunk lean stays under 45°', () => {
    expect(max(frames.map((frame) => frame.angles.trunk))).toBeLessThanOrEqual(45);
  });

  it('keeps the knees moving forward over the feet rather than back', () => {
    for (const frame of frames)
      expect(frame.points.nearKnee.x).toBeGreaterThan(frame.points.nearAnkle.x - 0.5);
  });

  it('draws the knees tracking outwards over the feet from the front', () => {
    const top = frameAt(SQUAT, 0, 'front');
    const bottom = frameAt(SQUAT, 0.5, 'front');
    expect(Math.abs(bottom.nearKnee.x)).toBeGreaterThan(Math.abs(top.nearKnee.x));
    expect(Math.abs(bottom.nearKnee.x)).toBeGreaterThanOrEqual(Math.abs(bottom.nearAnkle.x));
  });
});

describe('push-up', () => {
  const frames = sample(PUSH_UP);

  it('holds a straight line: the hips neither sag nor pike by more than 6°', () => {
    for (const frame of frames) {
      expect(Math.abs(frame.angles.nearHip)).toBeLessThan(6);
      expect(Math.abs(frame.angles.nearKnee)).toBeLessThan(6);
    }
  });

  it('starts with the arms nearly straight and bends past 90° at the bottom', () => {
    expect(frames[0]!.angles.nearElbow).toBeLessThan(15);
    expect(max(frames.map((frame) => frame.angles.nearElbow))).toBeGreaterThan(90);
  });

  it('puts the hands under the shoulders at the top', () => {
    const top = frames[0]!.points;
    expect(Math.abs(top.nearWrist.x - top.shoulder.x)).toBeLessThan(2);
  });

  it('keeps the elbows behind the shoulders, not flared forward', () => {
    for (const frame of frames)
      expect(frame.points.nearElbow.x).toBeLessThanOrEqual(frame.points.shoulder.x + 0.5);
  });
});

describe('plank', () => {
  const frames = sample(PLANK);

  it('is a hold: nothing moves', () => {
    const first = frames[0]!.points;
    for (const frame of frames) expect(frame.points.pelvis).toEqual(first.pelvis);
  });

  it('holds a straight body with elbows under the shoulders', () => {
    const frame = frames[0]!;
    expect(Math.abs(frame.angles.nearHip)).toBeLessThan(2);
    expect(Math.abs(frame.points.nearElbow.x - frame.points.shoulder.x)).toBeLessThan(1);
    expect(frame.angles.nearElbow).toBeCloseTo(90, 0);
  });
});

describe('lunge', () => {
  const frames = sample(LUNGE);
  const bottom = solvePose(poseAt(LUNGE, 0.5), LUNGE.pinned);

  it('lowers the back knee close to the floor without touching it', () => {
    expect(bottom.points.farKnee.y).toBeGreaterThan(2);
    expect(bottom.points.farKnee.y).toBeLessThan(12);
  });

  it('bends the front knee to about 90° with the shin near vertical', () => {
    expect(bottom.angles.nearKnee).toBeGreaterThan(80);
    expect(bottom.angles.nearKnee).toBeLessThan(105);
    expect(Math.abs(bottom.points.nearKnee.x - bottom.points.nearAnkle.x)).toBeLessThan(8);
  });

  it('keeps the trunk upright and the front heel down', () => {
    for (const frame of frames) {
      expect(Math.abs(frame.angles.trunk)).toBeLessThan(10);
      expect(Math.abs(frame.points.nearHeel.y)).toBeLessThan(CONTACT_TOLERANCE);
    }
  });
});

describe('glute bridge', () => {
  const frames = sample(GLUTE_BRIDGE);
  const top = solvePose(poseAt(GLUTE_BRIDGE, 0.5), GLUTE_BRIDGE.pinned);

  it('keeps the shoulders and head on the floor', () => {
    for (const frame of frames) {
      expect(frame.points.shoulder.y).toBeLessThan(10);
      expect(Math.abs(frame.points.head.y - BODY.headRadius)).toBeLessThan(1);
    }
  });

  it('finishes with the hips extended in line with the trunk, not arched past it', () => {
    expect(Math.abs(top.angles.nearHip)).toBeLessThan(8);
    expect(min(frames.map((frame) => frame.angles.nearHip))).toBeGreaterThan(-8);
  });

  it('keeps the feet flat', () => {
    for (const frame of frames)
      expect(Math.abs(frame.points.nearHeel.y)).toBeLessThan(CONTACT_TOLERANCE);
  });
});

describe('single-leg Romanian deadlift', () => {
  const frames = sample(SINGLE_LEG_RDL);
  const bottom = solvePose(poseAt(SINGLE_LEG_RDL, 0.5), SINGLE_LEG_RDL.pinned);

  it('moves the trunk and free leg as one line at the bottom', () => {
    expect(Math.abs(bottom.angles.nearHip)).toBeLessThan(10);
    expect(bottom.angles.trunk).toBeGreaterThan(60);
  });

  it('keeps the standing knee soft but not squatting', () => {
    for (const frame of frames) {
      expect(frame.angles.farKnee).toBeGreaterThan(5);
      expect(frame.angles.farKnee).toBeLessThan(30);
    }
  });

  it('never lets the free foot touch down', () => {
    for (const frame of frames) {
      expect(frame.points.nearToe.y).toBeGreaterThan(1);
      expect(frame.points.nearHeel.y).toBeGreaterThan(1);
    }
  });
});

describe('good morning', () => {
  const frames = sample(GOOD_MORNING);

  it('is a hinge, not a squat: knees stay soft while the trunk tips past 60°', () => {
    expect(max(frames.map((frame) => frame.angles.trunk))).toBeGreaterThan(60);
    expect(max(frames.map((frame) => frame.angles.nearKnee))).toBeLessThan(30);
  });

  it('sends the hips back as the chest goes forward', () => {
    const top = frames[0]!.points;
    const bottom = solvePose(poseAt(GOOD_MORNING, 0.5), GOOD_MORNING.pinned).points;
    expect(bottom.pelvis.x).toBeLessThan(top.pelvis.x - 5);
  });
});

describe('leg swing', () => {
  const frames = sample(LEG_SWING);

  it('swings through a real range, more in front than behind', () => {
    const hips = frames.map((frame) => frame.angles.nearHip);
    expect(max(hips)).toBeGreaterThan(50);
    expect(min(hips)).toBeLessThan(-15);
  });

  it('keeps the standing leg straight and the trunk still', () => {
    for (const frame of frames) {
      expect(frame.angles.farKnee).toBeLessThan(15);
      expect(frame.angles.trunk).toBe(0);
    }
  });

  it('clears the floor with the swinging foot', () => {
    for (const frame of frames) {
      expect(frame.points.nearToe.y).toBeGreaterThan(0.5);
      expect(frame.points.nearHeel.y).toBeGreaterThan(0.5);
    }
  });
});

describe('elephant walk', () => {
  const frames = sample(ELEPHANT_WALK);
  const near = solvePose(poseAt(ELEPHANT_WALK, 0.25), ELEPHANT_WALK.pinned);
  const far = solvePose(poseAt(ELEPHANT_WALK, 0.75), ELEPHANT_WALK.pinned);

  it('alternates: one knee bends while the other straightens', () => {
    expect(near.angles.nearKnee).toBeGreaterThan(near.angles.farKnee + 20);
    expect(far.angles.farKnee).toBeGreaterThan(far.angles.nearKnee + 20);
  });

  it('lifts the heel of the bent leg and presses the other down', () => {
    expect(near.points.nearHeel.y).toBeGreaterThan(5);
    expect(near.points.farHeel.y).toBeLessThan(CONTACT_TOLERANCE);
  });

  it('keeps both hands on the floor throughout', () => {
    for (const frame of frames) {
      expect(Math.abs(frame.points.nearHand.y)).toBeLessThan(CONTACT_TOLERANCE);
      expect(Math.abs(frame.points.farHand.y)).toBeLessThan(CONTACT_TOLERANCE);
    }
  });
});
