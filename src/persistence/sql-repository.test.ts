// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeRepositoryContract } from './repository-contract';
import { seedContent } from './seed';
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

  // The practice catalogue and the content packs are library content, seeded
  // rather than migrated. Without them the Mind contract has nothing to offer,
  // and the pack rule has nothing to hide.
  await database.asOwner();
  await seedContent({
    query: (text, params) => database.db.query(text, params ? [...params] : undefined),
  });
}, 120_000);

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

/**
 * The rights gate, against the database. Rights are read from the row, not
 * from code (ledger D78), so this flips the row and checks that the repository
 * follows it: a pending programme is hidden unless the caller allows it, and
 * cannot be enrolled in. It restores the row afterwards.
 */
describe('sql: the flexibility rights gate follows the database', () => {
  const executor: SqlExecutor = {
    query: (text, params) => database.db.query(text, params ? [...params] : undefined),
  };
  const repository = createSqlRepository(executor);

  async function setRights(status: 'cleared' | 'pending' | 'blocked') {
    await database.asOwner();
    await database.db.query(
      `update public.flexibility_programs set rights_status = $1
        where slug = 'hamstring-mobility' and user_id is null`,
      [status],
    );
    await database.asUser(USER_A);
  }

  afterAll(async () => {
    await setRights('cleared');
  });

  it('hides a pending programme unless the caller allows it', async () => {
    await setRights('pending');
    expect(await repository.listFlexPrograms(USER_A, { includeRightsPending: false })).toEqual([]);
    const allowed = await repository.listFlexPrograms(USER_A, { includeRightsPending: true });
    expect(allowed[0]?.rightsStatus).toBe('pending');
    await expect(
      repository.enrolFlex(USER_A, {
        programSlug: 'hamstring-mobility',
        startedOn: '2026-03-02',
        weekdays: [1, 3, 5],
        at: new Date('2026-03-02T07:00:00Z'),
        includeRightsPending: false,
      }),
    ).rejects.toThrow(/not available/);
  });

  it('never offers a blocked programme, even in demo mode', async () => {
    await setRights('blocked');
    expect(await repository.listFlexPrograms(USER_A, { includeRightsPending: true })).toEqual([]);
  });
});
