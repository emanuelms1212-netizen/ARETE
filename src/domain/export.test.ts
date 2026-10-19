import { describe, expect, it } from 'vitest';
import { exportForRange, rowDate } from './export';

describe('range exports', () => {
  const tables = {
    daily_plans: [
      { local_date: '2026-03-01', intention: 'a' },
      { local_date: '2026-03-10', intention: 'b' },
    ],
    focus_sessions: [{ localDate: '2026-03-12T00:00:00', id: 'f' }],
    preferences: [{ unit_system: 'metric' }],
    empty: [],
  };

  it('keeps dated rows inside the range and nothing else', () => {
    expect(exportForRange(tables, { from: '2026-03-05', to: '2026-03-31' })).toEqual({
      daily_plans: [{ local_date: '2026-03-10', intention: 'b' }],
      focus_sessions: [{ localDate: '2026-03-12T00:00:00', id: 'f' }],
    });
  });

  it('keeps everything in a full export', () => {
    expect(Object.keys(exportForRange(tables, null))).toEqual([
      'daily_plans',
      'focus_sessions',
      'preferences',
    ]);
  });

  it('finds the date whatever the adapter calls it', () => {
    expect(rowDate({ weekStart: '2026-03-02' })).toBe('2026-03-02');
    expect(rowDate({ title: 'x' })).toBeNull();
  });
});
