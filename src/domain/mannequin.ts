/**
 * The articulated mannequin: a small, honest model of a body.
 *
 * An exercise animation in ARETE is data — keyframes of joint angles and a few
 * positions — evaluated through this file into points that an SVG draws. There
 * are no videos, no traced photographs and no decorative GIFs. The point of
 * keeping it this plain is that every frame can be checked: a test can ask
 * whether the heel left the floor in a squat, or whether the hips sagged in a
 * push-up, and fail the build if they did. Accuracy matters more than realism.
 *
 * ## Coordinates
 *
 * World units are roughly centimetres for a 175 cm figure. `y` is up and the
 * floor is `y = 0`. In the side view the figure faces `+x`.
 *
 * ## Angles
 *
 * Keyframes store anatomical, *relative* angles in degrees — hip flexion, knee
 * flexion — because those are what a coach talks about and what a test can
 * hold to a range. Internally each segment gets an absolute direction θ,
 * measured from straight down with forward positive, so a direction is
 * `(sin θ, −cos θ)`.
 *
 * ## Contacts
 *
 * A foot planted on the floor is not something angle interpolation keeps
 * planted. So a limb can be *pinned*: its end is held at a target and the two
 * bones are solved by inverse kinematics, with a stated bend direction. The
 * pelvis is the root and is positioned explicitly. Everything else is forward
 * kinematics from there.
 */

export type Vec = { readonly x: number; readonly y: number };

/** Segment lengths, in world units, for a 175 cm figure. */
export const BODY = {
  trunk: 50,
  neck: 19,
  headRadius: 10,
  upperArm: 31,
  forearm: 26,
  hand: 8,
  thigh: 43,
  shin: 43,
  /** Ankle joint height above the sole. */
  ankleHeight: 7,
  heel: 5,
  toe: 20,
  /** Half-widths for the front view. */
  hipHalf: 9,
  shoulderHalf: 19,
} as const;

export type Limb = 'nearArm' | 'farArm' | 'nearLeg' | 'farLeg';
export const LIMBS: readonly Limb[] = ['nearArm', 'farArm', 'nearLeg', 'farLeg'];

export type JointName =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'pelvis'
  | 'nearElbow'
  | 'nearWrist'
  | 'nearHand'
  | 'farElbow'
  | 'farWrist'
  | 'farHand'
  | 'nearKnee'
  | 'nearAnkle'
  | 'nearHeel'
  | 'nearToe'
  | 'farKnee'
  | 'farAnkle'
  | 'farHeel'
  | 'farToe';

export type SegmentName =
  | 'trunk'
  | 'neck'
  | 'nearUpperArm'
  | 'nearForearm'
  | 'farUpperArm'
  | 'farForearm'
  | 'nearThigh'
  | 'nearShin'
  | 'nearFoot'
  | 'farThigh'
  | 'farShin'
  | 'farFoot';

/** Bones, as pairs of joints, in drawing order (far side first, so it sits behind). */
export const SEGMENTS: readonly { name: SegmentName; from: JointName; to: JointName }[] = [
  { name: 'farThigh', from: 'pelvis', to: 'farKnee' },
  { name: 'farShin', from: 'farKnee', to: 'farAnkle' },
  { name: 'farFoot', from: 'farHeel', to: 'farToe' },
  { name: 'farUpperArm', from: 'shoulder', to: 'farElbow' },
  { name: 'farForearm', from: 'farElbow', to: 'farHand' },
  { name: 'trunk', from: 'pelvis', to: 'shoulder' },
  { name: 'neck', from: 'shoulder', to: 'neck' },
  { name: 'nearThigh', from: 'pelvis', to: 'nearKnee' },
  { name: 'nearShin', from: 'nearKnee', to: 'nearAnkle' },
  { name: 'nearFoot', from: 'nearHeel', to: 'nearToe' },
  { name: 'nearUpperArm', from: 'shoulder', to: 'nearElbow' },
  { name: 'nearForearm', from: 'nearElbow', to: 'nearHand' },
];

export interface ArmAngles {
  /** Shoulder flexion relative to the trunk. 0 = arm along the trunk; 90 = arm forward. */
  readonly shoulder: number;
  /** Elbow flexion, 0 = straight. */
  readonly elbow: number;
}

export interface LegAngles {
  /** Hip flexion relative to the trunk. 0 = thigh in line with the trunk. */
  readonly hip: number;
  /** Knee flexion, 0 = straight. */
  readonly knee: number;
  /** Ankle dorsiflexion relative to the shin. 0 = foot at a right angle to the shin. */
  readonly ankle: number;
}

/**
 * One pose. Angles for the limbs that move freely; positions for the root and
 * for the ends of limbs that are pinned. A pinned limb's angles are ignored —
 * the solver supplies them — so they may be omitted.
 */
export interface Pose {
  /** Hip-joint centre. The root of everything else. */
  readonly pelvis: Vec;
  /** Trunk lean from vertical, forward positive. 90 = horizontal, face down. */
  readonly trunk: number;
  /** Neck flexion relative to the trunk. */
  readonly neck: number;
  readonly nearArm?: ArmAngles;
  readonly farArm?: ArmAngles;
  readonly nearLeg?: LegAngles;
  readonly farLeg?: LegAngles;
  /** Pinned ends: the toe for a leg, the wrist for an arm. */
  readonly pins?: Partial<Record<Limb, Vec>>;
  /**
   * Absolute rotation of a pinned foot from flat, toe-up positive. 0 = flat on
   * the floor; negative = heel lifted.
   */
  readonly feet?: { readonly near?: number; readonly far?: number };
}

export type Easing = 'linear' | 'in' | 'out' | 'inOut';

export interface Keyframe {
  /** Position in the cycle, 0 to 1. */
  readonly at: number;
  readonly pose: Pose;
  /** Easing used to arrive at this keyframe from the previous one. */
  readonly ease?: Easing;
}

export interface Cue {
  /** Cycle positions, 0 to 1, during which the caption shows. */
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

export type MannequinView = 'side' | 'front';

export interface FrontViewSpec {
  /** Half the distance between the feet. */
  readonly stanceHalf: number;
  /** How far the knees sit outside the hip–ankle line per 90° of knee flexion. */
  readonly kneeOut: number;
}

export interface ExerciseAnimation {
  readonly slug: string;
  readonly title: string;
  readonly views: readonly MannequinView[];
  /** One full cycle at 1x. */
  readonly durationMs: number;
  /** The part of the cycle that repeats. Usually the whole of it. */
  readonly loop: { readonly from: number; readonly to: number };
  /** How each pinned limb bends: +1 = joint forward of the line, −1 = behind it. */
  readonly pinned: Partial<Record<Limb, 1 | -1>>;
  readonly keyframes: readonly Keyframe[];
  readonly cues: readonly Cue[];
  readonly highlight: {
    readonly joints: readonly JointName[];
    readonly segments: readonly SegmentName[];
    /** In words, for the caption and for anyone who cannot see the colour. */
    readonly label: string;
  };
  readonly front?: FrontViewSpec;
  /** Joints that touch the floor throughout. Checked by the validator. */
  readonly contacts: readonly JointName[];
}

export type Frame = Readonly<Record<JointName, Vec>>;

export interface SolvedFrame {
  readonly points: Frame;
  /** Absolute segment directions, for the validator. */
  readonly angles: {
    readonly trunk: number;
    readonly nearHip: number;
    readonly farHip: number;
    readonly nearKnee: number;
    readonly farKnee: number;
    readonly nearElbow: number;
    readonly farElbow: number;
  };
  /** Distance by which a pin could not be reached. Zero when every pin is met. */
  readonly reachError: number;
}

// ---------------------------------------------------------------------------
// Small vector helpers
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** Unit direction for an absolute angle θ (from straight down, forward positive). */
export function dir(theta: number): Vec {
  return { x: Math.sin(theta * RAD), y: -Math.cos(theta * RAD) };
}

function add(a: Vec, b: Vec, scale = 1): Vec {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale };
}

function rotate(v: Vec, degrees: number): Vec {
  const c = Math.cos(degrees * RAD);
  const s = Math.sin(degrees * RAD);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** The absolute angle θ of the vector from `a` to `b`. */
export function thetaOf(a: Vec, b: Vec): number {
  return Math.atan2(b.x - a.x, -(b.y - a.y)) / RAD;
}

/** An angle difference folded into (−180, 180]. */
export function wrap(degrees: number): number {
  let d = degrees % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ---------------------------------------------------------------------------
// Easing and interpolation
// ---------------------------------------------------------------------------

export function ease(kind: Easing, u: number): number {
  const t = Math.min(1, Math.max(0, u));
  switch (kind) {
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'inOut':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

function lerpOptional<T>(
  a: T | undefined,
  b: T | undefined,
  mix: (a: T, b: T) => T,
): T | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return mix(a, b);
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const arm = (x: ArmAngles, y: ArmAngles): ArmAngles => ({
    shoulder: lerp(x.shoulder, y.shoulder, t),
    elbow: lerp(x.elbow, y.elbow, t),
  });
  const leg = (x: LegAngles, y: LegAngles): LegAngles => ({
    hip: lerp(x.hip, y.hip, t),
    knee: lerp(x.knee, y.knee, t),
    ankle: lerp(x.ankle, y.ankle, t),
  });

  const pins: Partial<Record<Limb, Vec>> = {};
  for (const limb of LIMBS) {
    const mixed = lerpOptional(a.pins?.[limb], b.pins?.[limb], (p, q) => lerpVec(p, q, t));
    if (mixed) pins[limb] = mixed;
  }

  const nearArm = lerpOptional(a.nearArm, b.nearArm, arm);
  const farArm = lerpOptional(a.farArm, b.farArm, arm);
  const nearLeg = lerpOptional(a.nearLeg, b.nearLeg, leg);
  const farLeg = lerpOptional(a.farLeg, b.farLeg, leg);

  return {
    pelvis: lerpVec(a.pelvis, b.pelvis, t),
    trunk: lerp(a.trunk, b.trunk, t),
    neck: lerp(a.neck, b.neck, t),
    ...(nearArm ? { nearArm } : {}),
    ...(farArm ? { farArm } : {}),
    ...(nearLeg ? { nearLeg } : {}),
    ...(farLeg ? { farLeg } : {}),
    pins,
    feet: {
      near: lerp(a.feet?.near ?? 0, b.feet?.near ?? 0, t),
      far: lerp(a.feet?.far ?? 0, b.feet?.far ?? 0, t),
    },
  };
}

/**
 * The pose at cycle position `phase` (0 to 1). Keyframes are assumed sorted by
 * `at`, starting at 0 and ending at 1; the validator checks that.
 */
export function poseAt(animation: ExerciseAnimation, phase: number): Pose {
  const frames = animation.keyframes;
  const first = frames[0];
  if (!first) throw new Error(`${animation.slug} has no keyframes`);
  const p = Math.min(1, Math.max(0, phase));

  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index]!;
    const previous = frames[index - 1]!;
    if (p <= next.at) {
      const span = next.at - previous.at;
      const u = span <= 0 ? 1 : (p - previous.at) / span;
      return lerpPose(previous.pose, next.pose, ease(next.ease ?? 'inOut', u));
    }
  }
  return frames[frames.length - 1]!.pose;
}

/**
 * Maps elapsed time onto the cycle, honouring the loop points: the first pass
 * plays from 0, and every later pass replays only `loop.from`..`loop.to`.
 */
export function phaseAt(animation: ExerciseAnimation, elapsedMs: number): number {
  const { durationMs, loop } = animation;
  const t = Math.max(0, elapsedMs) / durationMs;
  if (t <= loop.to) return t;
  const span = loop.to - loop.from;
  if (span <= 0) return loop.to;
  // Divided rather than `%`, and nudged, so that exactly one span later lands
  // on `from` instead of a floating-point hair short of `to`.
  const cycles = (t - loop.to) / span;
  const fraction = Math.max(0, cycles - Math.floor(cycles + 1e-9));
  return loop.from + fraction * span;
}

// ---------------------------------------------------------------------------
// Kinematics
// ---------------------------------------------------------------------------

/**
 * Two-bone inverse kinematics.
 *
 * Returns the absolute angle of the first bone and the middle joint. `bend`
 * picks which of the two mirror solutions: +1 puts the joint forward of the
 * root→target line (a knee), −1 behind it (an elbow in a push-up).
 */
export function solveTwoBone(
  root: Vec,
  target: Vec,
  first: number,
  second: number,
  bend: 1 | -1,
): { theta: number; middle: Vec; end: Vec; reachError: number } {
  const raw = distance(root, target);
  const max = first + second - 1e-6;
  const min = Math.abs(first - second) + 1e-6;
  const d = Math.min(max, Math.max(min, raw));
  const reachError = Math.max(0, raw - max, min - raw);
  const base = thetaOf(root, target);
  const cos = (first * first + d * d - second * second) / (2 * first * d);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cos))) / RAD;
  const theta = base + bend * alpha;
  const middle = add(root, dir(theta), first);
  const end = add(middle, dir(thetaOf(middle, target)), second);
  return { theta, middle, end, reachError };
}

function footPoints(ankle: Vec, rotation: number): { heel: Vec; toe: Vec } {
  return {
    heel: add(ankle, rotate({ x: -BODY.heel, y: -BODY.ankleHeight }, rotation)),
    toe: add(ankle, rotate({ x: BODY.toe, y: -BODY.ankleHeight }, rotation)),
  };
}

/** Where the ankle must be for a foot at `rotation` to have its toe at `toe`. */
export function ankleForToe(toe: Vec, rotation: number): Vec {
  const offset = rotate({ x: BODY.toe, y: -BODY.ankleHeight }, rotation);
  return { x: toe.x - offset.x, y: toe.y - offset.y };
}

const STRAIGHT_LEG: LegAngles = { hip: 0, knee: 0, ankle: 0 };
const HANGING_ARM: ArmAngles = { shoulder: 0, elbow: 0 };

/**
 * Solves one pose into joint positions, side view.
 */
export function solvePose(pose: Pose, pinned: Partial<Record<Limb, 1 | -1>>): SolvedFrame {
  const { pelvis, trunk } = pose;
  const shoulder = add(pelvis, { x: Math.sin(trunk * RAD), y: Math.cos(trunk * RAD) }, BODY.trunk);
  const neckDirection = {
    x: Math.sin((trunk + pose.neck) * RAD),
    y: Math.cos((trunk + pose.neck) * RAD),
  };
  const neck = add(shoulder, neckDirection, BODY.neck - BODY.headRadius - 1);
  const head = add(shoulder, neckDirection, BODY.neck);
  let reachError = 0;

  const arm = (side: 'near' | 'far') => {
    const limb: Limb = side === 'near' ? 'nearArm' : 'farArm';
    const target = pose.pins?.[limb];
    const bend = pinned[limb];
    if (target && bend !== undefined) {
      const solved = solveTwoBone(shoulder, target, BODY.upperArm, BODY.forearm, bend);
      reachError = Math.max(reachError, solved.reachError);
      const forearmTheta = thetaOf(solved.middle, solved.end);
      return {
        elbow: solved.middle,
        wrist: solved.end,
        // A pinned hand is a hand on the floor: palm flat, fingers forward.
        hand: add(solved.end, { x: BODY.hand, y: 0 }),
        elbowFlexion: wrap(forearmTheta - solved.theta),
      };
    }
    const angles = (side === 'near' ? pose.nearArm : pose.farArm) ?? HANGING_ARM;
    const upper = angles.shoulder - trunk;
    const lower = upper + angles.elbow;
    const elbow = add(shoulder, dir(upper), BODY.upperArm);
    const wrist = add(elbow, dir(lower), BODY.forearm);
    return { elbow, wrist, hand: add(wrist, dir(lower), BODY.hand), elbowFlexion: angles.elbow };
  };

  const leg = (side: 'near' | 'far') => {
    const limb: Limb = side === 'near' ? 'nearLeg' : 'farLeg';
    const toeTarget = pose.pins?.[limb];
    const bend = pinned[limb];
    if (toeTarget && bend !== undefined) {
      const rotation = (side === 'near' ? pose.feet?.near : pose.feet?.far) ?? 0;
      const ankleTarget = ankleForToe(toeTarget, rotation);
      const solved = solveTwoBone(pelvis, ankleTarget, BODY.thigh, BODY.shin, bend);
      reachError = Math.max(reachError, solved.reachError);
      const shinTheta = thetaOf(solved.middle, solved.end);
      const foot = footPoints(solved.end, rotation);
      return {
        knee: solved.middle,
        ankle: solved.end,
        ...foot,
        hip: wrap(solved.theta + trunk),
        kneeFlexion: wrap(solved.theta - shinTheta),
      };
    }
    const angles = (side === 'near' ? pose.nearLeg : pose.farLeg) ?? STRAIGHT_LEG;
    const thigh = angles.hip - trunk;
    const shin = thigh - angles.knee;
    const knee = add(pelvis, dir(thigh), BODY.thigh);
    const ankle = add(knee, dir(shin), BODY.shin);
    // Foot rotation from flat. With the shin vertical, dorsiflexion lifts the
    // toe; with the shin tilted forward, the same dorsiflexion keeps it flat.
    const foot = footPoints(ankle, shin + angles.ankle);
    return { knee, ankle, ...foot, hip: angles.hip, kneeFlexion: angles.knee };
  };

  const nearArm = arm('near');
  const farArm = arm('far');
  const nearLeg = leg('near');
  const farLeg = leg('far');

  return {
    points: {
      head,
      neck,
      shoulder,
      pelvis,
      nearElbow: nearArm.elbow,
      nearWrist: nearArm.wrist,
      nearHand: nearArm.hand,
      farElbow: farArm.elbow,
      farWrist: farArm.wrist,
      farHand: farArm.hand,
      nearKnee: nearLeg.knee,
      nearAnkle: nearLeg.ankle,
      nearHeel: nearLeg.heel,
      nearToe: nearLeg.toe,
      farKnee: farLeg.knee,
      farAnkle: farLeg.ankle,
      farHeel: farLeg.heel,
      farToe: farLeg.toe,
    },
    angles: {
      trunk,
      nearHip: nearLeg.hip,
      farHip: farLeg.hip,
      nearKnee: nearLeg.kneeFlexion,
      farKnee: farLeg.kneeFlexion,
      nearElbow: nearArm.elbowFlexion,
      farElbow: farArm.elbowFlexion,
    },
    reachError,
  };
}

/**
 * Projects a solved side-view frame to the front view.
 *
 * The side view knows height and depth; the front view needs height and
 * width. Heights carry over exactly, which is what makes the two views agree
 * — a squat is as deep from the front as it is from the side. Widths come
 * from the body's proportions and the animation's stance, with the knee set
 * outside the hip–ankle line in proportion to how bent it is, which is the
 * "knees track over the toes" cue drawn rather than said.
 */
export function projectFront(frame: SolvedFrame, spec: FrontViewSpec): Frame {
  const p = frame.points;
  const side = (sign: 1 | -1, which: 'near' | 'far') => {
    const hipZ = sign * BODY.hipHalf;
    const ankleZ = sign * spec.stanceHalf;
    const flexion = which === 'near' ? frame.angles.nearKnee : frame.angles.farKnee;
    const kneeZ =
      hipZ +
      (ankleZ - hipZ) * (BODY.thigh / (BODY.thigh + BODY.shin)) +
      sign * spec.kneeOut * (Math.max(0, flexion) / 90);
    const shoulderZ = sign * BODY.shoulderHalf;
    const prefix = which;
    return {
      [`${prefix}Knee`]: { x: kneeZ, y: p[`${prefix}Knee`].y },
      [`${prefix}Ankle`]: { x: ankleZ, y: p[`${prefix}Ankle`].y },
      [`${prefix}Heel`]: { x: ankleZ, y: p[`${prefix}Heel`].y },
      [`${prefix}Toe`]: { x: ankleZ + sign * 3, y: p[`${prefix}Toe`].y },
      [`${prefix}Elbow`]: { x: shoulderZ * 1.08, y: p[`${prefix}Elbow`].y },
      [`${prefix}Wrist`]: { x: shoulderZ * 0.9, y: p[`${prefix}Wrist`].y },
      [`${prefix}Hand`]: { x: shoulderZ * 0.85, y: p[`${prefix}Hand`].y },
    } as Partial<Record<JointName, Vec>>;
  };

  return {
    head: { x: 0, y: p.head.y },
    neck: { x: 0, y: p.neck.y },
    shoulder: { x: 0, y: p.shoulder.y },
    pelvis: { x: 0, y: p.pelvis.y },
    ...side(1, 'near'),
    ...side(-1, 'far'),
  } as Frame;
}

/** Solved frame at a phase, in the requested view. */
export function frameAt(
  animation: ExerciseAnimation,
  phase: number,
  view: MannequinView = 'side',
): Frame {
  const solved = solvePose(poseAt(animation, phase), animation.pinned);
  if (view === 'front' && animation.front) return projectFront(solved, animation.front);
  return solved.points;
}

/** The front view draws shoulders and hips as bars rather than single points. */
export function frontGirdles(frame: Frame): { shoulders: [Vec, Vec]; hips: [Vec, Vec] } {
  return {
    shoulders: [
      { x: -BODY.shoulderHalf, y: frame.shoulder.y },
      { x: BODY.shoulderHalf, y: frame.shoulder.y },
    ],
    hips: [
      { x: -BODY.hipHalf, y: frame.pelvis.y },
      { x: BODY.hipHalf, y: frame.pelvis.y },
    ],
  };
}

/** The caption showing at a phase, if any. */
export function cueAt(animation: ExerciseAnimation, phase: number): Cue | null {
  return animation.cues.find((cue) => phase >= cue.from && phase <= cue.to) ?? null;
}

/**
 * A bounding box over the whole cycle, so the drawing does not rescale from
 * frame to frame. Sampled rather than derived: it is computed once per view.
 */
export function boundsOf(
  animation: ExerciseAnimation,
  view: MannequinView,
  samples = 48,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = 0;
  let maxY = -Infinity;
  for (let index = 0; index <= samples; index += 1) {
    const frame = frameAt(animation, index / samples, view);
    for (const point of Object.values(frame)) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  const pad = BODY.headRadius + 6;
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - 4, maxY: maxY + pad };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** How close to the floor a contact must stay, in world units (about 2 cm). */
export const CONTACT_TOLERANCE = 2;

export interface AnimationProblem {
  readonly phase: number;
  readonly problem: string;
}

/**
 * Ranges a healthy adult moves within. A frame outside them is a drawing error.
 *
 * `hip` is the trunk–thigh angle, not hip flexion alone: the trunk is one
 * rigid segment, so in a forward fold it carries the spine's share of the
 * bend as well as the hip's. That is why its upper limit is far above the
 * hip joint's own range.
 */
export const JOINT_LIMITS = {
  knee: [-2, 150],
  elbow: [-2, 155],
  hip: [-35, 175],
} as const;

/**
 * The checks every animation must pass, whatever the exercise:
 *
 *   * keyframes run from 0 to 1 in order, loop points sit inside them, and
 *     every caption has words;
 *   * every pin is reachable — a limb is never stretched to meet the floor;
 *   * every joint stays within an anatomical range;
 *   * nothing goes through the floor, and every declared contact stays on it.
 *
 * Exercise-specific checks (the heel stays down, the hips do not sag) live in
 * the tests beside each animation, because they are about the movement rather
 * than about drawing.
 */
export function validateAnimation(animation: ExerciseAnimation, samples = 120): AnimationProblem[] {
  const problems: AnimationProblem[] = [];
  const frames = animation.keyframes;

  if (frames.length < 2) problems.push({ phase: 0, problem: 'needs at least two keyframes' });
  if (frames[0]?.at !== 0) problems.push({ phase: 0, problem: 'first keyframe must be at 0' });
  if (frames[frames.length - 1]?.at !== 1)
    problems.push({ phase: 1, problem: 'last keyframe must be at 1' });
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index]!.at < frames[index - 1]!.at) {
      problems.push({ phase: frames[index]!.at, problem: 'keyframes out of order' });
    }
  }
  const { loop } = animation;
  if (!(loop.from >= 0 && loop.to <= 1 && loop.from < loop.to)) {
    problems.push({ phase: loop.from, problem: 'loop points must satisfy 0 ≤ from < to ≤ 1' });
  }
  if (animation.durationMs < 1000 || animation.durationMs > 12_000) {
    problems.push({ phase: 0, problem: 'a cycle should last between 1 and 12 seconds' });
  }
  if (animation.cues.length === 0 || animation.cues.some((cue) => cue.text.trim().length === 0)) {
    problems.push({ phase: 0, problem: 'every animation needs captioned steps' });
  }
  if (animation.views.includes('front') && !animation.front) {
    problems.push({ phase: 0, problem: 'front view offered without a front-view spec' });
  }

  for (let index = 0; index <= samples; index += 1) {
    const phase = index / samples;
    const solved = solvePose(poseAt(animation, phase), animation.pinned);
    const { angles, points } = solved;

    if (solved.reachError > 0.75) {
      problems.push({
        phase,
        problem: `a pinned limb is stretched by ${solved.reachError.toFixed(2)}`,
      });
    }
    for (const knee of [angles.nearKnee, angles.farKnee]) {
      if (knee < JOINT_LIMITS.knee[0] || knee > JOINT_LIMITS.knee[1]) {
        problems.push({ phase, problem: `knee flexion ${knee.toFixed(1)}° out of range` });
      }
    }
    for (const elbow of [angles.nearElbow, angles.farElbow]) {
      if (elbow < JOINT_LIMITS.elbow[0] || elbow > JOINT_LIMITS.elbow[1]) {
        problems.push({ phase, problem: `elbow flexion ${elbow.toFixed(1)}° out of range` });
      }
    }
    for (const hip of [angles.nearHip, angles.farHip]) {
      if (hip < JOINT_LIMITS.hip[0] || hip > JOINT_LIMITS.hip[1]) {
        problems.push({ phase, problem: `hip flexion ${hip.toFixed(1)}° out of range` });
      }
    }
    for (const [name, point] of Object.entries(points)) {
      const floor = name === 'head' ? BODY.headRadius : 0;
      if (point.y < floor - 0.75) {
        problems.push({ phase, problem: `${name} is below the floor (${point.y.toFixed(2)})` });
      }
    }
    for (const contact of animation.contacts) {
      const y = points[contact].y;
      if (Math.abs(y) > CONTACT_TOLERANCE) {
        problems.push({ phase, problem: `${contact} lifts off the floor (${y.toFixed(2)})` });
      }
    }
  }

  return problems;
}
