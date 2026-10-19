import {
  BODY,
  type ExerciseAnimation,
  type Keyframe,
  type Pose,
  type Vec,
  ankleForToe,
} from '@/domain/mannequin';

/**
 * ARETE's own exercise animations, as data.
 *
 * Each one is a handful of keyframes for the mannequin in `domain/mannequin`:
 * joint angles for the limbs that move freely, positions for the pelvis and
 * for anything that touches the floor. Nothing here is traced from a
 * photograph or a video; the numbers were worked out from segment lengths and
 * then held to account by `animations.test.ts`, which fails if a heel lifts in
 * a squat or the hips sag in a push-up.
 *
 * A few poses are computed rather than typed. A push-up is a straight body
 * rotating about the toes, and writing the pelvis as a formula keeps it on the
 * arc; typing the numbers would only be a less precise way of saying the same
 * thing. The result is still plain data by the time anything reads it.
 *
 * These are instructional aids. They show what the movement is meant to look
 * like. They cannot see the person doing it, and the screen says so.
 */

const RAD = Math.PI / 180;
const LEG = BODY.thigh + BODY.shin;

/** Toe positions shared by the standing animations: feet under the hips, facing forward. */
const STANDING_TOE: Vec = { x: BODY.toe, y: 0 };

// ---------------------------------------------------------------------------
// Squat
// ---------------------------------------------------------------------------

/**
 * Arms reach forward as a counterbalance, so their angle tracks the trunk:
 * absolute arm direction stays horizontal (θ = 90), which in relative terms
 * is shoulder flexion = 90 + trunk lean.
 */
function squatPose(pelvis: Vec, trunk: number): Pose {
  return {
    pelvis,
    trunk,
    neck: -trunk * 0.4,
    nearArm: { shoulder: 90 + trunk, elbow: 0 },
    farArm: { shoulder: 90 + trunk, elbow: 0 },
    pins: { nearLeg: STANDING_TOE, farLeg: STANDING_TOE },
    feet: { near: 0, far: 0 },
  };
}

const squatTop = squatPose({ x: -0.5, y: 92.9 }, 4);
const squatBottom = squatPose({ x: -21.5, y: 48 }, 40);

export const SQUAT: ExerciseAnimation = {
  slug: 'squat',
  title: 'Squat',
  views: ['side', 'front'],
  durationMs: 3200,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1 },
  keyframes: [
    { at: 0, pose: squatTop },
    { at: 0.45, pose: squatBottom, ease: 'inOut' },
    { at: 0.55, pose: squatBottom, ease: 'linear' },
    { at: 1, pose: squatTop, ease: 'inOut' },
  ],
  cues: [
    { from: 0, to: 0.12, text: 'Feet about hip-width, weight through the whole foot.' },
    { from: 0.12, to: 0.45, text: 'Sit back and down, knees following the toes.' },
    { from: 0.45, to: 0.55, text: 'Heels stay down. Chest stays proud.' },
    { from: 0.55, to: 1, text: 'Drive up through the whole foot to stand tall.' },
  ],
  highlight: {
    joints: ['nearKnee', 'pelvis'],
    segments: ['nearThigh'],
    label: 'Thighs and hips do the work.',
  },
  front: { stanceHalf: 14, kneeOut: 4 },
  contacts: ['nearHeel', 'nearToe', 'farHeel', 'farToe'],
};

// ---------------------------------------------------------------------------
// Push-up, and the plank it is built from
// ---------------------------------------------------------------------------

/**
 * A straight body pivoting about the toes. `lift` is the angle of the
 * ankle–shoulder line above horizontal.
 */
const TUCKED_FOOT = -50;
const PRONE_TOE: Vec = { x: 0, y: 0 };
const PRONE_ANKLE = ankleForToe(PRONE_TOE, TUCKED_FOOT);

function plankLine(lift: number): { pelvis: Vec; shoulder: Vec; trunk: number } {
  const c = Math.cos(lift * RAD);
  const s = Math.sin(lift * RAD);
  return {
    pelvis: { x: PRONE_ANKLE.x + LEG * c, y: PRONE_ANKLE.y + LEG * s },
    shoulder: {
      x: PRONE_ANKLE.x + (LEG + BODY.trunk) * c,
      y: PRONE_ANKLE.y + (LEG + BODY.trunk) * s,
    },
    trunk: 90 - lift,
  };
}

const PUSH_UP_TOP_LIFT = 16.5;
const PUSH_UP_BOTTOM_LIFT = 6;
const PUSH_UP_HANDS: Vec = { x: plankLine(PUSH_UP_TOP_LIFT).shoulder.x, y: 1.5 };

function pushUpPose(lift: number): Pose {
  const line = plankLine(lift);
  return {
    pelvis: line.pelvis,
    trunk: line.trunk,
    neck: 0,
    pins: {
      nearLeg: PRONE_TOE,
      farLeg: PRONE_TOE,
      nearArm: PUSH_UP_HANDS,
      farArm: PUSH_UP_HANDS,
    },
    feet: { near: TUCKED_FOOT, far: TUCKED_FOOT },
  };
}

/**
 * Lowering and pressing in several short spans, so the pelvis follows the arc
 * closely instead of cutting the chord (which would bend the knees).
 */
function pushUpKeyframes(): Keyframe[] {
  const steps = 4;
  const down: Keyframe[] = [];
  const up: Keyframe[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const lift = PUSH_UP_TOP_LIFT + ((PUSH_UP_BOTTOM_LIFT - PUSH_UP_TOP_LIFT) * index) / steps;
    down.push({
      at: 0.45 * (index / steps),
      pose: pushUpPose(lift),
      ease: index === 1 ? 'in' : index === steps ? 'out' : 'linear',
    });
  }
  for (let index = 1; index <= steps; index += 1) {
    const lift = PUSH_UP_BOTTOM_LIFT + ((PUSH_UP_TOP_LIFT - PUSH_UP_BOTTOM_LIFT) * index) / steps;
    up.push({
      at: 0.55 + 0.45 * (index / steps),
      pose: pushUpPose(lift),
      ease: index === 1 ? 'in' : index === steps ? 'out' : 'linear',
    });
  }
  return [
    { at: 0, pose: pushUpPose(PUSH_UP_TOP_LIFT) },
    ...down,
    { at: 0.55, pose: pushUpPose(PUSH_UP_BOTTOM_LIFT), ease: 'linear' },
    ...up,
  ];
}

export const PUSH_UP: ExerciseAnimation = {
  slug: 'push-up',
  title: 'Push-up',
  views: ['side'],
  durationMs: 3000,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1, nearArm: -1, farArm: -1 },
  keyframes: pushUpKeyframes(),
  cues: [
    { from: 0, to: 0.1, text: 'Hands under the shoulders, body in one line.' },
    { from: 0.1, to: 0.45, text: 'Lower as one piece. Elbows travel back, not out.' },
    { from: 0.45, to: 0.55, text: 'Chest close to the floor. Hips level with the shoulders.' },
    { from: 0.55, to: 1, text: 'Press the floor away and keep the line.' },
  ],
  highlight: {
    joints: ['nearElbow', 'shoulder'],
    segments: ['nearUpperArm', 'trunk'],
    label: 'Chest, shoulders and the backs of the arms.',
  },
  contacts: ['nearToe', 'farToe', 'nearHand', 'farHand'],
};

/** Forearm plank: elbows under shoulders, forearms flat, body straight. */
const PLANK_ELBOW_HEIGHT = 1.5;
const PLANK_LIFT =
  Math.asin((PLANK_ELBOW_HEIGHT + BODY.upperArm - PRONE_ANKLE.y) / (LEG + BODY.trunk)) / RAD;
const plankHold: Pose = (() => {
  const line = plankLine(PLANK_LIFT);
  const wrist: Vec = { x: line.shoulder.x + BODY.forearm, y: PLANK_ELBOW_HEIGHT };
  return {
    pelvis: line.pelvis,
    trunk: line.trunk,
    neck: 0,
    pins: { nearLeg: PRONE_TOE, farLeg: PRONE_TOE, nearArm: wrist, farArm: wrist },
    feet: { near: TUCKED_FOOT, far: TUCKED_FOOT },
  };
})();

export const PLANK: ExerciseAnimation = {
  slug: 'plank',
  title: 'Forearm plank',
  views: ['side'],
  durationMs: 4500,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1, nearArm: -1, farArm: -1 },
  keyframes: [
    { at: 0, pose: plankHold },
    { at: 1, pose: plankHold, ease: 'linear' },
  ],
  cues: [
    { from: 0, to: 0.33, text: 'Elbows under the shoulders, forearms flat.' },
    { from: 0.33, to: 0.66, text: 'One straight line from heels to head.' },
    { from: 0.66, to: 1, text: 'Breathe steadily. Brace as if about to be nudged.' },
  ],
  highlight: {
    joints: ['pelvis'],
    segments: ['trunk'],
    label: 'The trunk holds the line; nothing moves.',
  },
  contacts: ['nearToe', 'farToe', 'nearHand', 'farHand', 'nearWrist', 'farWrist'],
};

// ---------------------------------------------------------------------------
// Lunge
// ---------------------------------------------------------------------------

const LUNGE_FRONT_TOE: Vec = { x: 40, y: 0 };
const LUNGE_BACK_TOE: Vec = { x: -60, y: 0 };
const LUNGE_BACK_FOOT = -45;

function lungePose(pelvis: Vec): Pose {
  return {
    pelvis,
    trunk: 3,
    neck: -3,
    nearArm: { shoulder: 5, elbow: 15 },
    farArm: { shoulder: 5, elbow: 15 },
    pins: { nearLeg: LUNGE_FRONT_TOE, farLeg: LUNGE_BACK_TOE },
    feet: { near: 0, far: LUNGE_BACK_FOOT },
  };
}

const lungeTop = lungePose({ x: -21, y: 82.5 });
const lungeBottom = lungePose({ x: -23, y: 50 });

export const LUNGE: ExerciseAnimation = {
  slug: 'lunge',
  title: 'Split squat (lunge)',
  views: ['side', 'front'],
  durationMs: 3200,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1 },
  keyframes: [
    { at: 0, pose: lungeTop },
    { at: 0.45, pose: lungeBottom, ease: 'inOut' },
    { at: 0.55, pose: lungeBottom, ease: 'linear' },
    { at: 1, pose: lungeTop, ease: 'inOut' },
  ],
  cues: [
    { from: 0, to: 0.12, text: 'Long split stance. Back heel up, hips square.' },
    { from: 0.12, to: 0.45, text: 'Lower straight down. The back knee heads for the floor.' },
    { from: 0.45, to: 0.55, text: 'Front knee over the foot, not caving in.' },
    { from: 0.55, to: 1, text: 'Push through the whole front foot to rise.' },
  ],
  highlight: {
    joints: ['nearKnee', 'farKnee'],
    segments: ['nearThigh'],
    label: 'The front thigh and hip, with the back leg steadying.',
  },
  front: { stanceHalf: 9, kneeOut: 2 },
  contacts: ['nearHeel', 'nearToe', 'farToe'],
};

// ---------------------------------------------------------------------------
// Glute bridge
// ---------------------------------------------------------------------------

/** Lying on the back, head to the left. The shoulders stay put on the floor. */
const BRIDGE_SHOULDER: Vec = { x: 0, y: 9 };
const BRIDGE_TOE: Vec = { x: 110, y: 0 };

function bridgePose(tilt: number): Pose {
  // `tilt` is how far the pelvis is lifted, as an angle about the shoulders.
  const trunk = -90 - tilt;
  const pelvis: Vec = {
    x: BRIDGE_SHOULDER.x - BODY.trunk * Math.sin(trunk * RAD),
    y: BRIDGE_SHOULDER.y - BODY.trunk * Math.cos(trunk * RAD),
  };
  // Head resting on the floor: the neck makes up whatever the trunk tilts.
  const neck = -87 - trunk;
  // Arms lie along the floor towards the feet, so their absolute direction is
  // fixed and their relative angle moves with the trunk.
  const arm = { shoulder: 83 + trunk, elbow: 0 };
  return {
    pelvis,
    trunk,
    neck,
    nearArm: arm,
    farArm: arm,
    pins: { nearLeg: BRIDGE_TOE, farLeg: BRIDGE_TOE },
    feet: { near: 0, far: 0 },
  };
}

function bridgeKeyframes(): Keyframe[] {
  const top = 25;
  const steps = 3;
  const frames: Keyframe[] = [{ at: 0, pose: bridgePose(0) }];
  for (let index = 1; index <= steps; index += 1) {
    frames.push({
      at: 0.4 * (index / steps),
      pose: bridgePose((top * index) / steps),
      ease: index === 1 ? 'in' : index === steps ? 'out' : 'linear',
    });
  }
  frames.push({ at: 0.55, pose: bridgePose(top), ease: 'linear' });
  for (let index = 1; index <= steps; index += 1) {
    frames.push({
      at: 0.55 + 0.45 * (index / steps),
      pose: bridgePose(top - (top * index) / steps),
      ease: index === 1 ? 'in' : index === steps ? 'out' : 'linear',
    });
  }
  return frames;
}

export const GLUTE_BRIDGE: ExerciseAnimation = {
  slug: 'glute-bridge',
  title: 'Glute bridge',
  views: ['side'],
  durationMs: 3400,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1 },
  keyframes: bridgeKeyframes(),
  cues: [
    { from: 0, to: 0.1, text: 'On your back, feet flat, knees bent.' },
    { from: 0.1, to: 0.4, text: 'Press through the heels and lift the hips.' },
    { from: 0.4, to: 0.55, text: 'Squeeze at the top: ribs down, no arching.' },
    { from: 0.55, to: 1, text: 'Lower slowly, back to the floor.' },
  ],
  highlight: {
    joints: ['pelvis'],
    segments: ['nearThigh'],
    label: 'Glutes, with the hamstrings helping.',
  },
  contacts: ['nearHeel', 'nearToe', 'farHeel', 'farToe'],
};

// ---------------------------------------------------------------------------
// Hinges: single-leg RDL and good morning
// ---------------------------------------------------------------------------

function singleLegRdlPose(
  pelvis: Vec,
  trunk: number,
  free: { hip: number; knee: number; ankle: number },
): Pose {
  return {
    pelvis,
    trunk,
    neck: 0,
    // Arms hang straight down whatever the trunk does.
    nearArm: { shoulder: trunk, elbow: 0 },
    farArm: { shoulder: trunk, elbow: 0 },
    nearLeg: free,
    pins: { farLeg: STANDING_TOE },
    feet: { far: 0 },
  };
}

const rdlTop = singleLegRdlPose({ x: -1, y: 92.3 }, 3, { hip: -8, knee: 20, ankle: 21 });
const rdlBottom = singleLegRdlPose({ x: -6, y: 91 }, 78, { hip: 0, knee: 4, ankle: -5 });

export const SINGLE_LEG_RDL: ExerciseAnimation = {
  slug: 'single-leg-rdl',
  title: 'Single-leg Romanian deadlift',
  views: ['side'],
  durationMs: 4000,
  loop: { from: 0, to: 1 },
  pinned: { farLeg: 1 },
  keyframes: [
    { at: 0, pose: rdlTop },
    { at: 0.45, pose: rdlBottom, ease: 'inOut' },
    { at: 0.55, pose: rdlBottom, ease: 'linear' },
    { at: 1, pose: rdlTop, ease: 'inOut' },
  ],
  cues: [
    { from: 0, to: 0.12, text: 'Stand tall on one leg, knee soft.' },
    { from: 0.12, to: 0.45, text: 'Hinge: chest forward, free leg back, one straight line.' },
    { from: 0.45, to: 0.55, text: 'Hips square to the floor. Reach down, not round.' },
    { from: 0.55, to: 1, text: 'Drive the standing hip forward to come up.' },
  ],
  highlight: {
    joints: ['pelvis', 'farKnee'],
    segments: ['farThigh'],
    label: 'Hamstrings and glute of the standing leg.',
  },
  contacts: ['farHeel', 'farToe'],
};

function goodMorningPose(pelvis: Vec, trunk: number): Pose {
  return {
    pelvis,
    trunk,
    neck: 0,
    // Arms crossed on the chest.
    nearArm: { shoulder: 30, elbow: 130 },
    farArm: { shoulder: 30, elbow: 130 },
    pins: { nearLeg: STANDING_TOE, farLeg: STANDING_TOE },
    feet: { near: 0, far: 0 },
  };
}

const goodMorningTop = goodMorningPose({ x: -1, y: 92.3 }, 3);
const goodMorningBottom = goodMorningPose({ x: -12, y: 90.5 }, 72);

export const GOOD_MORNING: ExerciseAnimation = {
  slug: 'good-morning',
  title: 'Good morning (bodyweight)',
  views: ['side'],
  durationMs: 3600,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1 },
  keyframes: [
    { at: 0, pose: goodMorningTop },
    { at: 0.45, pose: goodMorningBottom, ease: 'inOut' },
    { at: 0.55, pose: goodMorningBottom, ease: 'linear' },
    { at: 1, pose: goodMorningTop, ease: 'inOut' },
  ],
  cues: [
    { from: 0, to: 0.12, text: 'Soft knees, arms crossed on the chest.' },
    { from: 0.12, to: 0.45, text: 'Push the hips back; the chest follows forward.' },
    { from: 0.45, to: 0.55, text: 'Stop when the backs of the thighs feel taut, back still flat.' },
    { from: 0.55, to: 1, text: 'Squeeze the glutes to stand tall.' },
  ],
  highlight: {
    joints: ['pelvis'],
    segments: ['nearThigh', 'trunk'],
    label: 'Hamstrings, glutes and the muscles along the spine.',
  },
  contacts: ['nearHeel', 'nearToe', 'farHeel', 'farToe'],
};

// ---------------------------------------------------------------------------
// Warm-up movers: leg swing and elephant walk
// ---------------------------------------------------------------------------

function legSwingPose(free: { hip: number; knee: number; ankle: number }): Pose {
  return {
    pelvis: { x: 0, y: 92.6 },
    trunk: 0,
    neck: 0,
    // The far hand rests on a wall in front for balance.
    farArm: { shoulder: 80, elbow: 10 },
    nearArm: { shoulder: 10, elbow: 20 },
    nearLeg: free,
    pins: { farLeg: STANDING_TOE },
    feet: { far: 0 },
  };
}

const swingBack = legSwingPose({ hip: -25, knee: 5, ankle: 10 });
const swingThrough = legSwingPose({ hip: 12, knee: 32, ankle: 22 });
const swingFront = legSwingPose({ hip: 62, knee: 8, ankle: 10 });

export const LEG_SWING: ExerciseAnimation = {
  slug: 'leg-swing',
  title: 'Leg swing, front to back',
  views: ['side'],
  durationMs: 2400,
  loop: { from: 0, to: 1 },
  pinned: { farLeg: 1 },
  keyframes: [
    { at: 0, pose: swingBack },
    { at: 0.22, pose: swingThrough, ease: 'in' },
    { at: 0.5, pose: swingFront, ease: 'out' },
    { at: 0.72, pose: swingThrough, ease: 'in' },
    { at: 1, pose: swingBack, ease: 'out' },
  ],
  cues: [
    { from: 0, to: 0.25, text: 'Hand on a wall, stand tall on one leg.' },
    { from: 0.25, to: 0.5, text: 'Let the free leg swing forward, relaxed.' },
    { from: 0.5, to: 0.75, text: 'Swing back without arching the low back.' },
    { from: 0.75, to: 1, text: 'Grow the range gradually. Never force it.' },
  ],
  highlight: {
    joints: ['pelvis'],
    segments: ['nearThigh'],
    label: 'Hip flexors and hamstrings, warming through their range.',
  },
  contacts: ['farHeel', 'farToe'],
};

const ELEPHANT_HANDS: Vec = { x: 40, y: 1.5 };

function elephantPose(near: number, far: number): Pose {
  return {
    pelvis: { x: -9, y: 91.5 },
    trunk: 138,
    neck: 20,
    pins: {
      nearLeg: STANDING_TOE,
      farLeg: STANDING_TOE,
      nearArm: ELEPHANT_HANDS,
      farArm: ELEPHANT_HANDS,
    },
    feet: { near, far },
  };
}

export const ELEPHANT_WALK: ExerciseAnimation = {
  slug: 'elephant-walk',
  title: 'Elephant walk',
  views: ['side'],
  durationMs: 4000,
  loop: { from: 0, to: 1 },
  pinned: { nearLeg: 1, farLeg: 1, nearArm: -1, farArm: -1 },
  keyframes: [
    { at: 0, pose: elephantPose(-10, -10) },
    { at: 0.25, pose: elephantPose(-25, 0), ease: 'inOut' },
    { at: 0.5, pose: elephantPose(-10, -10), ease: 'inOut' },
    { at: 0.75, pose: elephantPose(0, -25), ease: 'inOut' },
    { at: 1, pose: elephantPose(-10, -10), ease: 'inOut' },
  ],
  cues: [
    { from: 0, to: 0.25, text: 'Fold forward, hands on the floor (or on a step).' },
    { from: 0.25, to: 0.5, text: 'Bend one knee, press the other heel down.' },
    { from: 0.5, to: 0.75, text: 'Switch sides slowly, like walking on the spot.' },
    { from: 0.75, to: 1, text: 'Let the head hang. Breathe out as each heel lowers.' },
  ],
  highlight: {
    joints: ['nearKnee', 'farKnee'],
    segments: ['nearShin', 'farShin'],
    label: 'Hamstrings and calves, one side at a time.',
  },
  contacts: ['nearToe', 'farToe', 'nearHand', 'farHand'],
};

export const ANIMATIONS: readonly ExerciseAnimation[] = [
  SQUAT,
  PUSH_UP,
  LUNGE,
  PLANK,
  GLUTE_BRIDGE,
  SINGLE_LEG_RDL,
  GOOD_MORNING,
  LEG_SWING,
  ELEPHANT_WALK,
];

export function animationFor(slug: string | null | undefined): ExerciseAnimation | null {
  if (!slug) return null;
  return ANIMATIONS.find((animation) => animation.slug === slug) ?? null;
}
