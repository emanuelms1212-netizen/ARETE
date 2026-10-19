import type { FlexMovement, FlexPrescription, FlexProgram } from '@/domain/flexibility';

/**
 * The four-week hamstring mobility programme.
 *
 * A sourced template. The session structure — which movements, on which day
 * of which week, with how many sets, reps or seconds — follows "Total
 * Hamstring Mobility 2.0" in `Total Flexibility - V2.pdf` (SOURCE_MAP §7).
 * The instructions are ARETE's own short summaries, written from the movement
 * rather than from the page; no sentence, photograph or illustration from the
 * source is reproduced, and the author's branding and promotions are not
 * carried. Names are normalised ("Crossbody" → "Cross-body").
 *
 * The product owner obtained the author's permission on 2026-10-19 (ledger
 * D85), so the programme ships with `rightsStatus: 'cleared'`. The rights
 * gate stays in place for any future programme whose rights are not settled.
 *
 * Where the source gives a range (the warm-up's 10–15 reps), ARETE uses the
 * bottom of it. Where it gives a number, ARETE keeps it, because those numbers
 * are already modest. Every movement has an easier version.
 */

const SHARP = 'Sharp, radiating (travelling down the leg) or worsening pain. Stop the session.';
const NUMB = 'Numbness or tingling in the leg or foot.';
const DIZZY = 'Dizziness when coming up from a fold — rise slowly, and sit if it continues.';

export const FLEX_MOVEMENTS: readonly FlexMovement[] = [
  // --- Warm-up --------------------------------------------------------------
  {
    slug: 'walking-lunge',
    name: 'Walking lunges',
    measure: 'reps',
    perSide: false,
    steps: [
      'Step forward into a short lunge, back knee lowering towards the floor.',
      'Push through the front foot and step the back foot through into the next lunge.',
      'Keep the steps short and the pace easy; this is a warm-up, not a workout.',
    ],
    cues: ['Short steps, upright trunk.', 'Front knee over the foot.'],
    mistakes: ['Lunging deep straight away.', 'Front knee drifting inwards.'],
    stopIf: [SHARP, 'Knee pain on the front leg.'],
    easier: {
      name: 'Stationary split squat, shallow',
      how: 'Stay in one place and lower only a little.',
    },
    animation: 'lunge',
    loads: ['knees', 'hips'],
    endRange: false,
  },
  {
    slug: 'leg-swing',
    name: 'Leg swings',
    measure: 'reps',
    perSide: true,
    steps: [
      'Hold a wall and stand tall on one leg.',
      'Swing the free leg forward and back, letting the range grow a little each time.',
      'Switch legs.',
    ],
    cues: ['Relaxed swing, not a kick.', 'Trunk stays still.'],
    mistakes: ['Forcing the top of the swing.', 'Arching the back on the back-swing.'],
    stopIf: [SHARP],
    easier: { name: 'Smaller swings', how: 'Keep the swing to a range that feels easy.' },
    animation: 'leg-swing',
    loads: ['hips', 'hamstrings'],
    endRange: false,
  },
  {
    slug: 'high-knees',
    name: 'High knees',
    measure: 'reps',
    perSide: false,
    steps: [
      'Stand tall and lift one knee towards hip height, then the other, in a light jog.',
      'Land softly on the balls of the feet.',
    ],
    cues: ['Light and quick.', 'Arms swing naturally.'],
    mistakes: ['Leaning back to get the knees higher.'],
    stopIf: [SHARP, 'Breathlessness that does not settle when you slow down.'],
    easier: {
      name: 'Marching knees',
      how: 'March on the spot, lifting each knee without the hop.',
    },
    animation: null,
    loads: ['hips', 'ankles', 'knees'],
    endRange: false,
  },
  {
    slug: 'jog-in-place',
    name: 'Jog in place',
    measure: 'time',
    perSide: false,
    steps: ['Jog gently on the spot.', 'Keep it easy enough to talk.'],
    cues: ['Soft landings.'],
    mistakes: ['Turning it into a sprint.'],
    stopIf: ['Breathlessness that does not settle when you slow down.', SHARP],
    easier: { name: 'Brisk march', how: 'March on the spot instead.' },
    animation: null,
    loads: ['ankles', 'knees'],
    endRange: false,
  },
  {
    slug: 'march-in-place',
    name: 'Brisk march in place',
    measure: 'time',
    perSide: false,
    steps: [
      'March on the spot, lifting each knee and swinging the arms.',
      'Keep it brisk but easy.',
    ],
    cues: ['Tall posture.'],
    mistakes: ['Shuffling rather than lifting the knees.'],
    stopIf: [SHARP],
    easier: { name: 'Slower march', how: 'Slow down and lower the knees.' },
    animation: null,
    loads: [],
    endRange: false,
  },

  // --- Main movements ----------------------------------------------------------
  {
    slug: 'hamstring-kicks',
    name: 'Hamstring kicks',
    measure: 'reps',
    perSide: true,
    steps: [
      'Stand tall with feet under the hips and one arm reaching forward at shoulder height.',
      'Swing the leg on that side up towards the hand, knee as straight as is comfortable, toes up.',
      'Lower it under control. Do the reps on one leg, then the other.',
    ],
    cues: ['Height comes gradually; the hand is a target, not a requirement.', 'Stay tall.'],
    mistakes: ['Rounding the back to meet the leg.', 'Kicking hard at the top.'],
    stopIf: [SHARP, NUMB],
    easier: { name: 'Bent-knee kicks', how: 'Let the knee bend a little and keep the swing low.' },
    animation: null,
    loads: ['hamstrings', 'hips'],
    endRange: false,
  },
  {
    slug: 'elephant-walk',
    name: 'Elephant walks',
    measure: 'reps',
    perSide: false,
    steps: [
      'Fold forward from the hips with hands on the floor, or on a low step if the floor is far.',
      'Bend one knee while the other straightens and its heel presses down.',
      'Alternate smoothly, like walking on the spot.',
    ],
    cues: ['Let the head hang.', 'Breathe out as each heel lowers.'],
    mistakes: ['Locking the knees hard.', 'Bouncing.'],
    stopIf: [SHARP, NUMB, DIZZY],
    easier: {
      name: 'Hands on a chair',
      how: 'Rest your hands on a chair seat so the fold is shallower.',
    },
    animation: 'elephant-walk',
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
  {
    slug: 'single-leg-rdl',
    name: 'Single-leg Romanian deadlift',
    measure: 'reps',
    perSide: true,
    steps: [
      'Stand on one leg with that knee soft; touch a wall if you need balance.',
      'Hinge forward with a long back as the free leg reaches behind you.',
      'Use the back of the standing leg to draw yourself up again.',
    ],
    cues: ['Trunk and free leg move as one.', 'Hips stay level.'],
    mistakes: ['Rounding to reach lower.', 'Opening the hip to the side.'],
    stopIf: [SHARP, NUMB],
    easier: { name: 'Kickstand RDL', how: 'Keep the back toe lightly on the floor for balance.' },
    animation: 'single-leg-rdl',
    loads: ['hamstrings', 'hips', 'ankles'],
    endRange: false,
  },
  {
    slug: 'good-morning',
    name: 'Good morning',
    measure: 'reps',
    perSide: false,
    steps: [
      'Stand with feet a little wider than the shoulders, hands on your hips or crossed on your chest.',
      'Push the hips back and let the chest tip forward with a long, flat back.',
      'Stop where the backs of the thighs feel taut, then stand tall.',
    ],
    cues: ['Hips back, not down.', 'Back stays long.'],
    mistakes: ['Turning it into a squat.', 'Rounding to go lower.'],
    stopIf: [SHARP, NUMB],
    easier: {
      name: 'Shorter range',
      how: 'Hinge only halfway, with the knees a little more bent.',
    },
    animation: 'good-morning',
    loads: ['hamstrings', 'hips', 'spine'],
    endRange: false,
  },
  {
    slug: 'toe-touch',
    name: 'Toe touch',
    measure: 'time',
    perSide: false,
    steps: [
      'Stand with feet close together.',
      'Hinge from the hips and let your hands travel down the legs towards the toes or the floor.',
      'Stop where it is comfortable and hold, breathing slowly.',
    ],
    cues: ['Wherever the hands reach is fine.', 'Soften the knees if the back of the knee pulls.'],
    mistakes: ['Bouncing to reach further.', 'Holding the breath.'],
    stopIf: [SHARP, NUMB, DIZZY],
    easier: {
      name: 'Hands on the thighs',
      how: 'Rest your hands on your thighs or shins and fold only partway.',
    },
    animation: 'toe-touch',
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
  {
    slug: 'single-leg-hamstring-stretch',
    name: 'Seated single-leg hamstring stretch',
    measure: 'time',
    perSide: true,
    steps: [
      'Sit with one leg straight in front and the other bent, its foot against the inside of the straight leg.',
      'Reach both hands along the straight leg towards its toes and hold.',
      'Switch sides.',
    ],
    cues: ['Lead with the chest, not the head.', 'Ease in; do not pull.'],
    mistakes: ['Rounding hard over the leg.', 'Locking the knee.'],
    stopIf: [SHARP, NUMB],
    easier: {
      name: 'Strap or towel',
      how: 'Loop a towel round the foot and hold it instead of reaching.',
    },
    animation: null,
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
  {
    slug: 'sit-and-reach-reps',
    name: 'Sit and reach (moving)',
    measure: 'reps',
    perSide: false,
    steps: [
      'Sit with both legs straight in front of you.',
      'Reach both hands forward towards or past the toes, then sit back up.',
      'Repeat smoothly; each reach can go a little further.',
    ],
    cues: ['Smooth, no bouncing.', 'Breathe out as you reach.'],
    mistakes: ['Jerking forward to gain range.'],
    stopIf: [SHARP, NUMB],
    easier: { name: 'Knees bent', how: 'Let the knees bend slightly and sit on a folded towel.' },
    animation: null,
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
  {
    slug: 'sit-and-reach-hold',
    name: 'Sit and reach (hold)',
    measure: 'time',
    perSide: false,
    steps: [
      'Sit with both legs straight in front of you.',
      'Reach forward as far as is comfortable and stay there, breathing slowly.',
    ],
    cues: ['Relax the shoulders.', 'Mild tension only.'],
    mistakes: ['Holding the breath.', 'Pulling on the feet.'],
    stopIf: [SHARP, NUMB],
    easier: { name: 'Knees bent', how: 'Let the knees bend slightly and sit on a folded towel.' },
    animation: null,
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
  {
    slug: 'flat-back-hamstring-stretch',
    name: 'Flat-back hamstring stretch',
    measure: 'time',
    perSide: false,
    steps: [
      'Stand with feet shoulder-width apart, hands on your hips.',
      'Hinge forward with a flat back and straight legs until the backs of the thighs feel taut.',
      'Hold there, keeping the back flat rather than folding further.',
    ],
    cues: ['A flat back matters more than depth.', 'Chest long.'],
    mistakes: ['Rounding to get lower.'],
    stopIf: [SHARP, NUMB],
    easier: {
      name: 'Hands on a wall',
      how: 'Rest your hands on a wall or chair back at hip height.',
    },
    animation: null,
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
  {
    slug: 'cross-body-leg-swing',
    name: 'Cross-body leg swings',
    measure: 'reps',
    perSide: true,
    steps: [
      'Hold a wall or chair for balance.',
      'Swing one leg across the front of your body and then out to the side.',
      'Let the range grow slowly, then switch legs.',
    ],
    cues: ['Keep the trunk facing forward.', 'Relaxed, not forced.'],
    mistakes: ['Twisting the whole body with the swing.'],
    stopIf: [SHARP],
    easier: { name: 'Smaller swings', how: 'Keep the swing small and slow.' },
    animation: null,
    loads: ['hips'],
    endRange: false,
  },
  {
    slug: 'standing-pancake',
    name: 'Standing pancake',
    measure: 'time',
    perSide: false,
    steps: [
      'Stand with the feet wide — wider than feels natural, but not as wide as possible.',
      'Push the hips back and hinge forward with a flat back.',
      'Rest the hands on the floor, a block or the thighs, and hold.',
    ],
    cues: ['Width you can control beats width you can reach.', 'Back flat.'],
    mistakes: ['Feet so wide the knees strain.', 'Rounding to reach the floor.'],
    stopIf: [SHARP, NUMB, 'Pain on the inside of the knee.', DIZZY],
    easier: {
      name: 'Narrower stance, hands on a chair',
      how: 'Bring the feet in and rest the hands on a chair seat.',
    },
    animation: null,
    loads: ['hamstrings', 'hips', 'spine', 'knees'],
    endRange: true,
  },
  {
    slug: 'pancake',
    name: 'Seated pancake',
    measure: 'time',
    perSide: false,
    steps: [
      'Sit with the legs wide apart, knees and toes pointing up.',
      'Lean forward from the hips with a long back and the chest open.',
      'Hold at a comfortable depth, breathing slowly.',
    ],
    cues: ['Tilt from the hips, not the upper back.', 'Sit on a cushion if the back rounds.'],
    mistakes: ['Forcing the chest towards the floor.', 'Letting the knees roll inwards.'],
    stopIf: [SHARP, NUMB, 'Pain in the groin or inner knee.'],
    easier: {
      name: 'Raised pancake',
      how: 'Sit on a cushion with the legs only moderately wide, hands behind you.',
    },
    animation: null,
    loads: ['hamstrings', 'hips', 'spine'],
    endRange: true,
  },
  {
    slug: 'hamstring-chokes',
    name: 'Hamstring chokes',
    measure: 'reps',
    perSide: true,
    steps: [
      'Sit or lie down and bring one knee towards your chest, hands holding behind the thigh.',
      'Keeping the thigh held, straighten the knee towards the ceiling as far as is comfortable.',
      'Bend it again and repeat; then switch legs.',
    ],
    cues: ['The thigh stays still; only the knee moves.', 'Slow both ways.'],
    mistakes: ['Yanking the leg towards you.', 'Snapping the knee straight.'],
    stopIf: [SHARP, NUMB],
    easier: {
      name: 'Thigh further away',
      how: 'Hold the thigh a little lower so the hip is less bent.',
    },
    animation: null,
    loads: ['hamstrings', 'hips'],
    endRange: false,
  },
  {
    slug: 'roll-down',
    name: 'Roll down',
    measure: 'reps',
    perSide: false,
    steps: [
      'Stand with feet hip-width apart, knees soft.',
      'Tuck the chin and roll the upper body forward a little at a time, towards the floor.',
      'Roll back up just as slowly, the head arriving last.',
    ],
    cues: ['Slow, one segment at a time.', 'Breathe throughout.'],
    mistakes: ['Dropping down quickly.', 'Standing up with a flat back instead of rolling.'],
    stopIf: [SHARP, NUMB, DIZZY, 'Any back pain — especially if you have a known disc problem.'],
    easier: {
      name: 'Half roll-down against a wall',
      how: 'Stand with your back to a wall and roll only partway.',
    },
    animation: null,
    loads: ['spine', 'hamstrings'],
    endRange: true,
  },
  {
    slug: 'standing-pancake-good-morning',
    name: 'Standing pancake good morning',
    measure: 'reps',
    perSide: false,
    steps: [
      'Stand with the feet wider than the shoulders, toes turned slightly out.',
      'Hands behind the head or on the hips, hinge forward with a flat back and open chest.',
      'Come back up by driving the hips forward.',
    ],
    cues: ['Elbows wide if the hands are behind the head.', 'Hips back.'],
    mistakes: ['Pulling on the neck.', 'Rounding at the bottom.'],
    stopIf: [SHARP, NUMB, 'Pain on the inside of the knee.'],
    easier: {
      name: 'Hands on hips, shorter range',
      how: 'Keep the hands on the hips and hinge only halfway.',
    },
    animation: null,
    loads: ['hamstrings', 'hips', 'spine'],
    endRange: true,
  },
  {
    slug: 'cross-body-hamstring-stretch',
    name: 'Cross-body hamstring stretch',
    measure: 'time',
    perSide: true,
    steps: [
      'Standing, cross one leg behind the other and keep that back leg straight.',
      'Bend the front knee slightly and reach down towards the toes of the back leg.',
      'Hold, then switch sides.',
    ],
    cues: ['The straight leg does the stretching.', 'Use a wall for balance if needed.'],
    mistakes: ['Locking the front knee.', 'Twisting through the back to reach.'],
    stopIf: [SHARP, NUMB, DIZZY],
    easier: { name: 'Hands on the thigh', how: 'Reach only to the thigh or shin of the back leg.' },
    animation: null,
    loads: ['hamstrings', 'spine'],
    endRange: false,
  },
];

const reps = (movementSlug: string, sets: number, count: number): FlexPrescription => ({
  movementSlug,
  sets,
  reps: count,
  seconds: null,
});
const hold = (movementSlug: string, sets: number, seconds: number): FlexPrescription => ({
  movementSlug,
  sets,
  reps: null,
  seconds,
});

// The source's sessions, by name, so the weeks below read like its table.
const A = [reps('hamstring-kicks', 1, 15), reps('single-leg-rdl', 1, 10), hold('toe-touch', 2, 30)];
const B = [
  reps('elephant-walk', 1, 30),
  reps('good-morning', 1, 10),
  hold('single-leg-hamstring-stretch', 2, 30),
];
const C = [
  reps('sit-and-reach-reps', 1, 10),
  hold('sit-and-reach-hold', 1, 30),
  hold('flat-back-hamstring-stretch', 2, 30),
];
const D = [
  reps('cross-body-leg-swing', 1, 15),
  hold('standing-pancake', 1, 30),
  hold('pancake', 2, 30),
];
const E = [
  reps('standing-pancake-good-morning', 1, 10),
  reps('hamstring-chokes', 1, 15),
  hold('toe-touch', 2, 30),
];
const F = [
  reps('roll-down', 1, 10),
  reps('standing-pancake-good-morning', 1, 10),
  hold('cross-body-hamstring-stretch', 2, 30),
];

export const HAMSTRING_PROGRAM: FlexProgram = {
  slug: 'hamstring-mobility',
  title: 'Hamstring mobility — four weeks',
  summary:
    'Three short sessions a week for four weeks, from leg swings and hinges to wide-stance folds. Any three days; any order within a week.',
  region: 'hamstrings',
  weeks: 4,
  sessionsPerWeek: 3,
  minutes: 15,
  warmup: [
    reps('walking-lunge', 2, 10),
    reps('leg-swing', 2, 10),
    reps('high-knees', 2, 10),
    hold('jog-in-place', 2, 30),
  ],
  noImpactWarmup: [
    reps('walking-lunge', 2, 10),
    reps('leg-swing', 2, 10),
    hold('march-in-place', 2, 45),
  ],
  sessions: [
    { week: 1, day: 1, items: A },
    { week: 1, day: 2, items: B },
    { week: 1, day: 3, items: A },
    { week: 2, day: 1, items: B },
    { week: 2, day: 2, items: C },
    { week: 2, day: 3, items: D },
    { week: 3, day: 1, items: C },
    { week: 3, day: 2, items: D },
    { week: 3, day: 3, items: E },
    { week: 4, day: 1, items: F },
    { week: 4, day: 2, items: E },
    { week: 4, day: 3, items: F },
  ],
  maintenance: [
    'Early gains in range are mostly your nervous system tolerating more stretch; they fade without practice.',
    'To keep what you have, carry on with two or three sessions a week, picking any from weeks three and four.',
    'You can also do a session straight after a workout, when you are already warm.',
    'Or start the four weeks again; the second time through usually feels different.',
  ],
  provenance: {
    sourceSlug: 'total-flexibility',
    filename: 'Total Flexibility - V2.pdf',
    note: 'Session structure (movements, sets, reps and holds) follows the four-week hamstring programme in "Total Hamstring Mobility 2.0", part of Total Flexibility V2. Used with the author’s permission. Instructions are ARETE’s own summaries; no text or images from the source are reproduced.',
  },
  rightsStatus: 'cleared',
};

export const FLEX_PROGRAMS: readonly FlexProgram[] = [HAMSTRING_PROGRAM];

export function flexMovement(slug: string): FlexMovement | null {
  return FLEX_MOVEMENTS.find((movement) => movement.slug === slug) ?? null;
}

export function flexProgram(slug: string): FlexProgram | null {
  return FLEX_PROGRAMS.find((program) => program.slug === slug) ?? null;
}
