/**
 * Idempotency keys for writes a flaky connection might repeat.
 *
 * A focus timer that finishes while the phone is switching networks must record
 * one session, not three. Every table that logs an event carries
 * `unique (user_id, client_token)`, and the token is derived from what the
 * write *is* rather than from when it was sent — so a retry produces the same
 * token and the database rejects the duplicate.
 */

/** Characters that keep the token readable in a log line and safe in a URL. */
const SAFE = /[^a-zA-Z0-9:_-]/g;

export function clientToken(kind: string, ...parts: readonly (string | number)[]): string {
  const tail = parts
    .map((part) => String(part).trim().toLowerCase().replace(SAFE, '-'))
    .filter((part) => part.length > 0)
    .join(':');

  if (tail.length === 0) {
    throw new Error(`clientToken("${kind}") needs at least one identifying part`);
  }

  return `${kind.replace(SAFE, '-')}:${tail}`.slice(0, 200);
}

/**
 * The token for a focus session.
 *
 * Keyed on when it *started*, not when it ended: the start is fixed the moment
 * the user presses go, so every retry of the same session agrees on it.
 */
export function focusSessionToken(userId: string, startedAt: Date): string {
  return clientToken('focus', userId, startedAt.toISOString());
}

/** One habit log per habit per local day, by construction. */
export function habitLogToken(habitId: string, localDate: string): string {
  return clientToken('habit', habitId, localDate);
}

/** One row per set of one exercise on one day. */
export function workoutSetToken(exerciseId: string, localDate: string, setIndex: number): string {
  return clientToken('set', exerciseId, localDate, setIndex);
}
