-- 0000_auth_shim.sql — TEST FIXTURE ONLY. Never applied to a real database.
--
-- Supabase provides the `auth` schema: a `users` table and `auth.uid()`, which
-- reads the `sub` claim of the request's JWT. The migrations in
-- supabase/migrations depend on both.
--
-- To prove those migrations apply from zero and that the row-level security
-- actually isolates users, the test harness needs the same two things. This
-- file is the smallest faithful stand-in: the same table name, the same column
-- the foreign keys point at, and an `auth.uid()` with the same implementation
-- Supabase uses.
--
-- It is deliberately kept in a separate directory from the real migrations so
-- that it can never be applied by mistake.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Matches Supabase's own implementation, including the guard that makes an
-- absent or empty claims setting return null rather than raise.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid
$$;

-- Supabase's two client roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end
$$;

grant usage on schema auth to authenticated, anon;
