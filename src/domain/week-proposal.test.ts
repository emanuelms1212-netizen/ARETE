import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS_PER_DAY,
  MAX_TASKS_PER_DAY,
  proposeWeek,
  type ProposalInputs,
} from './week-proposal';

const base: ProposalInputs = {
  weekStart: '2026-03-23', // Monday
  availableWeekdays: [1, 2, 3, 4, 5, 6],
  tasks: [],
  habits: [],
  sessions: [],
  flexibilityWeekdays: [],
  existing: {},
};

describe('the proposed week', () => {
  it('places training from the plan and recovery after two days in a row', () => {
    const { days } = proposeWeek({
      ...base,
      sessions: [
        { weekday: 1, title: 'Full body A' },
        { weekday: 2, title: 'Full body B' },
        { weekday: 4, title: 'Full body C' },
      ],
    });
    expect(days[0]!.items.map((i) => i.title)).toEqual(['Full body A']);
    expect(days[2]!.items.map((i) => i.title)).toEqual(['Easy walk or mobility']);
    expect(days[3]!.items.map((i) => i.title)).toEqual(['Full body C']);
  });

  it('spreads tasks, soonest due first, never more than two a day', () => {
    const tasks = Array.from({ length: 9 }, (_, n) => ({
      id: `t${n}`,
      title: `Task ${n}`,
      dueDate: n === 8 ? '2026-03-23' : null,
      priority: 0,
    }));
    const { days, unplaced } = proposeWeek({ ...base, tasks });
    expect(days[0]!.items[0]!.title).toBe('Task 8');
    for (const day of days) {
      expect(day.items.filter((i) => i.kind === 'task').length).toBeLessThanOrEqual(
        MAX_TASKS_PER_DAY,
      );
    }
    // Sunday is not available, so nothing lands there.
    expect(days[6]!.items).toEqual([]);
    expect(days[6]!.note).toMatch(/not free/);
    expect(unplaced).toEqual([]);
  });

  it('names what does not fit rather than dropping it quietly', () => {
    const tasks = Array.from({ length: 15 }, (_, n) => ({
      id: `t${n}`,
      title: `Task ${n}`,
      dueDate: null,
      priority: 0,
    }));
    const { unplaced } = proposeWeek({ ...base, tasks });
    expect(unplaced).toHaveLength(3);
  });

  it('caps a day at five things and skips what is already there', () => {
    const { days } = proposeWeek({
      ...base,
      habits: Array.from({ length: 7 }, (_, n) => ({ id: `h${n}`, title: `Habit ${n}` })),
      existing: { '2026-03-23': [{ kind: 'habit', title: 'Habit 0' }] },
    });
    expect(days.every((day) => day.items.length <= MAX_ITEMS_PER_DAY)).toBe(true);
    expect(days[0]!.items.map((i) => i.title)).not.toContain('Habit 0');
    expect(days[1]!.note).toMatch(/Full enough/);
  });

  it('does not propose a task already on another day of the week', () => {
    const { days, unplaced } = proposeWeek({
      ...base,
      tasks: [{ id: 't', title: 'Call the bank', dueDate: null, priority: 0 }],
      existing: { '2026-03-27': [{ kind: 'task', title: 'Call the bank' }] },
    });
    expect(days.flatMap((day) => day.items)).toEqual([]);
    expect(unplaced).toEqual([]);
  });

  it('gives every item a stable id, so a confirmation can name exactly what to add', () => {
    const one = proposeWeek({ ...base, habits: [{ id: 'h', title: 'Read' }] });
    const two = proposeWeek({ ...base, habits: [{ id: 'h', title: 'Read' }] });
    expect(one.days[0]!.items[0]!.id).toBe('2026-03-23:habit:h');
    expect(one).toEqual(two);
  });
});
