import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * A real Postgres, in process, for the authorization tests.
 *
 * PGlite is Postgres 18 compiled to WebAssembly — not a mock and not an
 * emulation, so row-level security behaves exactly as it will on Supabase.
 * That matters: "one user cannot read another's data" is the kind of claim that
 * is worthless unless something actually tries.
 *
 * No Supabase project, no network and no credentials are involved.
 */
export interface TestDatabase {
  readonly db: PGlite;
  /** Run the rest of the test as this user, through the `authenticated` role. */
  asUser(userId: string): Promise<void>;
  /** Drop back to the owner role, which bypasses policies. Setup only. */
  asOwner(): Promise<void>;
  close(): Promise<void>;
}

function sqlFile(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), 'utf8');
}

export function migrationFilenames(): string[] {
  return readdirSync(resolve(process.cwd(), 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

/** Applies the auth shim and then every migration, in order, from nothing. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create();

  await db.exec(sqlFile('supabase/test/0000_auth_shim.sql'));
  for (const name of migrationFilenames()) {
    await db.exec(sqlFile('supabase/migrations', name));
  }

  return {
    db,
    async asUser(userId: string) {
      await db.exec('reset role');
      await db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
      await db.exec('set role authenticated');
    },
    async asOwner() {
      await db.exec('reset role');
      await db.exec(`set request.jwt.claims = ''`);
    },
    async close() {
      await db.close();
    },
  };
}

export const USER_A = '11111111-1111-1111-1111-111111111111';
export const USER_B = '22222222-2222-2222-2222-222222222222';

/**
 * Two accounts with one row in every user-owned table, so that an isolation
 * test has something to fail on. Deliberately written as the owner, bypassing
 * policies — the point is to put B's data where A might reach it.
 */
export async function seedTwoUsers(database: TestDatabase): Promise<void> {
  const { db } = database;
  await database.asOwner();

  for (const [id, email] of [
    [USER_A, 'a@example.test'],
    [USER_B, 'b@example.test'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    await db.query('insert into public.profiles (id, display_name, timezone) values ($1, $2, $3)', [
      id,
      email === 'a@example.test' ? 'A' : 'B',
      'Europe/London',
    ]);
    await db.query('insert into public.preferences (user_id) values ($1)', [id]);
    await db.query('insert into public.notification_preferences (user_id) values ($1)', [id]);
    await db.query('insert into public.goals (user_id, title, why) values ($1, $2, $3)', [
      id,
      `${email} goal`,
      'because',
    ]);
    await db.query(
      `insert into public.daily_plans (user_id, local_date, timezone, committed_at)
       values ($1, '2026-03-16', 'Europe/London', now())`,
      [id],
    );
    await db.query(
      `insert into public.daily_plan_items (user_id, daily_plan_id, kind, title_snapshot, is_minimum)
       select $1, dp.id, 'habit', $2, true from public.daily_plans dp
       where dp.user_id = $1 and dp.local_date = '2026-03-16'`,
      [id, `${email} commitment`],
    );
    await db.query(
      `insert into public.journal_entries (user_id, local_date, timezone, kind, body)
       values ($1, '2026-03-16', 'Europe/London', 'evening_review', $2)`,
      [id, `${email} private reflection`],
    );
    await db.query(
      `insert into public.focus_sessions
         (user_id, local_date, timezone, planned_minutes, started_at, ended_at, actual_seconds, status, client_token)
       values ($1, '2026-03-16', 'Europe/London', 25, now(), now(), 1500, 'completed', $2)`,
      [id, `seed-${id}`],
    );
  }

  await database.asOwner();
}
