/**
 * The design tokens, as data.
 *
 * This file is the single source of truth. `src/app/globals.css` declares the
 * same values as CSS custom properties, and `tokens.test.ts` parses that file
 * and fails if the two ever disagree — so the documentation, the tests and the
 * rendered app cannot drift apart.
 *
 * Direction (PRODUCT_SPEC §14, stage 3 brief): quiet Stoic modernism. Ink and
 * charcoal, warm parchment, restrained bronze, stone grey, one calm success
 * colour. Restraint is the brief — one accent, low chroma, no gradients, no
 * decorative shadow, no gold.
 */

export type ThemeName = 'light' | 'dark';

export interface Palette {
  /** Page background. Warm parchment in light, deep ink in dark. */
  readonly canvas: string;
  /** Raised surfaces: cards, sheets, the header. */
  readonly surface: string;
  /** Recessed surfaces: wells, skeletons, inactive track. */
  readonly sunken: string;
  /** Primary text. */
  readonly ink: string;
  /** Secondary text. Meets AA on canvas, surface and sunken. */
  readonly inkMuted: string;
  /** Decorative separators. Not required to meet 3:1 — it carries no meaning. */
  readonly line: string;
  /** Stone grey. The visible boundary of a control, so it must meet 3:1. */
  readonly lineStrong: string;
  /** Restrained bronze. The one accent. */
  readonly accent: string;
  /** Tinted accent background for selected states. */
  readonly accentSoft: string;
  /** Text and icons on a filled accent surface. */
  readonly onAccent: string;
  /** The calm success colour. Never celebratory, never a reward. */
  readonly success: string;
  readonly successSoft: string;
  /** Caution, used for safety notices and errors. Never for a missed day. */
  readonly warn: string;
  /** Focus indicator. */
  readonly focus: string;
}

export const palettes: Record<ThemeName, Palette> = {
  light: {
    canvas: '#F4F1EA',
    surface: '#FBF9F4',
    sunken: '#EAE5DA',
    ink: '#1B1A17',
    inkMuted: '#5C584E',
    line: '#DAD3C5',
    lineStrong: '#86806F',
    accent: '#8A5423',
    accentSoft: '#F0E4D5',
    onAccent: '#F4F1EA',
    success: '#2F6155',
    successSoft: '#DDEAE6',
    warn: '#8A3F1F',
    focus: '#8A5423',
  },
  dark: {
    canvas: '#14151A',
    surface: '#1C1E24',
    sunken: '#101116',
    ink: '#ECE8E0',
    inkMuted: '#A49E92',
    line: '#2C3038',
    lineStrong: '#6E7682',
    accent: '#D29B5E',
    accentSoft: '#2A2118',
    onAccent: '#14151A',
    success: '#84B7A9',
    successSoft: '#172622',
    warn: '#E0906A',
    focus: '#D29B5E',
  },
};

/**
 * Every colour pair the product actually renders, with the threshold it has to
 * clear. Adding a pair here is how a new combination becomes verified; using a
 * combination that is not here is how it stays unverified, which is the point.
 */
export interface ContrastPair {
  readonly foreground: keyof Palette;
  readonly background: keyof Palette;
  readonly threshold: 'text' | 'largeTextOrUi';
  readonly where: string;
}

export const contrastPairs: readonly ContrastPair[] = [
  { foreground: 'ink', background: 'canvas', threshold: 'text', where: 'Body text on the page' },
  { foreground: 'ink', background: 'surface', threshold: 'text', where: 'Body text in a card' },
  { foreground: 'ink', background: 'sunken', threshold: 'text', where: 'Text in a well' },
  {
    foreground: 'ink',
    background: 'accentSoft',
    threshold: 'text',
    where: 'Text on a selected row',
  },
  {
    foreground: 'ink',
    background: 'successSoft',
    threshold: 'text',
    where: 'Text on a success tint',
  },
  {
    foreground: 'inkMuted',
    background: 'canvas',
    threshold: 'text',
    where: 'Secondary text on the page',
  },
  {
    foreground: 'inkMuted',
    background: 'surface',
    threshold: 'text',
    where: 'Secondary text in a card',
  },
  {
    foreground: 'inkMuted',
    background: 'sunken',
    threshold: 'text',
    where: 'Secondary text in a well',
  },
  {
    foreground: 'accent',
    background: 'canvas',
    threshold: 'text',
    where: 'Link or quiet button label',
  },
  {
    foreground: 'accent',
    background: 'surface',
    threshold: 'text',
    where: 'Accent text in a card',
  },
  { foreground: 'accent', background: 'sunken', threshold: 'text', where: 'Accent text in a well' },
  {
    foreground: 'accent',
    background: 'accentSoft',
    threshold: 'text',
    where: 'Current nav destination',
  },
  {
    foreground: 'onAccent',
    background: 'accent',
    threshold: 'text',
    where: 'Label on a filled button',
  },
  { foreground: 'success', background: 'canvas', threshold: 'text', where: 'Completion text' },
  {
    foreground: 'success',
    background: 'surface',
    threshold: 'text',
    where: 'Completion text in a card',
  },
  { foreground: 'success', background: 'successSoft', threshold: 'text', where: 'Completion chip' },
  {
    foreground: 'warn',
    background: 'canvas',
    threshold: 'text',
    where: 'Safety notice on the page',
  },
  {
    foreground: 'warn',
    background: 'surface',
    threshold: 'text',
    where: 'Safety notice in a card',
  },
  {
    foreground: 'lineStrong',
    background: 'surface',
    threshold: 'largeTextOrUi',
    where: 'Outlined control boundary',
  },
  {
    foreground: 'lineStrong',
    background: 'canvas',
    threshold: 'largeTextOrUi',
    where: 'Form field boundary',
  },
  {
    foreground: 'lineStrong',
    background: 'sunken',
    threshold: 'largeTextOrUi',
    where: 'Segmented control track',
  },
  {
    foreground: 'focus',
    background: 'canvas',
    threshold: 'largeTextOrUi',
    where: 'Focus ring on the page',
  },
  {
    foreground: 'focus',
    background: 'surface',
    threshold: 'largeTextOrUi',
    where: 'Focus ring in a card',
  },
  {
    foreground: 'focus',
    background: 'sunken',
    threshold: 'largeTextOrUi',
    where: 'Focus ring in a well',
  },
];

/** Type scale. Display is the editorial serif; everything else is the UI sans. */
export const typeScale = {
  'display-1': { size: '2rem', lineHeight: '1.12', family: 'display' },
  'display-2': { size: '1.5rem', lineHeight: '1.2', family: 'display' },
  'display-3': { size: '1.1875rem', lineHeight: '1.3', family: 'display' },
  'body-lg': { size: '1.0625rem', lineHeight: '1.55', family: 'sans' },
  body: { size: '0.9375rem', lineHeight: '1.6', family: 'sans' },
  'body-sm': { size: '0.8125rem', lineHeight: '1.5', family: 'sans' },
  label: { size: '0.75rem', lineHeight: '1.35', family: 'sans' },
} as const;

/** Spacing, on a 4px base. */
export const space = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  full: '9999px',
} as const;

/**
 * Shadow is used to say "this floats above the page", never for decoration.
 * Only sheets, dialogs and the command launcher get one.
 */
export const shadow = {
  none: 'none',
  raised: '0 1px 2px rgb(0 0 0 / 0.04), 0 2px 8px rgb(0 0 0 / 0.04)',
  overlay: '0 8px 32px rgb(0 0 0 / 0.16)',
} as const;

/**
 * Motion is purposeful and short. Breathing is the one deliberately slow
 * animation, because it is the practice itself rather than a transition.
 * Every one of these is suppressed under `prefers-reduced-motion: reduce`.
 */
export const motion = {
  duration: {
    fast: '120ms',
    base: '200ms',
    slow: '360ms',
    breathIn: '4s',
    breathHold: '2s',
    breathOut: '6s',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    breath: 'cubic-bezier(0.37, 0, 0.63, 1)',
  },
} as const;

/** Minimum touch target, from PRODUCT_SPEC §13. */
export const minTouchTargetPx = 44;
