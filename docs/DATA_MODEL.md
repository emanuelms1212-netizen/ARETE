# DATA_MODEL.md

The schema, and the reasoning behind it.

**Source of truth:** `supabase/migrations/` — thirteen files, applied in order, 48 tables.
**Proof:** `src/persistence/rls.test.ts` applies them from zero to a real Postgres and tries
to break the isolation. `src/persistence/sql-repository.test.ts` holds the production SQL to
the same contract as the demo adapter, through the policies.

---

## 1. Five conventions that run through everything

**Ownership.** Every row a user owns carries `user_id uuid not null references auth.users(id)
on delete cascade`, and row-level security scopes it to them. There is no table where one
user's rows are reachable by another, and a test asserts that no table was left out.

**Local days.** Anything that belongs to a day carries `local_date date` _and_ the `timezone`
it was recorded in. The day starts at the user's local midnight, not UTC's. Storing the zone
beside the date means a user who flies to Tokyo does not have yesterday silently re-filed, and
`src/domain/local-day.ts` does the arithmetic — with tests across the date line and both
daylight-saving boundaries.

**Template, instance, log.** Three different things, three different tables.
`tasks` is a definition with a recurrence rule; `task_occurrences` is one day's instance;
completion is a column on the occurrence. The same split holds for `habits`/`habit_logs` and
`workout_plans`/`workout_logs`. Editing a template never rewrites history.

**One unit system in storage.** Kilograms, centimetres, kilometres, millilitres, Celsius.
`preferences.unit_system` says what to _show_, never what is stored, so a user switching to
pounds changes nothing in the database and cannot corrupt their own history.
`src/domain/units.ts` converts at the edge.

**Idempotent writes.** Everything a flaky connection might repeat — a finished timer, a
logged set, a habit tick — carries `client_token` with `unique (user_id, client_token)`. The
token is derived from _what the write is_ rather than when it was sent
(`src/domain/idempotency.ts`), so a retry produces the same token and the database rejects the
duplicate. A focus session recorded three times is one row.

## 2. The tables

| Migration                 | Tables                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_foundation`         | Helper functions: `set_updated_at`, `attach_updated_at`, `current_user_id`                                                                                                  |
| `0002_identity`           | `profiles`, `preferences`, `onboarding_answers`, `notification_preferences`, `safety_acknowledgements`                                                                      |
| `0003_planning`           | `goals`, `milestones`, `projects`, `tasks`, `task_occurrences`, `habits`, `habit_schedules`, `habit_logs`, `daily_plans`, `daily_plan_items`                                |
| `0004_sessions`           | `focus_sessions`, `meditation_sessions`, `breathwork_sessions`, `cognitive_sessions`                                                                                        |
| `0005_training`           | `exercises`, `exercise_animation_assets`, `workout_plans`, `workout_days`, `workout_exercises`, `workout_logs`, `flexibility_programs`, `flexibility_sessions`              |
| `0006_nutrition_body`     | `nutrition_targets`, `foods`, `meals`, `food_entries`, `body_metrics`                                                                                                       |
| `0007_content`            | `content_sources`, `content_packs`, `quotes`, `journal_entries`                                                                                                             |
| `0008_analytics`          | `analytics_events`                                                                                                                                                          |
| `0009_rls`                | Policies and grants for all of the above                                                                                                                                    |
| `0010_export_delete`      | `export_my_data()`, `delete_my_account()`                                                                                                                                   |
| `0011_onboarding`         | `onboarding_progress`, `health_profile`, `training_profile`, `nutrition_profile`, `mind_profile`, `plan_drafts`                                                             |
| `0012_daily_system`       | `goal_measurements`, `goal_reviews`, `day_reviews`; habit kinds, task subtasks, the day's framing, the focus timer's pause state                                            |
| `0013_mind`               | `mind_practices`, `user_content_packs`; the shared player columns on the three Mind session tables                                                                          |
| `0014_train`              | `workout_sessions`; set-level columns on `workout_logs`; instruction text on `exercises`; plan inputs on `training_profile`                                                 |
| `0015_flexibility`        | `flexibility_enrolments`, `flexibility_checkins`; status, warm-up, items, notes and skip reason on `flexibility_sessions`; library slug index on `flexibility_programs`     |
| `0016_flexibility_rights` | Clears the hamstring programme and adds the `third-party-permission-granted` licence (ledger D85)                                                                           |
| `0017_nutrition`          | `hydration_logs`, `oil_awareness`; food settings on `nutrition_profile`; fibre, water and clinician flag on `nutrition_targets`; recipes, favourites and sources on `foods` |

`daily_plan_items` is the one table not in the brief's list. A `daily_plans` row on its own
cannot represent a day; this is the commitment the Today screen renders.

## 3. Row-level security

Three shapes, and nothing else:

| Shape   | Tables                                                                                                         | Policy                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Owned   | 26 tables plus `profiles`                                                                                      | `user_id = current_user_id()`, for all operations, `using` **and** `with check`         |
| Mixed   | `exercises`, `workout_plans`, `flexibility_programs`, `foods`                                                  | Everyone reads library rows (`user_id is null`) and their own; writes only to their own |
| Library | `workout_days`, `workout_exercises`, `exercise_animation_assets`, `content_sources`, `content_packs`, `quotes` | Any signed-in user reads; only the service role writes                                  |

Both `ENABLE` and `FORCE` are applied, so the table owner is not exempt either — a bug in a
security-definer function cannot quietly read everything.

### What the tests actually try

Not "is a policy present" but "does it hold":

- A user sees exactly one row in each owned table when two users have one each.
- Another user's journal entry is invisible _even when asked for by id_.
- Inserting a row owned by someone else is rejected.
- Updating or deleting another user's rows affects zero rows.
- Moving one's own row to another owner is rejected by the `with check`.
- An unauthenticated session sees nothing at all.
- Library content is readable but not writable.
- No table in `public` is missing RLS, FORCE, or a policy.

## 3a. The one rule the schema is the enforcement point for

An optional content pack is visible only when a `user_content_packs` row says the user chose
it. That row is created by a person pressing a switch — never inferred from a name, a
language, a region or anything else (SOURCE_MAP §5, D55).

The repository's `listMindPractices` carries that into one `where` clause, and
`startMindSession` re-checks it, so a practice from an unchosen pack is absent rather than
hidden and cannot be started by naming its slug. Both adapters are held to it by the shared
contract suite, and the SQL one through row-level security.

## 4. Product rules the schema enforces

Some rules are too important to leave to application code that a later feature might forget.

| Rule                                                     | How                                                                                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No free text in analytics                                | `check (not payload_has_free_text(payload))` — a payload with a key matching `note/text/title/description/entry/answer/reflection/journal/body/prompt/name/email/comment` is rejected outright |
| Never invent an attribution                              | `check (author is null or attribution_status = 'verified-public-domain')` — a paraphrase or common saying may not carry an author                                                              |
| A skip has a reason                                      | `check (status <> 'skipped' or skip_reason is not null)` — that is what makes a skip not a failure                                                                                             |
| A movement is counted in reps **or** time                | `check (num_nonnulls(reps, hold_seconds) = 1)`                                                                                                                                                 |
| Cognitive drills report practice only                    | No column is a cognitive score; the table comment says so                                                                                                                                      |
| One running workout per person                           | Partial unique index `workout_sessions_one_running`                                                                                                                                            |
| A finished workout has an end time                       | `check ((status = 'running') = (ended_at is null))`                                                                                                                                            |
| One row per logged set                                   | Unique `(workout_session_id, exercise_slug, set_index)`; logging a set again updates it                                                                                                        |
| A set belongs to its owner's workout                     | Trigger `guard_workout_log_owner` — RLS checks the row's `user_id`, a foreign key is checked with the owner's rights, so the trigger closes the gap                                            |
| Pain is 0–10                                             | `check (pain between 0 and 10)` on `workout_logs`                                                                                                                                              |
| Two to six training days                                 | `check (cardinality(training_weekdays) = 0 or cardinality(training_weekdays) between 2 and 6)`                                                                                                 |
| Library exercise slugs are unique                        | Partial unique index on `exercises (slug) where user_id is null` — `unique (user_id, slug)` alone lets nulls repeat                                                                            |
| A loadable exercise has a load step                      | `check (not loadable or increment_kg > 0)`                                                                                                                                                     |
| Three flexibility days, one active run                   | `check (cardinality(schedule_weekdays) = 3)`; partial unique index on active enrolments per programme                                                                                          |
| A flexibility stop is pain; a skip has why               | `check (status <> 'stopped' or pain_reported)`, `check (status <> 'skipped' or skip_reason is not null)`                                                                                       |
| A flexibility session closes once                        | Partial unique index on `(enrolment_id, week, day)` where completed or skipped; stopped attempts may repeat                                                                                    |
| Sessions and check-ins belong to their owner's enrolment | Trigger `guard_flexibility_enrolment_owner`, for the same reason as the workout-set trigger                                                                                                    |
| A food says where its numbers came from                  | `check (source in ('label','estimate','recipe','synthetic-demo'))` on `foods`; entries add `quick-add`                                                                                         |
| A recipe has ingredients and a yield                     | `check (source is distinct from 'recipe' or (jsonb_array_length(ingredients) > 0 and servings_made is not null))`                                                                              |
| One meal row per day and slot                            | Unique index `meals_one_per_slot`                                                                                                                                                              |
| One current target override                              | Partial unique index `nutrition_targets_one_current` where `effective_to is null`; older rows are kept as history                                                                              |
| Food is logged into the owner's meal, from their foods   | Trigger `guard_food_entry_owner`, for the same reason as the workout-set trigger                                                                                                               |
| The oil preference is deleted whole                      | `oil_awareness` is one row per person; its existence is the switch, and turning it off deletes it (ledger D92)                                                                                 |
| Flexibility rights are unresolved                        | `flexibility_programs.rights_status` defaults to `pending`, and the seed ships the hamstring programme as `pending`                                                                            |

## 5. Export and deletion

Both are rights, so both are in the database rather than in a support queue.

`export_my_data()` returns the whole account as one JSON document. **SECURITY INVOKER**: it
runs as the caller, so row-level security still applies and it cannot be turned into a way to
read someone else's data.

`delete_my_account()` is **SECURITY DEFINER**, because removing the `auth.users` row is what
guarantees the cascade reaches every table and that row is not the caller's to delete. It
takes its subject from `current_user_id()` and never from an argument, so it cannot be aimed
at anyone else. One delete removes the account and everything attached to it.

`user_owned_tables()` lists what export covers. Adding a user-owned table without adding it
there is a bug, and it is the kind of bug that quietly loses someone's data on export.

## 6. How the app reaches it

```
Today screen
  → getCurrentUser()          src/auth        (demo identity, or Supabase session)
  → withUser(userId, …)       src/persistence (opens a transaction, sets the JWT claim)
      → AreteRepository       one interface, two implementations
          ├── memory          demo mode: deterministic, in-process, labelled in the UI
          └── sql             production: plain SQL over a pooled connection
```

**Supabase is used for authentication only.** Data access goes straight to Postgres, so the
SQL the tests prove is the SQL production runs — there is no PostgREST layer that only exists
in production and cannot be exercised locally.

The connection on the request path must be a role that RLS _applies to_. Environment
validation rejects a `DATABASE_URL` that looks like a service-role connection, because that
would bypass every policy on this page. The service role belongs to `npm run db:migrate` and
`npm run db:seed`, and nowhere else.

## 6a. How migrations are applied

`npm run db:migrate` used to replay every file on every run, and this document used to say
that was safe because the files were idempotent. They were not: the early migrations create
tables unconditionally and fail the second time. A test of the claim found it (D39).

`public.schema_migrations` now records each applied file with a SHA-256 of its contents.
Each file runs exactly once, and a file that has already been applied and has since been
**edited** aborts the whole run by name, rather than leaving the database quietly out of step
with the repository. The runner is one function, `src/persistence/migrator.ts`, used by both
the CLI and the tests — so the test exercises the code that deploys, not a copy of it.

The ledger is deployment infrastructure, so row-level security is enabled and forced on it
with a policy that permits nothing (D40). It is readable only by the service role.

## 7. Running it

```bash
npm run db:migrate   # apply every migration, in order, from zero
npm run db:seed      # content; plus the demo account outside production
npm run db:reset     # both
```

All three read `SUPABASE_DB_URL` — the service-role connection string, kept out of the
repository. The seed is idempotent: running it twice changes nothing, and a test proves it.

## 8. Known gaps

- **No Supabase project exists yet.** Everything here is proven against an in-process
  Postgres; the migrations have not been applied to a hosted database. See
  `PROJECT_LEDGER.md` §8 for exactly what that needs.
- **Repositories exist for days, onboarding, goals, tasks, habits, focus, Mind, Train,
  Flexibility and Nutrition** (weigh-ins included, on `body_metrics`). The journal has schema,
  policies and tests; its repository arrives with the module that uses it. An interface written before its screen
  is an interface written twice.
- **Calculated nutrition targets are not stored either.** They follow from the settings and
  the latest weigh-in (ledger D87); only a person's own or their clinician's numbers are.
- **The training plan is not a table.** It is computed from `training_profile` and the logged
  history every time it is needed (ledger D65). `workout_plans`, `workout_days` and
  `workout_exercises` remain for library programmes, which nothing ships yet.
