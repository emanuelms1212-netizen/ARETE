import { describe, expect, it } from 'vitest';
import { addDays } from './local-day';
import {
  RESET_COMPONENTS,
  RESET_MINIMUM,
  RESET_PHASES,
  adjustIntensity,
  breakProblem,
  dateOfProgramDay,
  isEnabled,
  phaseFor,
  programLength,
  resetCustomisationSchema,
  resetDayState,
  resetSummary,
  resetTargets,
  type ResetBreak,
  type ResetPersonInputs,
} from './reset-program';

const person: ResetPersonInputs = {
  weightKg: 70,
  environment: 'temperate',
  experience: 'returning',
  sessionMinutes: 40,
  mindExperience: 'some',
  busyWeekdays: false,
  recoveryFlag: false,
};
const custom = (input: object = {}) => resetCustomisationSchema.parse(input);
const target = (
  day: number,
  component: string,
  p = person,
  c = custom(),
  mode?: 'travel' | 'minimum',
) => resetTargets(day, p, c, mode).find((entry) => entry.component === component);

describe('the reset template', () => {
  it('is sixty days, with the source’s last six as an optional extension week', () => {
    expect(programLength(custom())).toBe(60);
    expect(programLength(custom({ includeExtension: true }))).toBe(66);
    // The phases tile 1–66 with no gap and no overlap.
    const days = RESET_PHASES.flatMap((phase) =>
      Array.from({ length: phase.to - phase.from + 1 }, (_, i) => phase.from + i),
    );
    expect(days).toEqual(Array.from({ length: 66 }, (_, i) => i + 1));
    expect(phaseFor(61).name).toBe('Extension week');
  });

  it('keeps cold and the social-media cap off unless chosen, and imposes no wake time', () => {
    const c = custom();
    expect(isEnabled('cold', c)).toBe(false);
    expect(isEnabled('screen', c)).toBe(false);
    expect(isEnabled('wake', c)).toBe(false);
    const components = resetTargets(1, person, c).map((entry) => entry.component);
    expect(components).not.toContain('cold');
    expect(components).not.toContain('screen');
    expect(components).not.toContain('wake');
    expect(isEnabled('wake', custom({ wakeTime: '07:30' }))).toBe(true);
  });
});

describe('suggested ranges', () => {
  it('never prescribe the source’s 4 L of water or two-hour sessions', () => {
    for (let day = 1; day <= 66; day += 1) {
      const water = target(day, 'hydration')!;
      expect(water.range!.max).toBeLessThanOrEqual(3.5);
      const movement = target(
        day,
        'movement',
        { ...person, sessionMinutes: 120, experience: 'experienced' },
        custom({ intensity: 2 }),
      )!;
      expect(movement.range!.max).toBeLessThanOrEqual(90);
    }
  });

  it('follow body size and climate', () => {
    const small = target(10, 'hydration', { ...person, weightKg: 50 })!.range!;
    const large = target(10, 'hydration', { ...person, weightKg: 90 })!.range!;
    expect(small.max).toBeLessThan(large.max);
    const hot = target(10, 'hydration', person, custom({ environment: 'hot' }))!.range!;
    expect(hot.min).toBeCloseTo(target(10, 'hydration')!.range!.min + 0.5, 5);
    // No weigh-in: a general range, and it says so.
    const general = target(10, 'hydration', { ...person, weightKg: null })!;
    expect(general.range).toEqual({ min: 1.5, max: 2.5 });
    expect(general.why).toMatch(/weigh-in/);
  });

  it('follow schedule, experience and recovery', () => {
    const base = target(30, 'movement')!.range!;
    expect(target(30, 'movement', { ...person, experience: 'new' })!.range!.max).toBeLessThan(
      base.max,
    );
    expect(
      target(30, 'movement', { ...person, recoveryFlag: true })!.range!.max,
    ).toBeLessThanOrEqual(30);
    expect(target(30, 'study', { ...person, busyWeekdays: true })!.range!.max).toBeLessThan(
      target(30, 'study')!.range!.max,
    );
    expect(target(30, 'meditation', { ...person, mindExperience: 'new' })!.range!.max).toBeLessThan(
      target(30, 'meditation', { ...person, mindExperience: 'regular' })!.range!.max,
    );
  });

  it('ease in: the first block is smaller than the third', () => {
    expect(target(1, 'movement')!.range!.max).toBeLessThan(target(30, 'movement')!.range!.max);
    expect(target(1, 'reading')!.range!.max).toBeLessThan(target(30, 'reading')!.range!.max);
  });

  it('take the person’s own range wherever they set one', () => {
    const own = custom({ ranges: { reading: { min: 3, max: 4 } } });
    for (const day of [1, 30, 60]) {
      expect(target(day, 'reading', person, own)).toMatchObject({
        range: { min: 3, max: 4 },
        custom: true,
        text: '3–4 pages',
      });
    }
  });

  it('move with intensity, ten per cent a step', () => {
    const easier = target(30, 'reading', person, custom({ intensity: -2 }))!.range!;
    const harder = target(30, 'reading', person, custom({ intensity: 2 }))!.range!;
    expect(easier.max).toBeLessThan(harder.max);
  });

  it('shrink to the essentials on a minimum day, and travel light', () => {
    const minimum = resetTargets(30, person, custom({ wakeTime: '07:00' }), 'minimum');
    expect(minimum.map((entry) => entry.component).filter((c) => c !== 'wake')).toEqual(
      RESET_MINIMUM.filter((c) => minimum.some((entry) => entry.component === c)),
    );
    expect(minimum.find((entry) => entry.component === 'movement')!.range).toEqual({
      min: 10,
      max: 10,
    });
    expect(target(30, 'movement', person, custom(), 'travel')!.range!.max).toBeLessThanOrEqual(30);
  });

  it('put a wake window around the person’s own time and a weekly reflection every seventh day', () => {
    expect(target(3, 'wake', person, custom({ wakeTime: '07:30' }))!.text).toBe('07:00–08:00');
    expect(target(7, 'weekly')).toBeDefined();
    expect(target(8, 'weekly')).toBeUndefined();
  });

  it('cover every component the template knows', () => {
    const all = custom({
      wakeTime: '07:00',
      enabled: { cold: true, screen: true },
    });
    const seen = new Set(resetTargets(7, person, all).map((entry) => entry.component));
    expect([...seen].sort()).toEqual([...RESET_COMPONENTS].sort());
  });
});

describe('the programme clock', () => {
  const start = '2026-03-02';
  const length = 60;

  it('counts one programme day per calendar day with no breaks', () => {
    for (let offset = 0; offset < 70; offset += 1) {
      const state = resetDayState(start, length, [], addDays(start, offset));
      if (offset < 60)
        expect(state).toEqual({ kind: 'active', programDay: offset + 1, mode: 'normal' });
      else expect(state.kind).toBe('complete');
    }
    expect(resetDayState(start, length, [], '2026-03-01')).toEqual({
      kind: 'not_started',
      startsIn: 1,
    });
  });

  it('stops for a pause and resumes where it left off', () => {
    const breaks: ResetBreak[] = [{ id: 'p', kind: 'pause', from: '2026-03-10', to: '2026-03-12' }];
    expect(resetDayState(start, length, breaks, '2026-03-09')).toMatchObject({ programDay: 8 });
    expect(resetDayState(start, length, breaks, '2026-03-11')).toMatchObject({
      kind: 'paused',
      programDay: 8,
    });
    expect(resetDayState(start, length, breaks, '2026-03-13')).toMatchObject({
      kind: 'active',
      programDay: 9,
    });
  });

  it('keeps running through travel, in travel mode', () => {
    const breaks: ResetBreak[] = [
      { id: 't', kind: 'travel', from: '2026-03-05', to: '2026-03-06' },
    ];
    expect(resetDayState(start, length, breaks, '2026-03-05')).toEqual({
      kind: 'active',
      programDay: 4,
      mode: 'travel',
    });
    expect(resetDayState(start, length, breaks, '2026-03-07')).toMatchObject({
      programDay: 6,
      mode: 'normal',
    });
  });

  it('never corrupts the schedule: no day skipped, none repeated, the past unchanged', () => {
    const breaks: ResetBreak[] = [
      { id: 't', kind: 'travel', from: '2026-03-05', to: '2026-03-08' },
      { id: 'p', kind: 'pause', from: '2026-03-15', to: '2026-03-20' },
      { id: 's', kind: 'sick', from: '2026-04-01', to: null },
    ];
    const before = Array.from({ length: 13 }, (_, i) =>
      resetDayState(start, length, [], addDays(start, i)),
    );
    const after = Array.from({ length: 13 }, (_, i) =>
      resetDayState(start, length, breaks, addDays(start, i)),
    );
    // Days before the first clock-stop keep their numbers when breaks are added later.
    expect(after.map((s) => ('programDay' in s ? s.programDay : 0))).toEqual(
      before.map((s) => ('programDay' in s ? s.programDay : 0)),
    );

    const active: number[] = [];
    for (let offset = 0; offset < 120; offset += 1) {
      const state = resetDayState(start, length, breaks, addDays(start, offset));
      if (state.kind === 'active') active.push(state.programDay);
    }
    // Every programme day up to the open sick spell appears exactly once, in order.
    expect(active).toEqual(Array.from({ length: active.length }, (_, i) => i + 1));
  });

  it('maps programme days back to dates, around the breaks', () => {
    const breaks: ResetBreak[] = [{ id: 'p', kind: 'pause', from: '2026-03-04', to: '2026-03-05' }];
    expect(dateOfProgramDay(start, breaks, 2)).toBe('2026-03-03');
    expect(dateOfProgramDay(start, breaks, 3)).toBe('2026-03-06');
    for (let day = 1; day <= 60; day += 1) {
      const date = dateOfProgramDay(start, breaks, day);
      expect(resetDayState(start, length, breaks, date)).toMatchObject({ programDay: day });
    }
  });

  it('refuses a break in the past, one that overlaps, and travel with no end', () => {
    const breaks: ResetBreak[] = [{ id: 'p', kind: 'pause', from: '2026-03-10', to: '2026-03-12' }];
    expect(
      breakProblem(breaks, { kind: 'pause', from: '2026-03-01', to: null }, '2026-03-05'),
    ).toMatch(/today or later/);
    expect(
      breakProblem(breaks, { kind: 'travel', from: '2026-03-11', to: '2026-03-14' }, '2026-03-05'),
    ).toMatch(/overlaps/);
    expect(
      breakProblem(breaks, { kind: 'travel', from: '2026-03-20', to: null }, '2026-03-05'),
    ).toMatch(/end date/);
    expect(
      breakProblem(breaks, { kind: 'travel', from: '2026-03-13', to: '2026-03-15' }, '2026-03-05'),
    ).toBeNull();
  });
});

describe('weekly adjustment and the finish', () => {
  it('moves intensity a step at a time, never past two', () => {
    expect(adjustIntensity(0, 'harder')).toBe(1);
    expect(adjustIntensity(2, 'harder')).toBe(2);
    expect(adjustIntensity(-2, 'easier')).toBe(-2);
    expect(adjustIntensity(1, 'same')).toBe(1);
  });

  it('summarises what was done, as counts', () => {
    const summary = resetSummary(
      [
        {
          localDate: '2026-03-02',
          programDay: 1,
          component: 'reading',
          status: 'done',
          targetText: '',
        },
        {
          localDate: '2026-03-02',
          programDay: 1,
          component: 'movement',
          status: 'done',
          targetText: '',
        },
        {
          localDate: '2026-03-03',
          programDay: 2,
          component: 'reading',
          status: 'skipped',
          targetText: '',
        },
      ],
      60,
    );
    expect(summary.daysWithSomething).toBe(1);
    expect(summary.byComponent).toEqual([
      { component: 'movement', done: 1 },
      { component: 'reading', done: 1 },
    ]);
  });
});
