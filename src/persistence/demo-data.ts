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
