import { describe, expect, it } from 'vitest';
import { clientToken, focusSessionToken, habitLogToken, workoutSetToken } from './idempotency';

describe('idempotency keys', () => {
  it('gives the same token for the same write, so a retry is a no-op', () => {
    const startedAt = new Date('2026-03-16T09:00:00.000Z');
    expect(focusSessionToken('user-1', startedAt)).toBe(focusSessionToken('user-1', startedAt));
  });

  it('gives different tokens to genuinely different writes', () => {
    const a = focusSessionToken('user-1', new Date('2026-03-16T09:00:00.000Z'));
    const b = focusSessionToken('user-1', new Date('2026-03-16T09:30:00.000Z'));
    const c = focusSessionToken('user-2', new Date('2026-03-16T09:00:00.000Z'));

    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('keys a habit log to its habit and local day', () => {
    expect(habitLogToken('habit-1', '2026-03-16')).toBe('habit:habit-1:2026-03-16');
    expect(habitLogToken('habit-1', '2026-03-17')).not.toBe(habitLogToken('habit-1', '2026-03-16'));
  });

  it('keys a workout set to its exercise, day and set number', () => {
    expect(workoutSetToken('ex-1', '2026-03-16', 2)).toBe('set:ex-1:2026-03-16:2');
  });

  it('strips anything that would be unsafe in a URL or unreadable in a log', () => {
    expect(clientToken('focus', 'user 1', 'a/b?c')).toBe('focus:user-1:a-b-c');
  });

  it('refuses a token with nothing identifying in it', () => {
    expect(() => clientToken('focus', '', '  ')).toThrow(/identifying/);
  });

  it('stays within the column it is stored in', () => {
    expect(clientToken('focus', 'x'.repeat(500)).length).toBeLessThanOrEqual(200);
  });
});
