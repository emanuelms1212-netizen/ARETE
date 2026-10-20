-- 0020_trust.sql — the audit trail, and deleting one part of an account.
--
-- Replayable, like 0012 onwards: every statement is guarded.
--
-- The audit trail records that a sensitive action happened, and when. It
-- never records what was in it: no journal text, no food, no health answer.
-- `detail` is a short machine word (a feature or topic name), enforced here
-- so a later change cannot start writing free text into it.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in (
    'export', 'delete_feature',
    'health_answers_changed', 'contrast_screening_saved', 'safety_acknowledged')),
  detail text check (detail is null or detail ~ '^[a-z0-9_:-]{1,64}$'),
  -- clock_timestamp, not now(): two actions in one transaction keep their order.
  created_at timestamptz not null default clock_timestamp(),
  -- Ties on the clock (it can be coarse) still keep insertion order.
  seq bigint generated always as identity
);
create index if not exists audit_events_by_user on public.audit_events (user_id, created_at desc);

comment on table public.audit_events is
  'What happened and when, never what it contained. Kept 400 days (docs/PRIVACY.md), then pruned by prune_audit_events().';

do $$
begin
  execute 'alter table public.audit_events enable row level security';
  execute 'alter table public.audit_events force row level security';
  -- Append-only for the person: they can read and add their own rows, and
  -- cannot rewrite or remove the record of what happened. Deleting the
  -- account removes it with everything else, through the cascade.
  execute 'drop policy if exists own_rows_read on public.audit_events';
  execute 'create policy own_rows_read on public.audit_events for select to authenticated
           using (user_id = public.current_user_id())';
  execute 'drop policy if exists own_rows_insert on public.audit_events';
  execute 'create policy own_rows_insert on public.audit_events for insert to authenticated
           with check (user_id = public.current_user_id())';
  execute 'grant select, insert on public.audit_events to authenticated';
end
$$;

-- Retention: the trail is useful for about a year. Run by a scheduled job.
create or replace function public.prune_audit_events() returns integer
language plpgsql security definer as $$
declare
  removed integer;
begin
  delete from public.audit_events where created_at < now() - interval '400 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_audit_events() from public;

-- Deletes one part of the caller's account. SECURITY INVOKER: row-level
-- security still applies, and the subject is always current_user_id(), never
-- an argument, so it cannot be aimed at anyone else.
create or replace function public.delete_my_feature(feature text) returns void
language plpgsql security invoker as $$
declare
  me uuid := public.current_user_id();
begin
  if me is null then
    raise exception 'delete_my_feature() requires an authenticated user';
  end if;

  case feature
    when 'journal' then
      update public.daily_plans
         set intention = null, in_my_control = null, not_my_control = null,
             virtue = null, obstacle = null
       where user_id = me;
      delete from public.day_reviews where user_id = me;
      delete from public.journal_entries where user_id = me;
    when 'food' then
      delete from public.food_entries where user_id = me;
      delete from public.meals where user_id = me;
      delete from public.foods where user_id = me;
      delete from public.hydration_logs where user_id = me;
      delete from public.oil_awareness where user_id = me;
    when 'body' then
      delete from public.body_metrics where user_id = me;
    when 'training' then
      delete from public.workout_logs where user_id = me;
      delete from public.workout_sessions where user_id = me;
    when 'flexibility' then
      delete from public.flexibility_checkins where user_id = me;
      delete from public.flexibility_sessions where user_id = me;
      delete from public.flexibility_enrolments where user_id = me;
    when 'mind' then
      delete from public.meditation_sessions where user_id = me;
      delete from public.breathwork_sessions where user_id = me;
      delete from public.cognitive_sessions where user_id = me;
    when 'focus' then
      delete from public.focus_sessions where user_id = me;
    when 'programmes' then
      delete from public.reset_logs where user_id = me;
      delete from public.reset_checkins where user_id = me;
      delete from public.reset_breaks where user_id = me;
      delete from public.reset_enrolments where user_id = me;
      delete from public.contrast_sessions where user_id = me;
    when 'health' then
      delete from public.onboarding_answers where user_id = me and step = 'health';
      delete from public.health_profile where user_id = me;
      delete from public.contrast_screenings where user_id = me;
    when 'notifications' then
      delete from public.notification_events where user_id = me;
      update public.notification_preferences set auto_muted_kinds = '{}' where user_id = me;
    else
      raise exception 'Unknown feature: %', feature;
  end case;
end;
$$;

comment on function public.delete_my_feature(text) is
  'Deletes one part of the caller''s account (domain/data-features.ts). Immediate and irreversible.';

create or replace function public.user_owned_tables() returns text[]
language sql immutable as $$
  select array[
    'preferences', 'onboarding_answers', 'onboarding_progress',
    'notification_preferences', 'notification_events', 'safety_acknowledgements',
    'health_profile', 'training_profile', 'nutrition_profile', 'mind_profile',
    'goals', 'goal_measurements', 'goal_reviews',
    'milestones', 'projects', 'tasks',
    'task_occurrences', 'habits', 'habit_schedules', 'habit_logs',
    'daily_plans', 'daily_plan_items', 'day_reviews', 'plan_drafts',
    'focus_sessions', 'meditation_sessions',
    'breathwork_sessions', 'cognitive_sessions',
    'workout_sessions', 'workout_logs',
    'flexibility_enrolments', 'flexibility_sessions', 'flexibility_checkins',
    'nutrition_targets', 'meals', 'food_entries', 'hydration_logs', 'oil_awareness',
    'reset_enrolments', 'reset_breaks', 'reset_logs', 'reset_checkins',
    'contrast_screenings', 'contrast_sessions',
    'body_metrics', 'journal_entries', 'analytics_events', 'audit_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
