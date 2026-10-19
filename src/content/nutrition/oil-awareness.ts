/**
 * Ingredient / oil awareness: the optional, off-by-default preference.
 *
 * Source: "The Complete Seed Oil Guide" by Joseph Everett (SOURCE_MAP §6), a
 * third-party article with no licence to redistribute and an advocacy
 * position that major dietary guidance does not share. So nothing here
 * reproduces it: each card states, in ARETE's own words and briefly, what the
 * guide claims, how settled the evidence is, and what mainstream guidance
 * says — side by side, in neutral language. No card recommends a supplement
 * or treatment, and none makes a disease-prevention promise.
 *
 * The uncontroversial parts — read labels, know what is in a blend, ask how
 * restaurant food is cooked — are offered as tools, whatever your view.
 */

export const OIL_SOURCE = {
  title: 'The Complete Seed Oil Guide',
  author: 'Joseph Everett',
  filename: 'The-Complete-Seed-Oil-Guide-Joseph-Everett.pdf',
  note: 'One author’s viewpoint, summarised briefly in ARETE’s words. It is not medical advice and not ARETE’s position.',
} as const;

export interface OilCard {
  readonly title: string;
  readonly claim: string;
  readonly evidence: string;
  readonly mainstream: string;
}

export const OIL_CARDS: readonly OilCard[] = [
  {
    title: 'Seed oils and heat',
    claim:
      'The guide argues that oils high in polyunsaturated fat break down when heated and that eating them contributes to chronic disease.',
    evidence:
      'That oils oxidise at high heat and with reuse is well established. Whether normal amounts in a diet cause disease in people is not established; much of the guide’s argument rests on animal studies.',
    mainstream:
      'Most national dietary guidelines advise replacing saturated fat with unsaturated fats, which includes many seed oils.',
  },
  {
    title: 'Saturated fat',
    claim: 'The guide suggests eating more saturated fat in place of seed oils.',
    evidence:
      'Researchers still debate parts of the saturated-fat story, but the overall evidence has not moved mainstream advice.',
    mainstream:
      'Most guidelines advise keeping saturated fat to roughly a tenth of energy or less. ARETE does not recommend eating more of it.',
  },
  {
    title: 'Fried and restaurant food',
    claim:
      'The guide recommends avoiding deep-fried food, partly because frying oil is often reused.',
    evidence: 'Reused frying oil does degrade, and fried food is energy-dense.',
    mainstream:
      'Eating less fried and heavily processed food fits mainstream advice, for reasons the guide and the guidelines largely share.',
  },
  {
    title: 'Reading labels',
    claim: 'The guide encourages reading ingredient lists, because many products use oil blends.',
    evidence:
      'Not a health claim: knowing what is in your food is useful whatever you conclude about oils.',
    mainstream: 'Uncontroversial.',
  },
];

export const NO_SUPPLEMENTS =
  'ARETE does not recommend vitamin E, NAC, extra saturated fat or any supplement as a treatment for anything.';

export const RESTAURANT_QUESTIONS: readonly string[] = [
  'What oil is this cooked in?',
  'Is the fryer oil shared with other dishes, and how often is it changed?',
  'Could it be cooked in butter or olive oil instead?',
  'Is the dressing made here, and with which oil?',
];
