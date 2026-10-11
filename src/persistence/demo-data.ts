import type { Day } from '@/domain';

/**
 * Deterministic demo data.
 *
 * Fixed dates and fixed contents, so screenshots, tests and CI all see exactly
 * the same thing. This is demo data and the UI says so: the app never presents
 * it as the user's own.
 *
 * The shape is deliberately unglamorous — a partly-done day, a skipped item with
 * a reason, and a quiet day — because those are the states the design has to
 * survive, not the perfect day.
 */
/** The demo account. A real uuid so demo and live code paths look identical. */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export const DEMO_TODAY = '2026-03-16';

export const demoDays: readonly Day[] = [
  {
    date: DEMO_TODAY,
    mark: 'normal',
    committedAt: '2026-03-16T07:20:00.000Z',
    commitments: [
      { id: 'c1', kind: 'mind', title: 'Sit for ten minutes', isMinimum: true, status: 'done' },
      {
        id: 'c2',
        kind: 'focus',
        title: 'One focus block on the report',
        isMinimum: true,
        status: 'done',
      },
      { id: 'c3', kind: 'habit', title: 'Read ten pages', isMinimum: false, status: 'pending' },
      {
        id: 'c4',
        kind: 'mobility',
        title: 'Hamstrings, week 2 day 1',
        isMinimum: false,
        status: 'pending',
      },
      {
        id: 'c5',
        kind: 'workout',
        title: 'Lower body',
        isMinimum: false,
        status: 'skipped',
        skipReason: 'Slept badly',
      },
    ],
  },
  {
    date: '2026-03-15',
    mark: 'normal',
    committedAt: null,
    commitments: [
      { id: 'd1', kind: 'mind', title: 'Sit for ten minutes', isMinimum: true, status: 'pending' },
      { id: 'd2', kind: 'habit', title: 'Read ten pages', isMinimum: false, status: 'pending' },
    ],
  },
  {
    date: '2026-03-14',
    mark: 'travel',
    committedAt: '2026-03-14T06:05:00.000Z',
    commitments: [
      { id: 'e1', kind: 'mind', title: 'Sit for ten minutes', isMinimum: true, status: 'done' },
      { id: 'e2', kind: 'food', title: 'Log one meal', isMinimum: false, status: 'done' },
    ],
  },
];

/**
 * Goals, tasks and habits for the demo account.
 *
 * Deliberately unglamorous, like the days above. One goal is measured and one
 * is judged, because the Plan screen has to prove it will not invent a
 * percentage for the second. One habit is a `limit`, because that is the kind
 * most likely to be rendered backwards. The task list has an inbox item with
 * no date, which is the state the whole capture idea depends on.
 */
export interface DemoSeed {
  readonly goals: readonly {
    readonly title: string;
    readonly why?: string;
    readonly successMeasure?: string;
    readonly measureUnit?: string;
    readonly startValue?: number;
    readonly targetValue?: number;
    readonly targetDate?: string;
    readonly milestones?: readonly string[];
    /** `[localDate, value]`, oldest first. */
    readonly readings?: readonly (readonly [string, number])[];
  }[];
  readonly tasks: readonly {
    readonly title: string;
    readonly scheduledDate?: string;
    readonly estimateMinutes?: number;
    readonly energy?: 'low' | 'medium' | 'high';
    readonly context?: string;
    readonly subtasks?: readonly string[];
  }[];
  readonly habits: readonly {
    readonly title: string;
    readonly kind: 'binary' | 'count' | 'duration' | 'limit';
    readonly unit?: string;
    readonly targetValue?: number;
    readonly minimumTarget?: number;
    /** `[localDate, status, value?]`, oldest first. */
    readonly logs?: readonly (readonly [
      string,
      'done' | 'partial' | 'skipped' | 'rest',
      number?,
    ])[];
  }[];
}

export const demoSeed: DemoSeed = {
  goals: [
    {
      title: 'Run 10k without stopping',
      why: 'Because I keep starting and stopping, and I want one thing I finished.',
      successMeasure: 'Ten kilometres, continuous, at any pace at all.',
      measureUnit: 'km',
      startValue: 3,
      targetValue: 10,
      targetDate: '2026-06-30',
      milestones: ['Five kilometres without walking', 'One long run a week for a month'],
      readings: [
        ['2026-03-02', 3],
        ['2026-03-09', 4.5],
        ['2026-03-15', 6],
      ],
    },
    {
      // No measure on purpose: the screen must say "judged at review" rather
      // than turn two completed milestones into "50% done".
      title: 'Be someone my sister can call',
      why: 'She stopped calling and I noticed late.',
      successMeasure: 'She calls about something ordinary, not something wrong.',
      milestones: ['Call first, twice in a month'],
    },
  ],
  tasks: [
    { title: 'Work out what the dentist actually said' },
    { title: 'Reply to Dana', energy: 'low', context: 'phone', estimateMinutes: 5 },
    {
      title: 'Draft the quarterly note',
      scheduledDate: DEMO_TODAY,
      energy: 'high',
      estimateMinutes: 90,
      subtasks: ['Pull the numbers', 'Write the first paragraph badly'],
    },
    { title: 'Book the van', scheduledDate: '2026-03-18', energy: 'medium' },
    { title: 'Learn to sail', scheduledDate: '2026-08-01' },
  ],
  habits: [
    {
      title: 'Sit for ten minutes',
      kind: 'binary',
      logs: [
        ['2026-03-11', 'done'],
        ['2026-03-12', 'done'],
        ['2026-03-13', 'rest'],
        ['2026-03-14', 'done'],
        ['2026-03-15', 'done'],
        [DEMO_TODAY, 'done'],
      ],
    },
    {
      title: 'Read before bed',
      kind: 'count',
      unit: 'pages',
      targetValue: 20,
      minimumTarget: 5,
      logs: [
        ['2026-03-12', 'done', 22],
        ['2026-03-13', 'partial', 6],
        ['2026-03-14', 'skipped'],
        ['2026-03-15', 'done', 20],
      ],
    },
    {
      // A ceiling, not a target. Two is the good day; the minimum is the
      // looser ceiling for a bad one.
      title: 'Coffee',
      kind: 'limit',
      unit: 'cups',
      targetValue: 2,
      minimumTarget: 4,
      logs: [
        ['2026-03-13', 'done', 2],
        ['2026-03-14', 'partial', 5],
        ['2026-03-15', 'done', 1],
      ],
    },
  ],
};
