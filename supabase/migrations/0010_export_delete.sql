-- 0010_export_delete.sql — export everything, and delete everything.
--
-- PRODUCT_SPEC §11: export is complete and immediate; deletion is complete,
-- immediate and irreversible. Both are a right, so both are in the database
-- rather than in a support queue.

-- Every table that holds something the user typed or did. Adding a user-owned
-- table without adding it here is a bug, and the test in
-- src/persistence/__tests__/export-delete.test.ts fails when that happens.
create or replace function public.user_owned_tables() returns text[]
language sql immutable as $$
  select array[
    'preferences', 'onboarding_answers', 'notification_preferences',
    'safety_acknowledgements', 'goals', 'milestones', 'projects', 'tasks',
    'task_occurrences', 'habits', 'habit_schedules', 'habit_logs',
    'daily_plans', 'daily_plan_items', 'focus_sessions', 'meditation_sessions',
    'breathwork_sessions', 'cognitive_sessions', 'workout_logs',
    'flexibility_sessions', 'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;

-- Returns the caller's entire account as one JSON document.
--
-- SECURITY INVOKER on purpose: it runs as the caller, so row-level security
-- still applies and the function cannot be turned into a way to read someone
-- else's data even if it is called with another user's id.
create or replace function public.export_my_data() returns jsonb
language plpgsql security invoker stable as $$
declare
  result jsonb := '{}'::jsonb;
  t text;
  rows jsonb;
  me uuid := public.current_user_id();
begin
  if me is null then
    raise exception 'export_my_data() requires an authenticated user';
  end if;

  result := jsonb_build_object(
    'exportedAt', to_jsonb(now()),
    'schemaVersion', to_jsonb(10),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me)
  );

  foreach t in array public.user_owned_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.user_id = $1', t)
      into rows using me;
    result := jsonb_set(result, array[t], rows);
  end loop;

  return result;
end;
$$;

comment on function public.export_my_data() is
  'Complete account export as JSON. Immediate, no email, no queue (PRODUCT_SPEC §5.14).';

-- Deletes the caller's account and everything attached to it.
--
-- SECURITY DEFINER because removing the auth.users row is what guarantees the
-- cascade reaches every table, and that row is not the caller's to delete.
-- The function takes its subject from current_user_id() and never from an
-- argument, so it cannot be aimed at anyone else.
create or replace function public.delete_my_account() returns void
language plpgsql security definer as $$
declare
  me uuid := public.current_user_id();
begin
  if me is null then
    raise exception 'delete_my_account() requires an authenticated user';
  end if;

  update public.profiles set deletion_requested_at = now() where id = me;

  -- Every table in this schema cascades from profiles, which cascades from
  -- auth.users. One delete is the whole account.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;

comment on function public.delete_my_account() is
  'Irreversible. Removes the account and every row attached to it (PRODUCT_SPEC §5.14).';
