// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_PACKS, CONTENT_SOURCES, seedContent, seedDemoAccount } from './seed';
import { DEMO_TODAY, DEMO_USER_ID } from './demo-data';
import { createSqlRepository } from './sql-repository';
import type { SqlExecutor } from './sql-executor';
import { createTestDatabase, type TestDatabase } from './testing/test-database';

let database: TestDatabase;
let executor: SqlExecutor;

beforeAll(async () => {
  database = await createTestDatabase();
  executor = { query: (text, params) => database.db.query(text, params ? [...params] : undefined) };
  await database.asOwner();
  await seedContent(executor);
  await seedDemoAccount(executor);
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe('the seed', () => {
  it('records every source document from the source map', async () => {
    const rows = await database.db.query<{ slug: string }>(
      `select slug from public.content_sources order by slug`,
    );
    expect(rows.rows.map((row) => row.slug).sort()).toEqual(
      CONTENT_SOURCES.map((source) => source.slug).sort(),
    );
  });

  it('carries the rights position into the database, not only into a document', async () => {
    const rows = await database.db.query<{ slug: string; licence: string }>(
      `select slug, licence from public.content_sources`,
    );
    const licences = new Map(rows.rows.map((row) => [row.slug, row.licence]));

    expect(licences.get('total-flexibility')).toBe('third-party-permission-granted');
    expect(licences.get('seed-oil-guide')).toBe('third-party-no-redistribution');
    expect(licences.get('jewish-meditation')).toBe('public-domain');
  });

  it('ships the flexibility programme cleared, with the permission on record', async () => {
    const rows = await database.db.query<{ rights_status: string; rights_note: string }>(
      `select rights_status, rights_note from public.flexibility_programs
        where slug = 'hamstring-mobility' and user_id is null`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.rights_status).toBe('cleared');
    expect(rows.rows[0]?.rights_note).toMatch(/permission/);
  });

  it('never changes a programme’s rights on a re-seed, and never duplicates it', async () => {
    // Rights belong to the product owner, in the database (D78). A re-seed
    // must not undo a decision made there — in either direction.
    await database.db.query(
      `update public.flexibility_programs set rights_status = 'blocked'
        where slug = 'hamstring-mobility' and user_id is null`,
    );
    await seedContent(executor);
    const rows = await database.db.query<{ rights_status: string }>(
      `select rights_status from public.flexibility_programs where slug = 'hamstring-mobility'`,
    );
    expect(rows.rows.map((row) => row.rights_status)).toEqual(['blocked']);
    await database.db.query(
      `update public.flexibility_programs set rights_status = 'cleared'
        where slug = 'hamstring-mobility' and user_id is null`,
    );
  });

  it('marks the packs that may never be enabled by default', async () => {
    const rows = await database.db.query<{
      slug: string;
      requires_explicit_choice: boolean;
      requires_safety_acknowledgement: boolean;
    }>(
      `select slug, requires_explicit_choice, requires_safety_acknowledgement from public.content_packs`,
    );
    const packs = new Map(rows.rows.map((row) => [row.slug, row]));

    expect(packs.get('jewish-meditation')?.requires_explicit_choice).toBe(true);
    expect(packs.get('contrast-therapy')?.requires_safety_acknowledgement).toBe(true);
    expect(packs.size).toBe(CONTENT_PACKS.length);
  });

  it('ships no quote with an author it has not verified', async () => {
    const rows = await database.db.query<{ count: number }>(
      `select count(*)::int as count from public.quotes
        where author is not null and attribution_status <> 'verified-public-domain'`,
    );
    expect(rows.rows[0]?.count).toBe(0);
  });

  it('gives the seeded database the same demo day the in-memory repository serves', async () => {
    await database.asUser(DEMO_USER_ID);
    const day = await createSqlRepository(executor).getDay(DEMO_USER_ID, DEMO_TODAY);

    expect(day?.date).toBe(DEMO_TODAY);
    expect(day?.commitments.map((commitment) => commitment.title)).toEqual([
      'Sit for ten minutes',
      'One focus block on the report',
      'Read ten pages',
      'Hamstrings, week 2 day 1',
      'Lower body',
    ]);
    expect(day?.commitments.find((c) => c.status === 'skipped')?.skipReason).toBe('Slept badly');
  });

  it('is idempotent — running it twice changes nothing', async () => {
    await database.asOwner();
    const before = await database.db.query<{ count: number }>(
      `select (select count(*) from public.content_sources)
            + (select count(*) from public.content_packs)
            + (select count(*) from public.daily_plan_items)
            + (select count(*) from public.quotes) as count`,
    );

    await seedContent(executor);
    await seedDemoAccount(executor);

    const after = await database.db.query<{ count: number }>(
      `select (select count(*) from public.content_sources)
            + (select count(*) from public.content_packs)
            + (select count(*) from public.daily_plan_items)
            + (select count(*) from public.quotes) as count`,
    );

    expect(Number(after.rows[0]?.count)).toBe(Number(before.rows[0]?.count));
  });
});
