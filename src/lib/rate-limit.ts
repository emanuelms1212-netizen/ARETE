/**
 * A small per-person rate limit for expensive or destructive actions:
 * exporting everything, deleting data.
 *
 * In memory, per server instance, so it is a speed bump rather than a wall:
 * it stops a stuck client or a script from hammering one instance, and it is
 * documented as such in docs/THREAT_MODEL.md. A shared store is the upgrade
 * once there is more than one instance in front of real accounts.
 */
export interface RateLimit {
  readonly limit: number;
  readonly windowMs: number;
}

export const RATE_LIMITS = {
  // Generous enough for a person checking their own export a few times over;
  // tight enough that a loop stands out.
  export: { limit: 20, windowMs: 10 * 60_000 },
  deleteFeature: { limit: 20, windowMs: 10 * 60_000 },
  deleteAccount: { limit: 5, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimit>;
export type RateLimitedAction = keyof typeof RATE_LIMITS;

const hits = new Map<string, number[]>();

/** Records an attempt and says whether it is allowed. `now` is injectable for tests. */
export function takeToken(
  action: RateLimitedAction,
  userId: string,
  now: number = Date.now(),
): { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number } {
  const { limit, windowMs } = RATE_LIMITS[action];
  const key = `${action}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((recent[0]! + windowMs - now) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** For tests only. */
export function resetRateLimits(): void {
  hits.clear();
}
