/**
 * What to do when something feels wrong, written once and shown wherever it
 * applies.
 *
 * Every module that asks the body or the mind for effort has a visible way
 * out, and the way out says the same thing everywhere: stop, do the simple
 * safe thing, and get help when the signs call for it. None of it diagnoses,
 * and none of it is hidden behind a link. Crisis lines are named only where
 * the details are stable and widely published.
 */
export const STOP_SITUATIONS = [
  'pain',
  'dizzy',
  'chest',
  'overheating',
  'too_cold',
  'distress',
  'food_distress',
] as const;
export type StopSituation = (typeof STOP_SITUATIONS)[number];

export interface StopGuidance {
  readonly title: string;
  readonly body: string;
}

export const STOP_GUIDANCE: Record<StopSituation, StopGuidance> = {
  pain: {
    title: 'Sharp, radiating or worsening pain',
    body: 'Stop the movement. Mild effort or stretch is expected; pain that is sharp, travels, or builds is not something to push through. If it does not settle, see a physiotherapist or doctor.',
  },
  dizzy: {
    title: 'Dizzy, faint or light-headed',
    body: 'Stop and sit or lie down somewhere safe. Breathe normally and sip water. Do not drive until it has passed. If it keeps happening, mention it to a doctor.',
  },
  chest: {
    title: 'Chest pain, or trouble breathing',
    body: 'Stop now and call your local emergency number. Do not wait to see whether it passes.',
  },
  overheating: {
    title: 'Too hot, nauseous or confused',
    body: 'Stop and move somewhere cool. Sip water and rest. Confusion, vomiting or fainting in the heat needs medical help straight away.',
  },
  too_cold: {
    title: 'Too cold, numb or shivering hard',
    body: 'Stop and warm up gradually with dry clothes and a warm room — not a hot shower straight away. Numbness that does not come back, or confusion, needs medical help.',
  },
  distress: {
    title: 'Feeling overwhelmed or distressed',
    body: 'You can stop at any point; nothing is lost. Open your eyes, notice what is around you, and breathe normally. If you are thinking about harming yourself, call your local emergency number — in the US you can call or text 988 — or talk to someone you trust.',
  },
  food_distress: {
    title: 'Food, weight or numbers feel stressful',
    body: 'You can hide every number and log meals without them, or stop logging altogether. If food or weight is becoming a source of distress, a doctor or an eating-disorder support service can help — in the US, the National Alliance for Eating Disorders.',
  },
};

/** Which ways out each module shows. The prompt's list is the floor, not the ceiling. */
export const STOP_PATHS = {
  workout: ['pain', 'dizzy', 'chest'],
  flexibility: ['pain', 'dizzy'],
  breathwork: ['dizzy', 'distress'],
  meditation: ['distress'],
  journal: ['distress'],
  food: ['food_distress'],
  contrast: ['dizzy', 'chest', 'overheating', 'too_cold'],
  cold: ['too_cold', 'dizzy', 'chest'],
} as const satisfies Record<string, readonly StopSituation[]>;
export type StopModule = keyof typeof STOP_PATHS;

export function stopGuidanceFor(module: StopModule): readonly StopGuidance[] {
  return STOP_PATHS[module].map((situation) => STOP_GUIDANCE[situation]);
}
