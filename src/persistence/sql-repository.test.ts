// @vitest-environment node
import { afterAll, beforeAll } from 'vitest';
import { describeRepositoryContract } from './repository-contract';
import { createSqlRepository } from './sql-repository';
import type { SqlExecutor } from './sql-executor';
import { USER_A, createTestDatabase, type TestDatabase } from './testing/test-database';

/**
 * The SQL repository, held to the same contract as the demo one — and held to
 * it *through row-level security*, as the `authenticated` role with the user's
 * claims set. So these tests prove three things at once: the SQL is right, the
 * two adapters agree, and the policies do not block the app's own legitimate
 * writes. A policy that is too strict fails here just as loudly as one that is
 * too loose fails in rls.test.ts.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describeRepositoryContract('sql', async () => {
  const executor: SqlExecutor = {
    query: (text, params) => database.db.query(text, params ? [...params] : undefined),
  };

  return {
    repository: createSqlRepository(executor),
    userId: USER_A,
    async reset() {
      await database.asOwner();
      await database.db.query('delete from auth.users');
      await database.db.query('insert into auth.users (id, email) values ($1, $2)', [
        USER_A,
        'a@example.test',
      ]);
      await database.db.query('insert into public.profiles (id, timezone) values ($1, $2)', [
        USER_A,
        'Europe/London',
      ]);
      await database.asUser(USER_A);
    },
  };
});
