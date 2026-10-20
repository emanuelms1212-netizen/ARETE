import { beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMITS, resetRateLimits, takeToken } from './rate-limit';

describe('rate limit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit, then refuses with a wait', () => {
    const { limit } = RATE_LIMITS.export;
    for (let i = 0; i < limit; i += 1) expect(takeToken('export', 'a', 1000 + i).ok).toBe(true);
    const refused = takeToken('export', 'a', 2000);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each person and each action separately', () => {
    for (let i = 0; i < RATE_LIMITS.deleteAccount.limit; i += 1) takeToken('deleteAccount', 'a', 0);
    expect(takeToken('deleteAccount', 'a', 1).ok).toBe(false);
    expect(takeToken('deleteAccount', 'b', 1).ok).toBe(true);
    expect(takeToken('export', 'a', 1).ok).toBe(true);
  });

  it('frees up once the window has passed', () => {
    const { limit, windowMs } = RATE_LIMITS.deleteAccount;
    for (let i = 0; i < limit; i += 1) takeToken('deleteAccount', 'a', 0);
    expect(takeToken('deleteAccount', 'a', windowMs + 1).ok).toBe(true);
  });
});
