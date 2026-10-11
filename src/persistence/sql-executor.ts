/**
 * The only thing the SQL repository needs from a database driver.
 *
 * Keeping it this small means the same repository runs against an in-process
 * Postgres in the tests and against Supabase's Postgres in production, with no
 * branch between them. Both `pg` and PGlite already satisfy this shape.
 */
export interface SqlExecutor {
  query<TRow = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: TRow[] }>;
}

/**
 * An executor that can also run a multi-statement script.
 *
 * `query` speaks the extended protocol, which carries parameters but accepts
 * exactly one statement — a migration file is many. This is deployment-only:
 * nothing on the request path runs a script, and nothing here takes parameters,
 * so there is no injection surface to widen.
 */
export interface ScriptExecutor extends SqlExecutor {
  execScript(sql: string): Promise<void>;
}

/**
 * Runs `work` with the session identified as `userId`.
 *
 * Row-level security is the real boundary, and it reads the request's JWT
 * claims. A pooled connection is shared, so the claim has to be set inside the
 * transaction that uses it and cleared afterwards — `set local` does both.
 */
export async function asUser<T>(
  executor: SqlExecutor,
  userId: string,
  work: (executor: SqlExecutor) => Promise<T>,
): Promise<T> {
  await executor.query('begin');
  try {
    await executor.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId }),
    ]);
    const result = await work(executor);
    await executor.query('commit');
    return result;
  } catch (error) {
    await executor.query('rollback');
    throw error;
  }
}
