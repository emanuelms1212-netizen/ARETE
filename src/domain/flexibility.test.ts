import { describe, expect, it } from 'vitest';
import { FLEX_MOVEMENTS, HAMSTRING_PROGRAM } from '@/content/flexibility/hamstring';
import {
  checkinDue,
  checkinNeedsGuidance,
  checkinSchema,
  compareCheckins,
  flexEligibility,
  flexWeekdaysSchema,
  isProgramOffered,
  programState,
  sessionKey,
  type Checkin,
  type FlexEnrolment,
  type FlexSessionRecord,
} from './flexibility';

const enrolment: FlexEnrolment = {
  id: 'e1',
  programSlug: 'hamstring-mobility',
  startedOn: '2026-03-02', // a Monday
  weekdays: [1, 3, 5],
  status: 'active',
  endedAt: null,
};

let sequence = 0;
function record(
  week: number,
  day: number,
  localDate: string,
  status: FlexSessionRecord['status'] = 'completed',
): FlexSessionRecord {
  sequence += 1;
  return {
    id: `r${sequence}`,
    enrolmentId: 'e1',
    week,
    day,
    localDate,
    status,
    startedAt: `${localDate}T07:00:00Z`,
    endedAt: status === 'running' ? null : `${localDate}T07:15:00Z`,
    warmup: 'standard',
    items: [],
    notes: null,
    painReported: status === 'stopped',
    painNote: null,
    skipReason: status === 'skipped' ? 'Away' : null,
  };
}

describe('programState', () => {
  it('starts in week one with all three sessions open, on the chosen days', () => {
    const state = programState(HAMSTRING_PROGRAM, enrolment, [], '2026-03-02');
    expect(state.currentWeek).toBe(1);
    expect(state.open.map((planned) => planned.template.day)).toEqual([1, 2, 3]);
    expect(state.open.map((planned) => planned.suggestedDate)).toEqual([
      '2026-03-02',
      '2026-03-04',
      '2026-03-06',
    ]);
    expect(state.message).toBeNull();
  });

  it('lets the sessions of a week be done in any order', () => {
    const state = programState(
      HAMSTRING_PROGRAM,
      enrolment,
      [record(1, 3, '2026-03-02')],
      '2026-03-03',
    );
    expect(state.currentWeek).toBe(1);
    expect(state.open.map((planned) => planned.template.day)).toEqual([1, 2]);
    expect(state.completed).toBe(1);
  });

  it('moves to the next week only once the current one is closed', () => {
    const done = [
      record(1, 2, '2026-03-02'),
      record(1, 1, '2026-03-04'),
      record(1, 3, '2026-03-06'),
    ];
    const state = programState(HAMSTRING_PROGRAM, enrolment, done, '2026-03-07');
    expect(state.currentWeek).toBe(2);
    expect(state.open).toHaveLength(3);
  });

  it('survives a missed day: nothing is lost, and it says so without blame', () => {
    const state = programState(
      HAMSTRING_PROGRAM,
      enrolment,
      [record(1, 1, '2026-03-02')],
      '2026-03-07',
    );
    expect(state.currentWeek).toBe(1);
    expect(state.missedDays).toBe(2); // Wednesday and Friday
    expect(state.message).toMatch(/Nothing is lost/);
    expect(state.message).not.toMatch(/fail|miss(ed)? out|behind/i);
    // The open sessions are re-offered from today.
    expect(state.open[0]?.suggestedDate).toBe('2026-03-09');
  });

  it('counts a skip as closing the session, and a stop for pain as not', () => {
    const state = programState(
      HAMSTRING_PROGRAM,
      enrolment,
      [record(1, 1, '2026-03-02', 'skipped'), record(1, 2, '2026-03-04', 'stopped')],
      '2026-03-05',
    );
    expect(state.closedKeys.includes(sessionKey(1, 1))).toBe(true);
    expect(state.closedKeys.includes(sessionKey(1, 2))).toBe(false);
    expect(state.skipped).toBe(1);
    expect(state.completed).toBe(0);
  });

  it('suggests the easier versions after a long gap', () => {
    const state = programState(
      HAMSTRING_PROGRAM,
      enrolment,
      [record(1, 1, '2026-03-02')],
      '2026-03-20',
    );
    expect(state.easeBackIn).toBe(true);
    expect(state.message).toMatch(/easier version/);
  });

  it('finishes after twelve, and then offers maintenance rather than more weeks', () => {
    const all = HAMSTRING_PROGRAM.sessions.map((session, index) =>
      record(session.week, session.day, `2026-03-${String(2 + index).padStart(2, '0')}`),
    );
    const state = programState(HAMSTRING_PROGRAM, enrolment, all, '2026-03-20');
    expect(state.finished).toBe(true);
    expect(state.open).toEqual([]);
    expect(state.completed).toBe(12);
    expect(state.message).toMatch(/keeping at it/);
  });

  it('ignores records from another enrolment', () => {
    const other = { ...record(1, 1, '2026-03-02'), enrolmentId: 'e2' };
    expect(programState(HAMSTRING_PROGRAM, enrolment, [other], '2026-03-02').completed).toBe(0);
  });
});

describe('flexEligibility', () => {
  it('offers the programme as written with no relevant flags', () => {
    expect(
      flexEligibility(HAMSTRING_PROGRAM, [{ region: 'wrists', severity: 'severe' }], FLEX_MOVEMENTS)
        .kind,
    ).toBe('ok');
  });

  it('starts gently with a mild or moderate flag', () => {
    const result = flexEligibility(
      HAMSTRING_PROGRAM,
      [{ region: 'spine', severity: 'moderate' }],
      FLEX_MOVEMENTS,
    );
    expect(result.kind).toBe('gentle');
  });

  it('routes a severe flag to professional guidance', () => {
    const result = flexEligibility(
      HAMSTRING_PROGRAM,
      [{ region: 'hamstrings', severity: 'severe' }],
      FLEX_MOVEMENTS,
    );
    expect(result.kind).toBe('professional');
    if (result.kind === 'professional') expect(result.message).toMatch(/physiotherapist or doctor/);
  });
});

describe('check-ins', () => {
  const baseline: Checkin = checkinSchema.parse({
    week: 0,
    toeTouch: 'mid_shin',
    legRaiseLeft: 'to_70',
    legRaiseRight: 'below_45',
    tightness: 7,
    socks: 'some_effort',
    pickUp: 'hard',
    pain: 'none',
  });

  it('compares measure by measure, in words, with no total', () => {
    const later = {
      ...baseline,
      week: 2,
      toeTouch: 'ankles' as const,
      tightness: 5,
      legRaiseRight: 'below_45' as const,
      pickUp: 'some_effort' as const,
    };
    const changes = compareCheckins(baseline, later);
    expect(changes.find((change) => change.measure === 'Forward fold reach')).toMatchObject({
      from: 'Mid-shin',
      to: 'Ankles',
      change: 'further',
    });
    expect(changes.find((change) => change.measure === 'Tightness')).toMatchObject({
      change: 'looser',
      direction: 'more',
    });
    expect(changes.find((change) => change.measure === 'Leg raise, right')).toMatchObject({
      change: 'the same',
    });
    expect(JSON.stringify(changes)).not.toMatch(/score|better|worse|%/i);
  });

  it('describes going backwards plainly', () => {
    const later = { ...baseline, week: 1, toeTouch: 'knees' as const, tightness: 8 };
    const changes = compareCheckins(baseline, later);
    expect(changes[0]?.change).toBe('less far');
    expect(changes.find((change) => change.measure === 'Tightness')?.change).toBe('tighter');
  });

  it('asks for the baseline first, then one per finished week', () => {
    const fresh = programState(HAMSTRING_PROGRAM, enrolment, [], '2026-03-02');
    expect(checkinDue(fresh, [])).toBe(0);
    expect(checkinDue(fresh, [{ week: 0 }])).toBeNull();
    const weekTwo = programState(
      HAMSTRING_PROGRAM,
      enrolment,
      [record(1, 1, '2026-03-02'), record(1, 2, '2026-03-04'), record(1, 3, '2026-03-06')],
      '2026-03-07',
    );
    expect(checkinDue(weekTwo, [{ week: 0 }])).toBe(1);
    expect(checkinDue(weekTwo, [{ week: 0 }, { week: 1 }])).toBeNull();
  });

  it('routes more-than-mild pain to guidance', () => {
    expect(checkinNeedsGuidance({ pain: 'more' })).toBe(true);
    expect(checkinNeedsGuidance({ pain: 'mild' })).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(checkinSchema.safeParse({ ...baseline, tightness: 11 }).success).toBe(false);
    expect(checkinSchema.safeParse({ ...baseline, toeTouch: 'moon' }).success).toBe(false);
  });
});

describe('schedule', () => {
  it('takes exactly three different days', () => {
    expect(flexWeekdaysSchema.safeParse([1, 3, 5]).success).toBe(true);
    expect(flexWeekdaysSchema.safeParse([1, 3]).success).toBe(false);
    expect(flexWeekdaysSchema.safeParse([1, 1, 3]).success).toBe(false);
  });
});

describe('isProgramOffered', () => {
  it('offers cleared always, pending only when allowed, blocked never', () => {
    expect(isProgramOffered('cleared', false)).toBe(true);
    expect(isProgramOffered('pending', false)).toBe(false);
    expect(isProgramOffered('pending', true)).toBe(true);
    expect(isProgramOffered('blocked', true)).toBe(false);
  });
});
