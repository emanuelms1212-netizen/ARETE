// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checksumOf } from './migrator';
import {
  USER_A,
  USER_B,
  applyMigrationsTo,
  createTestDatabase,
  migrationFilenames,
  seedTwoUsers,
  type TestDatabase,
} from './testing/test-database';

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
  await seedTwoUsers(database);
}, 60_000);

afterAll(async () => {
  await database?.close();
});

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const result = await database.db.query<T>(sql, params);
  return result.rows;
}

describe('migrations', () => {
  it('apply exactly once, so a second db:migrate is a no-op', async () => {
    // `db:migrate` is run on every deploy. Before the ledger existed it
    // replayed the whole directory, and the early migrations create tables
    // unconditionally — so the second run failed. This asserts the fix through
    // the production runner rather than a copy of it.
    const result = await applyMigrationsTo(database);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(migrationFilenames());
  }, 120_000);

  it('refuse to run when an applied migration has since been edited', async () => {
    // A quiet divergence between the database and the repository is the kind
    // of thing found during an incident. It is found here instead.
    await database.asOwner();
    await database.db.exec(
      `update public.schema_migrations set checksum = 'tampered'
         where filename = '0001_foundation.sql'`,
    );

    await expect(applyMigrationsTo(database)).rejects.toThrow(/0001_foundation\.sql/);

    // Restore it, because the other tests share this database.
    await database.db.query(
      `update public.schema_migrations set checksum = $1 where filename = $2`,
      [
        checksumOf(readFileSync(resolve('supabase/migrations/0001_foundation.sql'), 'utf8')),
        '0001_foundation.sql',
      ],
    );
  }, 120_000);

  it('apply from zero', async () => {
    expect(migrationFilenames().length).toBeGreaterThan(0);
    const tables = await rows<{ count: number }>(
      `select count(*)::int as count from pg_tables where schemaname = 'public'`,
    );
    expect(tables[0]?.count).toBeGreaterThanOrEqual(36);
  });

  it('model every table the brief asks for', async () => {
    const required = [
      'profiles',
      'preferences',
      'onboarding_answers',
      'goals',
      'milestones',
      'projects',
      'tasks',
      'task_occurrences',
      'habits',
      'habit_schedules',
      'habit_logs',
      'daily_plans',
      'focus_sessions',
      'meditation_sessions',
      'breathwork_sessions',
      'cognitive_sessions',
      'exercises',
      'exercise_animation_assets',
      'workout_plans',
      'workout_days',
      'workout_exercises',
      'workout_logs',
      'flexibility_programs',
      'flexibility_sessions',
      'nutrition_targets',
      'foods',
      'meals',
      'food_entries',
      'body_metrics',
      'journal_entries',
      'quotes',
      'content_packs',
      'content_sources',
      'safety_acknowledgements',
      'notification_preferences',
      'analytics_events',
    ];

    const present = new Set(
      (
        await rows<{ tablename: string }>(
          `select tablename from pg_tables where schemaname = 'public'`,
        )
      ).map((row) => row.tablename),
    );

    for (const table of required) {
      expect(present.has(table), `${table} is missing`).toBe(true);
    }
  });
});

describe('row-level security', () => {
  it('is enabled and forced on every table — none can be forgotten', async () => {
    const unprotected = await rows<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and (c.relrowsecurity = false or c.relforcerowsecurity = false)`,
    );

    expect(unprotected.map((row) => row.relname)).toEqual([]);
  });

  it('gives every table at least one policy', async () => {
    const without = await rows<{ tablename: string }>(
      `select t.tablename
         from pg_tables t
        where t.schemaname = 'public'
          and not exists (
            select 1 from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.tablename
          )`,
    );

    expect(without.map((row) => row.tablename)).toEqual([]);
  });
});

describe("one user cannot reach another user's data", () => {
  const ownedTables = [
    'preferences',
    'goals',
    'daily_plans',
    'daily_plan_items',
    'journal_entries',
    'focus_sessions',
    'notification_preferences',
  ];

  it('sees only its own rows, in every owned table', async () => {
    await database.asUser(USER_A);

    for (const table of ownedTables) {
      const visible = await rows<{ user_id: string | null; id: string }>(
        `select * from public.${table}`,
      );
      expect(visible.length, `${table} should show A exactly one row`).toBe(1);

      for (const row of visible) {
        const owner =
          (row as Record<string, unknown>)['user_id'] ?? (row as Record<string, unknown>)['id'];
        expect(owner, `${table} leaked a row to the wrong user`).toBe(USER_A);
      }
    }
  });

  it("cannot read another user's journal even by id", async () => {
    await database.asOwner();
    const theirs = await rows<{ id: string }>(
      `select id from public.journal_entries where user_id = $1`,
      [USER_B],
    );
    const targetId = theirs[0]?.id;
    expect(targetId).toBeTruthy();

    await database.asUser(USER_A);
    const found = await rows(`select * from public.journal_entries where id = $1`, [targetId]);
    expect(found).toEqual([]);
  });

  it('cannot forge a row owned by someone else', async () => {
    await database.asUser(USER_A);

    await expect(
      database.db.query(`insert into public.goals (user_id, title) values ($1, 'forged')`, [
        USER_B,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update or delete another user's rows", async () => {
    await database.asUser(USER_A);

    const updated = await database.db.query(
      `update public.goals set title = 'hijacked' where user_id = $1`,
      [USER_B],
    );
    expect(updated.affectedRows ?? 0).toBe(0);

    const deleted = await database.db.query(`delete from public.goals where user_id = $1`, [
      USER_B,
    ]);
    expect(deleted.affectedRows ?? 0).toBe(0);

    await database.asOwner();
    const theirs = await rows<{ title: string }>(
      `select title from public.goals where user_id = $1`,
      [USER_B],
    );
    expect(theirs[0]?.title).toBe('b@example.test goal');
  });

  it('cannot move its own row to another owner', async () => {
    await database.asUser(USER_A);

    await expect(
      database.db.query(`update public.goals set user_id = $1 where user_id = $2`, [
        USER_B,
        USER_A,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('sees nothing at all when unauthenticated', async () => {
    await database.asOwner();
    await database.db.exec(`set request.jwt.claims = ''`);
    await database.db.exec('set role authenticated');

    expect(await rows(`select * from public.goals`)).toEqual([]);
    expect(await rows(`select * from public.journal_entries`)).toEqual([]);
  });
});

describe('library content', () => {
  beforeAll(async () => {
    await database.asOwner();
    await database.db.query(
      `insert into public.exercises (user_id, slug, name, cue) values (null, 'toe-touch', 'Toe touch', 'Hinge at the hips.')`,
    );
  });

  it('is readable by any signed-in user', async () => {
    await database.asUser(USER_A);
    const library = await rows<{ slug: string }>(
      `select slug from public.exercises where user_id is null`,
    );
    expect(library.map((row) => row.slug)).toContain('toe-touch');
  });

  it('cannot be written by a user', async () => {
    await database.asUser(USER_A);
    await expect(
      database.db.query(
        `insert into public.exercises (user_id, slug, name) values (null, 'forged', 'Forged')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('the schema enforces the product rules it can', () => {
  it('refuses an analytics payload that looks like free text', async () => {
    await database.asUser(USER_A);

    await expect(
      database.db.query(
        `insert into public.analytics_events (user_id, name, payload)
         values ($1, 'day_review_completed', '{"reflection":"I was tired"}'::jsonb)`,
        [USER_A],
      ),
    ).rejects.toThrow(/analytics_payload_is_not_free_text/);

    const ok = await database.db.query(
      `insert into public.analytics_events (user_id, name, payload)
       values ($1, 'day_review_completed', '{"completionRatio":0.8}'::jsonb) returning id`,
      [USER_A],
    );
    expect(ok.rows).toHaveLength(1);
  });

  it('refuses a quote that carries an author it has not verified', async () => {
    await database.asOwner();

    await expect(
      database.db.query(
        `insert into public.quotes (text, author, attribution_status)
         values ('Consistency beats intensity.', 'Marcus Aurelius', 'unattributed-saying')`,
      ),
    ).rejects.toThrow(/quote_author_only_when_verified/);
  });

  it('refuses a skipped item with no reason', async () => {
    await database.asOwner();

    await expect(
      database.db.query(
        `insert into public.daily_plan_items (user_id, daily_plan_id, kind, title_snapshot, status)
         select $1, dp.id, 'task', 'No reason given', 'skipped'
           from public.daily_plans dp where dp.user_id = $1 limit 1`,
        [USER_A],
      ),
    ).rejects.toThrow(/plan_item_skip_has_reason/);
  });

  it('refuses a workout exercise counted in both reps and time', async () => {
    await database.asOwner();

    await expect(
      database.db.query(
        `insert into public.workout_plans (user_id, slug, name, weeks, days_per_week)
         values (null, 'p', 'P', 4, 3)`,
      ),
    ).resolves.toBeTruthy();

    const day = await database.db.query<{ id: string }>(
      `insert into public.workout_days (workout_plan_id, week, day)
       select id, 1, 1 from public.workout_plans where slug = 'p' returning id`,
    );
    const exercise = await database.db.query<{ id: string }>(
      `select id from public.exercises where slug = 'toe-touch'`,
    );

    await expect(
      database.db.query(
        `insert into public.workout_exercises (workout_day_id, exercise_id, sets, reps, hold_seconds)
         values ($1, $2, 1, 10, 30)`,
        [day.rows[0]?.id, exercise.rows[0]?.id],
      ),
    ).rejects.toThrow(/workout_exercise_reps_or_time/);
  });
});

describe('workouts', () => {
  let theirWorkout: string;
  let exerciseId: string;

  beforeAll(async () => {
    await database.asOwner();
    const exercise = await database.db.query<{ id: string }>(
      `insert into public.exercises (user_id, slug, name) values (null, 'rls-squat', 'Squat')
       on conflict (slug) where user_id is null do update set name = excluded.name
       returning id`,
    );
    exerciseId = exercise.rows[0]!.id;
    const workout = await database.db.query<{ id: string }>(
      `insert into public.workout_sessions (user_id, local_date, timezone, session_key, title_snapshot, snapshot)
       values ($1, '2026-03-16', 'UTC', '1-full_a', 'Full body A', '{}'::jsonb) returning id`,
      [USER_B],
    );
    theirWorkout = workout.rows[0]!.id;
  });

  it("cannot see another person's workout", async () => {
    await database.asUser(USER_A);
    expect(
      await rows(`select * from public.workout_sessions where id = $1`, [theirWorkout]),
    ).toEqual([]);
  });

  it("cannot log a set against another person's workout, even under its own name", async () => {
    // RLS passes — the row says it is A's — and the foreign key passes, because
    // it is checked with the owner's rights. The trigger is what refuses it.
    await database.asUser(USER_A);
    await expect(
      database.db.query(
        `insert into public.workout_logs
           (user_id, workout_session_id, exercise_id, exercise_slug, exercise_name_snapshot,
            local_date, timezone, set_index, reps)
         values ($1, $2, $3, 'rls-squat', 'Squat', '2026-03-16', 'UTC', 1, 10)`,
        [USER_A, theirWorkout, exerciseId],
      ),
    ).rejects.toThrow(/does not belong to this user/);
  });

  it('allows only one running workout per person', async () => {
    await database.asOwner();
    await expect(
      database.db.query(
        `insert into public.workout_sessions (user_id, local_date, timezone, session_key, title_snapshot, snapshot)
         values ($1, '2026-03-17', 'UTC', '2-full_b', 'Full body B', '{}'::jsonb)`,
        [USER_B],
      ),
    ).rejects.toThrow(/workout_sessions_one_running/);
  });

  it('refuses pain outside 0–10 and a finished workout with no end time', async () => {
    await database.asOwner();
    await expect(
      database.db.query(
        `insert into public.workout_logs
           (user_id, workout_session_id, exercise_id, exercise_slug, exercise_name_snapshot,
            local_date, timezone, set_index, reps, pain)
         values ($1, $2, $3, 'rls-squat', 'Squat', '2026-03-16', 'UTC', 1, 10, 11)`,
        [USER_B, theirWorkout, exerciseId],
      ),
    ).rejects.toThrow(/workout_log_pain_range/);
    await expect(
      database.db.query(`update public.workout_sessions set status = 'completed' where id = $1`, [
        theirWorkout,
      ]),
    ).rejects.toThrow(/workout_session_end_matches_status/);
  });

  it('keeps library exercise slugs unique', async () => {
    await database.asOwner();
    await expect(
      database.db.query(
        `insert into public.exercises (user_id, slug, name) values (null, 'rls-squat', 'Again')`,
      ),
    ).rejects.toThrow(/exercises_library_slug/);
  });
});

describe('flexibility', () => {
  let theirEnrolment: string;

  beforeAll(async () => {
    await database.asOwner();
    const program = await database.db.query<{ id: string }>(
      `insert into public.flexibility_programs (user_id, slug, name, region, weeks, days_per_week)
       values (null, 'rls-flex', 'RLS flex', 'hamstrings', 4, 3)
       on conflict (slug) where user_id is null do update set name = excluded.name
       returning id`,
    );
    const enrolment = await database.db.query<{ id: string }>(
      `insert into public.flexibility_enrolments
         (user_id, flexibility_program_id, program_slug, started_on, schedule_weekdays)
       values ($1, $2, 'rls-flex', '2026-03-02', '{1,3,5}') returning id`,
      [USER_B, program.rows[0]!.id],
    );
    theirEnrolment = enrolment.rows[0]!.id;
  });

  it("cannot see another person's enrolment", async () => {
    await database.asUser(USER_A);
    expect(
      await rows(`select * from public.flexibility_enrolments where id = $1`, [theirEnrolment]),
    ).toEqual([]);
  });

  it("cannot attach a session or a check-in to another person's enrolment", async () => {
    await database.asUser(USER_A);
    await expect(
      database.db.query(
        `insert into public.flexibility_sessions (user_id, enrolment_id, week, day, local_date, timezone, status)
         values ($1, $2, 1, 1, '2026-03-02', 'UTC', 'running')`,
        [USER_A, theirEnrolment],
      ),
    ).rejects.toThrow(/does not belong to this user/);
    await expect(
      database.db.query(
        `insert into public.flexibility_checkins
           (user_id, enrolment_id, week, local_date, toe_touch, leg_raise_left, leg_raise_right,
            tightness, socks, pick_up, pain)
         values ($1, $2, 0, '2026-03-02', 'toes', 'to_70', 'to_70', 5, 'easy', 'easy', 'none')`,
        [USER_A, theirEnrolment],
      ),
    ).rejects.toThrow(/does not belong to this user/);
  });

  it('refuses a stop without pain, a skip without a reason, and a slot closed twice', async () => {
    await database.asOwner();
    const insert = (status: string, extra = '', values = '') =>
      database.db.query(
        `insert into public.flexibility_sessions (user_id, enrolment_id, week, day, local_date, timezone, status${extra})
         values ($1, $2, 2, 1, '2026-03-09', 'UTC', $3${values})`,
        [USER_B, theirEnrolment, status],
      );
    await expect(insert('stopped')).rejects.toThrow(/flexibility_stop_is_pain/);
    await expect(insert('skipped')).rejects.toThrow(/flexibility_skip_has_reason/);
    await insert('completed');
    await expect(insert('completed')).rejects.toThrow(/flexibility_sessions_slot_closed_once/);
  });

  it('takes exactly three days', async () => {
    await database.asOwner();
    await expect(
      database.db.query(
        `update public.flexibility_enrolments set schedule_weekdays = '{1,3}' where id = $1`,
        [theirEnrolment],
      ),
    ).rejects.toThrow(/flexibility_three_days/);
  });
});

describe('nutrition', () => {
  let theirMeal: string;
  let theirFood: string;

  beforeAll(async () => {
    await database.asOwner();
    const meal = await database.db.query<{ id: string }>(
      `insert into public.meals (user_id, local_date, timezone, slot)
       values ($1, '2026-03-02', 'UTC', 'lunch') returning id`,
      [USER_B],
    );
    theirMeal = meal.rows[0]!.id;
    const food = await database.db.query<{ id: string }>(
      `insert into public.foods (user_id, name, serving_label, calories, source)
       values ($1, 'Their soup', '1 bowl', 200, 'label') returning id`,
      [USER_B],
    );
    theirFood = food.rows[0]!.id;
    await database.db.query(
      `insert into public.hydration_logs (user_id, local_date, timezone, ml) values ($1, '2026-03-02', 'UTC', 250)`,
      [USER_B],
    );
    await database.db.query(
      `insert into public.oil_awareness (user_id, cooking_oils) values ($1, '{olive}')`,
      [USER_B],
    );
  });

  it("cannot see another person's meals, foods, water or oil list", async () => {
    await database.asUser(USER_A);
    expect(await rows(`select * from public.meals where id = $1`, [theirMeal])).toEqual([]);
    expect(await rows(`select * from public.foods where id = $1`, [theirFood])).toEqual([]);
    expect(await rows(`select * from public.hydration_logs`)).toEqual([]);
    expect(await rows(`select * from public.oil_awareness`)).toEqual([]);
  });

  it("cannot log food into another person's meal, or log another person's food", async () => {
    await database.asUser(USER_A);
    await expect(
      database.db.query(
        `insert into public.food_entries (user_id, meal_id, description) values ($1, $2, 'sneaky')`,
        [USER_A, theirMeal],
      ),
    ).rejects.toThrow(/meal does not belong to this user/);

    const mine = await database.db.query<{ id: string }>(
      `insert into public.meals (user_id, local_date, timezone, slot)
       values ($1, '2026-03-02', 'UTC', 'lunch') returning id`,
      [USER_A],
    );
    await expect(
      database.db.query(
        `insert into public.food_entries (user_id, meal_id, food_id, quantity) values ($1, $2, $3, 1)`,
        [USER_A, mine.rows[0]!.id, theirFood],
      ),
    ).rejects.toThrow(/food does not belong to this user/);
  });

  it('keeps one meal per day and slot, and refuses an unknown source or a recipe with no ingredients', async () => {
    await database.asOwner();
    await expect(
      database.db.query(
        `insert into public.meals (user_id, local_date, timezone, slot) values ($1, '2026-03-02', 'UTC', 'lunch')`,
        [USER_B],
      ),
    ).rejects.toThrow(/meals_one_per_slot/);
    await expect(
      database.db.query(
        `insert into public.foods (user_id, name, source) values ($1, 'Made up', 'internet')`,
        [USER_B],
      ),
    ).rejects.toThrow(/food_source_known/);
    await expect(
      database.db.query(
        `insert into public.foods (user_id, name, source) values ($1, 'Stew', 'recipe')`,
        [USER_B],
      ),
    ).rejects.toThrow(/food_recipe_complete/);
  });

  it('turns oil awareness off by deleting the whole row', async () => {
    await database.asUser(USER_B);
    await database.db.query(`delete from public.oil_awareness`);
    expect(await rows(`select * from public.oil_awareness`)).toEqual([]);
  });
});
