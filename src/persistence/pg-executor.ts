import { Pool, type PoolConfig } from 'pg';
import type { SqlExecutor } from './sql-executor';

/**
 * The production executor: a pooled Postgres connection.
 *
 * Supabase is Postgres, so the repository that the tests exercise against an
 * in-process Postgres is the same code that runs here. There is no second
 * implementation to keep in step and nothing that only exists in production.
 *
 * Connect through the **pooler** URL with the `anon` role for request-scoped
 * work, so that row-level security applies. The service-role connection string
 * bypasses RLS entirely and belongs only to migrations and the seed.
 */
export interface PgExecutor extends SqlExecutor {
  /** Runs `work` with the session identified as `userId`, inside a transaction. */
  withUser<T>(userId: string, work: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

export function createPgExecutor(config: PoolConfig | string): PgExecutor {
  const pool =
    typeof config === 'string' ? new Pool({ connectionString: config }) : new Pool(config);

  return {
    async query(text, params) {
      const result = await pool.query(text, params ? [...params] : undefined);
      return { rows: result.rows };
    },

    async withUser(userId, work) {
      // A single client for the whole unit of work: `set_config(..., true)` is
      // transaction-local, so the claim cannot leak to the next borrower of a
      // pooled connection.
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId }),
        ]);

        const scoped: SqlExecutor = {
          async query(text, params) {
            const result = await client.query(text, params ? [...params] : undefined);
            return { rows: result.rows };
          },
        };

        const value = await work(scoped);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async end() {
      await pool.end();
    },
  };
}
