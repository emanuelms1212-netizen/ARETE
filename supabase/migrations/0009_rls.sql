-- 0009_rls.sql — row-level security on every table.
--
-- Least privilege: the `authenticated` role can reach exactly its own rows and
-- the shipped library content, and nothing else. There is no policy anywhere
-- that grants a user access to another user's row.
--
-- FORCE is applied as well as ENABLE so that the table owner is not exempt
-- either; a bug in a security-definer function cannot quietly read everything.
--
-- src/persistence/__tests__/rls.test.ts applies these migrations to a real
-- Postgres and proves the isolation, including that no table was missed.

-- ---------------------------------------------------------------------------
-- Tables the user owns outright, keyed by user_id.
-- ---------------------------------------------------------------------------
do $$
declare
  owned text[] := array[
    'preferences', 'onboarding_answers', 'notification_preferences',
    'safety_acknowledgements', 'goals', 'milestones', 'projects', 'tasks',
    'task_occurrences', 'habits', 'habit_schedules', 'habit_logs',
    'daily_plans', 'daily_plan_items', 'focus_sessions', 'meditation_sessions',
    'breathwork_sessions', 'cognitive_sessions', 'workout_logs',
    'flexibility_sessions', 'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events'
  ];
  t text;
begin
  foreach t in array owned loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated '
      'using (user_id = public.current_user_id()) '
      'with check (user_id = public.current_user_id())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- The profile row, which is keyed by id rather than user_id.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy own_profile on public.profiles for all to authenticated
  using (id = public.current_user_id())
  with check (id = public.current_user_id());

grant select, insert, update, delete on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Tables that hold both shipped library content (user_id is null) and the
-- user's own rows. Everyone may read the library; only the owner may write,
-- and only to rows that are theirs.
-- ---------------------------------------------------------------------------
do $$
declare
  mixed text[] := array['exercises', 'workout_plans', 'flexibility_programs', 'foods'];
  t text;
begin
  foreach t in array mixed loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy read_library_and_own on public.%I for select to authenticated '
      'using (user_id is null or user_id = public.current_user_id())', t);
    execute format(
      'create policy write_own on public.%I for insert to authenticated '
      'with check (user_id = public.current_user_id())', t);
    execute format(
      'create policy update_own on public.%I for update to authenticated '
      'using (user_id = public.current_user_id()) '
      'with check (user_id = public.current_user_id())', t);
    execute format(
      'create policy delete_own on public.%I for delete to authenticated '
      'using (user_id = public.current_user_id())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Library content with no owner at all: readable by any signed-in user,
-- writable only by the service role (which bypasses RLS). Seeding and content
-- updates are a deployment concern, never a client one.
-- ---------------------------------------------------------------------------
do $$
declare
  readonly text[] := array[
    'workout_days', 'workout_exercises', 'exercise_animation_assets',
    'content_sources', 'content_packs', 'quotes'
  ];
  t text;
begin
  foreach t in array readonly loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end
$$;

grant usage on schema public to authenticated;
