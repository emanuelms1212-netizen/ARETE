-- 0019_progress_notifications.sql — quiet notifications: the person's own
-- settings for when and how often, and what they did with each reminder.
--
-- Replayable, like 0012 onwards: every statement is guarded.

alter table public.notification_preferences
  -- A gentle, bundled note about things still open. Off until a time is set.
  add column if not exists open_items_at time,
  -- Per-module switches: { "today": true, "habits": false, ... }. Absent = off.
  add column if not exists modules jsonb not null default '{}'::jsonb,
  add column if not exists daily_cap smallint not null default 2,
  add column if not exists bundle_low_priority boolean not null default true,
  -- Religious or sacred practice: off unless chosen, in the person's own words.
  add column if not exists sacred_enabled boolean not null default false,
  add column if not exists sacred_at time,
  add column if not exists sacred_text text;

alter table public.notification_preferences drop constraint if exists notification_cap_range;
alter table public.notification_preferences add constraint notification_cap_range
  check (daily_cap between 1 and 6);
alter table public.notification_preferences drop constraint if exists notification_modules_object;
alter table public.notification_preferences add constraint notification_modules_object
  check (jsonb_typeof(modules) = 'object');
alter table public.notification_preferences drop constraint if exists notification_sacred_text_length;
alter table public.notification_preferences add constraint notification_sacred_text_length
  check (sacred_text is null or char_length(sacred_text) <= 140);

-- What happened to each reminder: done, snoozed for an hour, or dismissed.
-- Two dismissals of a kind on consecutive days mute it (PRODUCT_SPEC §8).
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  key text not null check (char_length(key) <= 40),
  kind text not null check (kind in (
    'morning_plan', 'evening_review', 'open_items', 'training_day',
    'program_day', 'weekly_review', 'sacred')),
  action text not null check (action in ('done', 'snoozed', 'dismissed')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_snooze_has_time check ((action = 'snoozed') = (snoozed_until is not null))
);
create index if not exists notification_events_by_day on public.notification_events (user_id, local_date);

do $$
begin
  execute 'alter table public.notification_events enable row level security';
  execute 'alter table public.notification_events force row level security';
  execute 'drop policy if exists own_rows on public.notification_events';
  execute 'create policy own_rows on public.notification_events for all to authenticated
           using (user_id = public.current_user_id())
           with check (user_id = public.current_user_id())';
  execute 'grant select, insert, update, delete on public.notification_events to authenticated';
end
$$;

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
    'body_metrics', 'journal_entries', 'analytics_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
