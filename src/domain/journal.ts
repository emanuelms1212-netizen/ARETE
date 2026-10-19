import type { IsoDate } from './types';

/**
 * The Stoic journal: a morning page, an evening page and a weekly review.
 *
 * Its morning half is Today's framing and its evening half is Today's evening
 * review — the same records, not a second copy of them — so writing on either
 * screen is writing in the journal. The tone is plain: questions a person can
 * answer in a minute, no exhortation and no marble columns.
 */

export const VIRTUES = [
  {
    value: 'wisdom',
    label: 'Good judgement',
    hint: 'Seeing the situation as it is before acting.',
  },
  { value: 'courage', label: 'Courage', hint: 'Doing the uncomfortable right thing.' },
  {
    value: 'justice',
    label: 'Fairness',
    hint: 'Treating people as they deserve, including yourself.',
  },
  { value: 'temperance', label: 'Self-control', hint: 'Enough, and no more.' },
] as const;
export type Virtue = (typeof VIRTUES)[number]['value'];

export const MORNING_PROMPTS = {
  inMyControl: 'What is in my control today?',
  notMyControl: 'What is not?',
  virtue: 'The quality I mean to practise',
  obstacle: 'Today’s likely obstacle, and how I will meet it',
} as const;

export const EVENING_PROMPTS = {
  wentWell: 'What did I do well?',
  friction: 'Where did judgement or impulse take over?',
  learned: 'What did I learn?',
  tomorrowOneThing: 'One adjustment for tomorrow',
} as const;

export const WEEKLY_PROMPTS = [
  { key: 'moved', text: 'What moved forward?' },
  { key: 'friction', text: 'What created friction?' },
  { key: 'reduce', text: 'What should be reduced?' },
  { key: 'maintain', text: 'What should be kept as it is?' },
  { key: 'increase', text: 'What deserves a little more?' },
  { key: 'outcomes', text: 'Next week’s top outcomes — three at most.' },
] as const;
export type WeeklyPromptKey = (typeof WEEKLY_PROMPTS)[number]['key'];

export interface JournalQuote {
  readonly text: string;
  readonly author: string;
  readonly work: string;
  readonly translator: string;
  readonly sourceUrl: string;
  readonly attribution: 'verified-public-domain';
}

/**
 * A small verified set, checked word for word against public-domain
 * translations (George Long, nineteenth century) before shipping. Optional:
 * the journal works with none of them. Nothing here is a paraphrase wearing
 * an author's name.
 */
export const JOURNAL_QUOTES: readonly JournalQuote[] = [
  {
    text: 'Of things some are in our power, and others are not.',
    author: 'Epictetus',
    work: 'Enchiridion, 1',
    translator: 'George Long',
    sourceUrl:
      'https://standardebooks.org/ebooks/epictetus/short-works/george-long/text/the-enchiridion',
    attribution: 'verified-public-domain',
  },
  {
    text: 'Men are disturbed not by the things which happen, but by the opinions about the things.',
    author: 'Epictetus',
    work: 'Enchiridion, 5',
    translator: 'George Long',
    sourceUrl:
      'https://standardebooks.org/ebooks/epictetus/short-works/george-long/text/the-enchiridion',
    attribution: 'verified-public-domain',
  },
  {
    text: 'Since it is possible that thou mayest depart from life this very moment, regulate every act and thought accordingly.',
    author: 'Marcus Aurelius',
    work: 'Meditations, Book II',
    translator: 'George Long',
    sourceUrl: 'https://classics.mit.edu/Antoninus/meditations.2.two.html',
    attribution: 'verified-public-domain',
  },
];

/** The same quote all day, a different one tomorrow. */
export function quoteFor(localDate: IsoDate): JournalQuote {
  const day = Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
  return JOURNAL_QUOTES[
    ((day % JOURNAL_QUOTES.length) + JOURNAL_QUOTES.length) % JOURNAL_QUOTES.length
  ]!;
}

/** Monday of the week a date is in. Weeks run Monday to Sunday. */
export function weekStart(localDate: IsoDate): IsoDate {
  const date = new Date(`${localDate}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

export interface WeekFacts {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly daysPlanned: number;
  readonly commitmentsDone: number;
  readonly commitmentsTotal: number;
  readonly minimumDays: number;
  readonly focusMinutes: number;
  readonly workouts: number;
  readonly mindSessions: number;
  readonly foodDays: number;
  readonly resetItemsDone: number;
  readonly contrastSessions: number;
  readonly journalDays: number;
}

/**
 * The factual half of the weekly review, in sentences. Counts of what
 * happened; never what did not, never a percentage, never a verdict.
 */
export function weekFactLines(facts: WeekFacts): string[] {
  const lines: string[] = [];
  const plural = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;
  if (facts.daysPlanned > 0) {
    lines.push(
      `${plural(facts.commitmentsDone, 'commitment')} done across ${plural(facts.daysPlanned, 'planned day')}.`,
    );
  }
  if (facts.minimumDays > 0)
    lines.push(`${plural(facts.minimumDays, 'day')} run at the minimum — each one counted.`);
  if (facts.focusMinutes > 0) lines.push(`${facts.focusMinutes} minutes of focus.`);
  if (facts.workouts > 0) lines.push(`${plural(facts.workouts, 'workout')}.`);
  if (facts.mindSessions > 0)
    lines.push(`${plural(facts.mindSessions, 'meditation or breathing session')}.`);
  if (facts.foodDays > 0) lines.push(`Food logged on ${plural(facts.foodDays, 'day')}.`);
  if (facts.resetItemsDone > 0) lines.push(`${plural(facts.resetItemsDone, 'reset item')} done.`);
  if (facts.contrastSessions > 0)
    lines.push(`${plural(facts.contrastSessions, 'contrast session')}.`);
  if (facts.journalDays > 0) lines.push(`Journal written on ${plural(facts.journalDays, 'day')}.`);
  if (lines.length === 0)
    lines.push('Nothing recorded this week. That is information, not a judgement.');
  return lines;
}
