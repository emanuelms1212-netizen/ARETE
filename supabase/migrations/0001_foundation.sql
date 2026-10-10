-- 0001_foundation.sql
-- Helpers every later migration relies on.
--
-- Conventions used throughout ARETE's schema:
--
--   * Every row a user owns carries `user_id uuid not null references auth.users(id)`
--     and is protected by row-level security in 0009. There is no table where a
--     user's rows are reachable by another user.
--   * Anything that belongs to a *day* carries `local_date date` plus the
--     `timezone` it was recorded in. The day boundary is the user's local
--     midnight, not UTC midnight, and storing the zone alongside the date means
--     a later timezone change cannot silently re-file history.
--   * Templates, instances and logs are separate tables. `tasks` is a
--     definition, `task_occurrences` is one day's instance of it, and a
--     completion is a column on the occurrence. The same split holds for
--     habits/habit_logs and workout plans/logs.
--   * Measurements are stored in one canonical system - metric - and converted
--     for display. `preferences.unit_system` says what to show, never what is
--     stored, so a user switching systems cannot corrupt their history.
--   * Writes that a flaky connection might repeat carry a `client_token`,
--     unique per user, so a retry is a no-op rather than a duplicate.
--   * Imported content carries provenance: see `content_sources` in 0007 and
--     docs/SOURCE_MAP.md for what each licence permits.

-- No extensions are required. `gen_random_uuid()` has been in core Postgres
-- since 13, so the schema does not depend on pgcrypto and applies to a plain
-- Postgres as readily as to Supabase.

-- Keeps `updated_at` honest without trusting the client to send it.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: stamps updated_at on every UPDATE.';

-- Attaches the updated_at trigger to a table. Saves repeating the same
-- four lines thirty times.
create or replace function public.attach_updated_at(target regclass) returns void
language plpgsql as $$
declare
  trigger_name text := 'set_updated_at_' || replace(target::text, '.', '_');
begin
  execute format(
    'create trigger %I before update on %s for each row execute function public.set_updated_at()',
    trigger_name, target
  );
end;
$$;

-- A single place that answers "who is asking?".
--
-- In Supabase this is auth.uid(). Wrapping it means the policies in 0009 read
-- the same whether they run against Supabase or against the test harness in
-- supabase/test, and that swapping the identity provider later is one function.
create or replace function public.current_user_id() returns uuid
language sql stable as $$
  select auth.uid()
$$;

comment on function public.current_user_id() is
  'The authenticated user, or null. Every row-level security policy goes through this.';
