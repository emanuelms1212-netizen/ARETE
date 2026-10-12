import { z } from 'zod';

/**
 * Cognitive practice, and the claim this module refuses to make.
 *
 * Getting better at a drill means getting better at that drill. It is not
 * evidence of a higher IQ, and it does not transfer to unrelated tasks — the
 * far-transfer literature is, at best, unconvincing. So nothing here produces
 * a "score", a percentile, an age equivalent, or a single number that could be
 * mistaken for one. The schema says so too: `cognitive_sessions` has no score
 * column, and its comment explains why.
 *
 * What is honest, and genuinely useful, is a practice curve for one drill:
 * here is how you have done at this, over time, and it goes up when you
 * practise. `summarise` returns exactly that, per drill, and `TRANSFER_NOTE`
 * is the sentence that has to appear wherever it is shown.
 */
export const DRILLS = [
  'sustained-attention',
  'reaction-time',
  'working-memory',
  'mental-arithmetic',
  'recall',
  'spaced-retrieval',
] as const;
export type Drill = (typeof DRILLS)[number];

export interface DrillDefinition {
  readonly slug: Drill;
  readonly title: string;
  readonly summary: string;
  /** What the number at the end actually means. Shown with every result. */
  readonly measures: string;
  readonly defaultItems: number;
}

export const DRILL_DEFINITIONS: readonly DrillDefinition[] = [
  {
    slug: 'sustained-attention',
    title: 'Sustained attention',
    summary: 'Respond to most things, hold back on one. Ten minutes of not drifting.',
    measures: 'How often you held back when you should have, at this task.',
    defaultItems: 30,
  },
  {
    slug: 'reaction-time',
    title: 'Reaction time',
    summary: 'Tap as soon as it changes. Nothing to work out.',
    measures: 'Your median response time at this task, in milliseconds.',
    defaultItems: 15,
  },
  {
    slug: 'working-memory',
    title: 'Working memory',
    summary: 'Hold a short sequence, then give it back.',
    measures: 'How long a sequence you held, at this task.',
    defaultItems: 12,
  },
  {
    slug: 'mental-arithmetic',
    title: 'Mental arithmetic',
    summary: 'Two numbers, one operation, no paper.',
    measures: 'How many you got right, and how fast, at this task.',
    defaultItems: 20,
  },
  {
    slug: 'recall',
    title: 'Recall',
    summary: 'A short list to read, then write back from memory.',
    measures: 'How many of the list you recalled, at this task.',
    defaultItems: 10,
  },
  {
    slug: 'spaced-retrieval',
    title: 'Spaced retrieval',
    summary: 'Things you saw before, asked again at widening intervals.',
    measures: 'How much you still had at the interval it was asked, at this task.',
    defaultItems: 15,
  },
];

/**
 * The sentence that must accompany any cognitive result.
 *
 * Exported rather than inlined so that a test can assert it is present, and so
 * there is exactly one wording to review.
 */
export const TRANSFER_NOTE =
  'Practice at a drill makes you better at that drill. It is not a measure of intelligence, ' +
  'and improvement here is not evidence of improvement at anything else.';

export const drillItemSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  given: z.string().nullable().default(null),
  correct: z.boolean(),
  responseMs: z.number().nonnegative(),
});
export type DrillItem = z.infer<typeof drillItemSchema>;

/**
 * A small deterministic generator.
 *
 * Seeded rather than random so that a test can assert what a session contains,
 * and so two people comparing notes on the same day see the same items.
 * `mulberry32` is a well-known 32-bit PRNG — short, fast and good enough for
 * choosing arithmetic operands.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedItem {
  readonly prompt: string;
  readonly answer: string;
  /** Plausible wrong answers, for drills that offer a choice. */
  readonly options?: readonly string[];
}

/** Turns a seed and a level into the items for one arithmetic session. */
export function generateArithmetic(seed: number, count: number, level: number): GeneratedItem[] {
  const random = seededRandom(seed);
  const ceiling = 10 * Math.max(1, level);

  return Array.from({ length: count }, () => {
    const left = 1 + Math.floor(random() * ceiling);
    const right = 1 + Math.floor(random() * ceiling);
    const operation = random();

    if (operation < 0.4) return { prompt: `${left} + ${right}`, answer: String(left + right) };
    if (operation < 0.7) {
      // Ordered so the answer is never negative, which is a different skill.
      const [high, low] = left >= right ? [left, right] : [right, left];
      return { prompt: `${high} − ${low}`, answer: String(high - low) };
    }

    const small = 2 + Math.floor(random() * Math.min(12, ceiling));
    const other = 2 + Math.floor(random() * Math.min(12, ceiling));
    return { prompt: `${small} × ${other}`, answer: String(small * other) };
  });
}

/** A digit sequence of the given length, for the working-memory drill. */
export function generateSequence(seed: number, length: number): GeneratedItem {
  const random = seededRandom(seed);
  const digits = Array.from({ length }, () => Math.floor(random() * 10));
  return { prompt: digits.join(' '), answer: digits.join('') };
}

export interface DrillResult {
  readonly drill: Drill;
  readonly itemsAttempted: number;
  readonly itemsCorrect: number;
  readonly medianResponseMs: number | null;
  /** 0 to 1. Accuracy at this drill, in this session. Never called a score. */
  readonly accuracy: number;
}

export function scoreItems(drill: Drill, items: readonly DrillItem[]): DrillResult {
  const attempted = items.length;
  const correct = items.filter((item) => item.correct).length;

  const times = items
    .filter((item) => item.correct)
    .map((item) => item.responseMs)
    .sort((a, b) => a - b);

  return {
    drill,
    itemsAttempted: attempted,
    itemsCorrect: correct,
    medianResponseMs: median(times),
    accuracy: attempted === 0 ? 0 : correct / attempted,
  };
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const low = sorted[middle - 1];
  const high = sorted[middle];
  return low === undefined || high === undefined ? null : Math.round((low + high) / 2);
}

export interface PracticeCurve {
  readonly drill: Drill;
  readonly sessions: number;
  /** Accuracy in the most recent session. */
  readonly latestAccuracy: number | null;
  /** Mean accuracy over the earliest third, for an honest "when you started". */
  readonly earlyAccuracy: number | null;
  readonly latestMedianMs: number | null;
  /** Plain words, with no claim beyond this drill. */
  readonly summary: string;
}

/**
 * What to say about one drill, over time.
 *
 * Phrased in the second person about *this task*, every time. The phrase
 * "at this" is doing deliberate work: it is what stops the sentence becoming a
 * statement about the person.
 */
export function summarise(drill: Drill, history: readonly DrillResult[]): PracticeCurve {
  const forDrill = history.filter((result) => result.drill === drill);

  if (forDrill.length === 0) {
    return {
      drill,
      sessions: 0,
      latestAccuracy: null,
      earlyAccuracy: null,
      latestMedianMs: null,
      summary: 'No practice at this yet.',
    };
  }

  const latest = forDrill[forDrill.length - 1];
  const earlyCount = Math.max(1, Math.floor(forDrill.length / 3));
  const early = forDrill.slice(0, earlyCount);
  const earlyAccuracy = early.reduce((sum, r) => sum + r.accuracy, 0) / early.length;
  const latestAccuracy = latest?.accuracy ?? null;

  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const sessionWord = forDrill.length === 1 ? 'session' : 'sessions';

  if (forDrill.length < 3 || latestAccuracy === null) {
    return {
      drill,
      sessions: forDrill.length,
      latestAccuracy,
      earlyAccuracy,
      latestMedianMs: latest?.medianResponseMs ?? null,
      summary: `${forDrill.length} ${sessionWord} so far. Too early to see a pattern.`,
    };
  }

  const change = latestAccuracy - earlyAccuracy;
  const direction =
    Math.abs(change) < 0.05
      ? 'about the same as when you started'
      : change > 0
        ? `up from ${percent(earlyAccuracy)} when you started`
        : `down from ${percent(earlyAccuracy)} when you started`;

  return {
    drill,
    sessions: forDrill.length,
    latestAccuracy,
    earlyAccuracy,
    latestMedianMs: latest?.medianResponseMs ?? null,
    summary: `${percent(latestAccuracy)} at this drill last time — ${direction}.`,
  };
}

/**
 * Which drill to offer next.
 *
 * Rotates to the least-practised one, so a single metric cannot come to stand
 * for the whole thing — which is both what the brief asks for and the honest
 * way to run it, since practising one drill daily produces a rising line that
 * means very little.
 */
export function nextDrill(history: readonly DrillResult[], available = DRILLS): Drill {
  const counts = new Map<Drill, number>(available.map((drill) => [drill, 0]));
  for (const result of history) {
    const current = counts.get(result.drill);
    if (current !== undefined) counts.set(result.drill, current + 1);
  }

  let chosen: Drill = available[0] ?? 'reaction-time';
  let fewest = Number.POSITIVE_INFINITY;
  for (const drill of available) {
    const count = counts.get(drill) ?? 0;
    if (count < fewest) {
      fewest = count;
      chosen = drill;
    }
  }
  return chosen;
}
