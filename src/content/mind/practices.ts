import { BREATH_PRACTICES, DRILL_DEFINITIONS } from '@/domain';
import type { MindPractice } from '@/persistence/repository';

/**
 * The practice catalogue.
 *
 * Secular practices first and unconditionally — they are what the Mind screen
 * offers anyone who opens it. The Jewish pack is defined here too, but every
 * one of its practices carries `contentPackSlug: 'jewish-meditation'`, and the
 * repository will not return a packed practice unless the user has chosen that
 * pack. That is the rule from SOURCE_MAP §5, enforced in one place.
 *
 * On sacred text: the pack references liturgy that is public domain and
 * conventional transliterations, and it does so by *name* with a one-line
 * description of the practice. It does not reproduce the text. Where a
 * practice would benefit from the words themselves, the instruction tells the
 * user to use their own siddur — because a meditation app inventing or
 * mis-transliterating liturgy is worse than one that declines to.
 */
export const SECULAR_MEDITATION: readonly MindPractice[] = [
  {
    slug: 'breath-awareness',
    kind: 'meditation',
    title: 'Breath awareness',
    summary:
      'Follow the breath. When you notice you have wandered, come back. That is the practice.',
    defaultMinutes: 10,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: null,
    provenanceNote: null,
    steps: [
      {
        label: 'Settle',
        seconds: 30,
        say: 'Sit so you could stay there a while. Eyes closed or soft.',
      },
      {
        label: 'Find the breath',
        seconds: 60,
        say: 'Wherever you feel it most plainly — nose, chest, belly.',
      },
      {
        label: 'Follow it',
        say: 'Noticing you have drifted is not failing at this. It is the repetition.',
      },
    ],
  },
  {
    slug: 'body-scan',
    kind: 'meditation',
    title: 'Body scan',
    summary: 'Move attention slowly through the body, without trying to change what you find.',
    defaultMinutes: 15,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: null,
    provenanceNote: null,
    steps: [
      {
        label: 'Lie or sit',
        seconds: 30,
        say: 'Somewhere you can be still without holding yourself up.',
      },
      {
        label: 'Start at the feet',
        seconds: 60,
        say: 'Notice what is there. Warmth, pressure, nothing at all.',
      },
      { label: 'Move up', say: 'Unhurried. You are not looking for anything or fixing anything.' },
    ],
  },
  {
    slug: 'open-monitoring',
    kind: 'meditation',
    title: 'Open monitoring',
    summary: 'Nothing to focus on. Notice whatever arrives, and let it go on its way.',
    defaultMinutes: 10,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: null,
    provenanceNote: null,
    steps: [
      { label: 'Settle', seconds: 30, say: 'Upright and easy.' },
      { label: 'Open out', say: 'Sounds, sensations, thoughts. Note them and let them pass.' },
    ],
  },
  {
    slug: 'loving-kindness',
    kind: 'meditation',
    title: 'Loving-kindness',
    summary: 'A few plain wishes, offered to yourself and then outward.',
    defaultMinutes: 10,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: null,
    provenanceNote: null,
    steps: [
      { label: 'Yourself first', seconds: 120, say: 'May I be well. May I be at ease.' },
      { label: 'Someone easy', seconds: 120, say: 'Someone you are glad about. The same words.' },
      { label: 'Someone difficult', seconds: 120, say: 'Only as far as you honestly can.' },
      { label: 'Outward', say: 'Anyone. Everyone. As wide as it goes.' },
    ],
  },
  {
    slug: 'silent-timer',
    kind: 'meditation',
    title: 'Silent timer',
    summary: 'No instruction at all. A bell at the start and a bell at the end.',
    defaultMinutes: 20,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: null,
    provenanceNote: null,
    steps: [{ label: 'Begin', say: 'Your practice, your way.' }],
  },
];

/**
 * The optional four-week Jewish meditation pack.
 *
 * Derived from `Jewish_Meditation_4_Week_Program.pdf` (SOURCE_MAP §5). Each
 * week names its practice and describes it; none of them reproduces liturgy.
 * Week three points the user to their own siddur rather than printing the
 * Shema, and the Psalm is cited by reference.
 */
export const JEWISH_MEDITATION_PACK: readonly MindPractice[] = [
  {
    slug: 'jm-week-1-breath',
    kind: 'meditation',
    title: 'Week one — breath and stillness',
    summary:
      'Plain breath awareness, with the aim of letting the noise settle rather than stopping it.',
    defaultMinutes: 10,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: 'jewish-meditation',
    provenanceNote:
      'Jewish_Meditation_4_Week_Program.pdf, week 1. Practice described, not reproduced.',
    steps: [
      { label: 'Settle', seconds: 60, say: 'Somewhere quiet, at a time you can repeat tomorrow.' },
      {
        label: 'Breath',
        say: 'Follow it. Thoughts will come; you are not required to chase them.',
      },
      { label: 'A line afterwards', say: 'The source suggests a short note when you finish.' },
    ],
  },
  {
    slug: 'jm-week-2-aleph',
    kind: 'meditation',
    title: 'Week two — letter or object contemplation',
    summary:
      'Hold a single form in mind — the letter Aleph, or a candle flame — and keep returning to it.',
    defaultMinutes: 12,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: 'jewish-meditation',
    provenanceNote: 'Jewish_Meditation_4_Week_Program.pdf, week 2.',
    steps: [
      {
        label: 'Choose the form',
        seconds: 30,
        say: 'The letter Aleph (א), or something in front of you.',
      },
      { label: 'Hold it', say: 'When it slips, bring it back. That returning is the practice.' },
    ],
  },
  {
    slug: 'jm-week-3-shema',
    kind: 'meditation',
    title: 'Week three — Shema and contemplation',
    summary:
      'A contemplative recitation. Use the text from your own siddur; this app does not print liturgy.',
    defaultMinutes: 12,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: 'jewish-meditation',
    provenanceNote:
      'Jewish_Meditation_4_Week_Program.pdf, week 3, which references the Shema and Psalm 16:8. ' +
      'Liturgical text is public domain, but it is not reproduced here: a meditation app that ' +
      'mis-transliterates or paraphrases sacred text is worse than one that declines to print it.',
    steps: [
      { label: 'Open your siddur', seconds: 30, say: 'Or recite from memory, if you have it.' },
      {
        label: 'Slowly',
        say: 'A word at a time, with a pause between. Not performance — attention.',
      },
      { label: 'Sit with it', say: 'The source also points to Psalm 16:8 for this week.' },
    ],
  },
  {
    slug: 'jm-week-4-hitbodedut',
    kind: 'meditation',
    title: 'Week four — hitbodedut',
    summary: 'Personal prayer in your own words, out loud, alone. Nothing prescribed to say.',
    defaultMinutes: 15,
    minMinutes: 5,
    maxMinutes: 25,
    pattern: null,
    drill: null,
    contentPackSlug: 'jewish-meditation',
    provenanceNote: 'Jewish_Meditation_4_Week_Program.pdf, week 4.',
    steps: [
      { label: 'Somewhere alone', seconds: 30, say: 'Outdoors if you can. Out loud is the point.' },
      {
        label: 'Your own words',
        say: 'Whatever is actually on your mind. There is no correct version.',
      },
    ],
  },
];

/** Breathwork, built from the patterns the domain already guards. */
export const BREATHWORK_PRACTICES: readonly MindPractice[] = BREATH_PRACTICES.map((practice) => ({
  slug: practice.slug,
  kind: 'breathwork' as const,
  title: practice.title,
  summary: practice.summary,
  defaultMinutes: null,
  minMinutes: null,
  maxMinutes: null,
  pattern: { ...practice.pattern },
  drill: null,
  contentPackSlug: null,
  provenanceNote: null,
  steps: [{ label: 'Before you start', say: practice.useWhen }],
}));

/**
 * The drills that are actually implemented.
 *
 * The brief names six. Two have a working runner; the other four do not, and
 * a list of six where two do something is the mock button the operating rules
 * forbid. They are recorded as outstanding in the ledger instead of drawn.
 */
export const IMPLEMENTED_DRILLS = ['mental-arithmetic', 'working-memory'] as const;

/** Cognitive drills, built from the definitions the domain already states. */
export const COGNITIVE_PRACTICES: readonly MindPractice[] = DRILL_DEFINITIONS.filter((definition) =>
  (IMPLEMENTED_DRILLS as readonly string[]).includes(definition.slug),
).map((definition) => ({
  slug: definition.slug,
  kind: 'cognitive' as const,
  title: definition.title,
  summary: definition.summary,
  defaultMinutes: null,
  minMinutes: null,
  maxMinutes: null,
  pattern: null,
  drill: definition.slug,
  contentPackSlug: null,
  provenanceNote: null,
  steps: [{ label: 'What this shows', say: definition.measures }],
}));

/**
 * Everything the catalogue holds.
 *
 * The repository filters this by what the user has chosen — a practice with a
 * `contentPackSlug` is invisible until the matching pack is picked.
 */
export const ALL_PRACTICES: readonly MindPractice[] = [
  ...SECULAR_MEDITATION,
  ...JEWISH_MEDITATION_PACK,
  ...BREATHWORK_PRACTICES,
  ...COGNITIVE_PRACTICES,
];

export const MIND_PACKS: readonly {
  slug: string;
  title: string;
  requiresExplicitChoice: boolean;
  provenanceNote: string | null;
}[] = [
  {
    slug: 'jewish-meditation',
    title: 'Jewish meditation — four weeks',
    // Never offered by default, never inferred. SOURCE_MAP §5.
    requiresExplicitChoice: true,
    provenanceNote:
      'Derived from Jewish_Meditation_4_Week_Program.pdf. Practices are described rather than ' +
      'reproduced, and no liturgical text is printed by the app.',
  },
];
