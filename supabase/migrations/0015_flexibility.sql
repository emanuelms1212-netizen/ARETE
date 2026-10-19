-- 0015_flexibility.sql — flexibility programmes as people actually follow them:
-- an enrolment with three chosen days, each session as done (warm-up, items,
-- intensity, notes, pain), and a weekly self-report.
--
-- Replayable, like 0012 onwards: every statement is guarded.

-- ---------------------------------------------------------------------------
-- The programme library
-- ---------------------------------------------------------------------------

-- `unique (user_id, slug)` lets library rows (user_id null) repeat, because
-- nulls are distinct; the seed's `on conflict do nothing` therefore inserted a
-- duplicate on every run. This is the index it should have targeted.
create unique index if not exists flexibility_programs_library_slug
  on public.flexibility_programs (slug) where user_id is null;

alter table public.flexibility_programs
  add column if not exists provenance_note text;

-- ---------------------------------------------------------------------------
-- Enrolments
-- ---------------------------------------------------------------------------
create table if not exists public.flexibility_enrolments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  flexibility_program_id uuid not null references public.flexibility_programs (id) on delete restrict,
  program_slug text not null,
  started_on date not null,
  -- Three days a week. Which three is the person's choice, and can change.
  schedule_weekdays smallint[] not null,
  status text not null default 'active' check (status in ('active', 'completed', 'ended')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flexibility_three_days check (cardinality(schedule_weekdays) = 3),
  constraint flexibility_ended_has_time check ((status = 'active') = (ended_at is null))
);
select public.attach_updated_at('public.flexibility_enrolments');

-- One active enrolment per programme per person: starting again ends the old one.
create unique index if not exists flexibility_enrolments_one_active
  on public.flexibility_enrolments (user_id, program_slug) where status = 'active';

-- ---------------------------------------------------------------------------
-- Sessions, as done
-- ---------------------------------------------------------------------------
alter table public.flexibility_sessions
  add column if not exists enrolment_id uuid references public.flexibility_enrolments (id) on delete cascade,
  add column if not exists status text not null default 'completed',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists ended_at timestamptz,
  add column if not exists warmup text,
  -- [{ "movementSlug": "toe-touch", "side": "both", "setsDone": 2, "easier": false, "intensity": 4 }]
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists skip_reason text;

alter table public.flexibility_sessions drop constraint if exists flexibility_session_status_known;
alter table public.flexibility_sessions add constraint flexibility_session_status_known
  check (status in ('running', 'completed', 'stopped', 'skipped'));

alter table public.flexibility_sessions drop constraint if exists flexibility_session_warmup_known;
alter table public.flexibility_sessions add constraint flexibility_session_warmup_known
  check (warmup is null or warmup in ('standard', 'no_impact', 'already_warm'));

-- A skip is a decision with a reason, as everywhere else in ARETE.
alter table public.flexibility_sessions drop constraint if exists flexibility_skip_has_reason;
alter table public.flexibility_sessions add constraint flexibility_skip_has_reason
  check (status <> 'skipped' or skip_reason is not null);

-- Stopping for pain is recorded as pain, so it can shape what comes next.
alter table public.flexibility_sessions drop constraint if exists flexibility_stop_is_pain;
alter table public.flexibility_sessions add constraint flexibility_stop_is_pain
  check (status <> 'stopped' or pain_reported);

alter table public.flexibility_sessions drop constraint if exists flexibility_notes_length;
alter table public.flexibility_sessions add constraint flexibility_notes_length
  check (notes is null or char_length(notes) <= 1000);

alter table public.flexibility_sessions drop constraint if exists flexibility_items_array;
alter table public.flexibility_sessions add constraint flexibility_items_array
  check (jsonb_typeof(items) = 'array');

create unique index if not exists flexibility_sessions_one_running
  on public.flexibility_sessions (user_id) where status = 'running';

-- A session slot is closed once: done or skipped. Stopped attempts may repeat.
create unique index if not exists flexibility_sessions_slot_closed_once
  on public.flexibility_sessions (enrolment_id, week, day)
  where status in ('completed', 'skipped');

-- ---------------------------------------------------------------------------
-- The weekly self-report
-- ---------------------------------------------------------------------------
create table if not exists public.flexibility_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid not null references public.flexibility_enrolments (id) on delete cascade,
  -- 0 is the baseline, before week one.
  week smallint not null check (week between 0 and 12),
  local_date date not null,
  toe_touch text not null check (toe_touch in ('knees', 'mid_shin', 'ankles', 'toes', 'floor_fingertips', 'floor_palms')),
  leg_raise_left text not null check (leg_raise_left in ('below_45', 'to_70', 'to_90', 'past_90')),
  leg_raise_right text not null check (leg_raise_right in ('below_45', 'to_70', 'to_90', 'past_90')),
  tightness smallint not null check (tightness between 0 and 10),
  socks text not null check (socks in ('hard', 'some_effort', 'easy')),
  pick_up text not null check (pick_up in ('hard', 'some_effort', 'easy')),
  pain text not null check (pain in ('none', 'mild', 'more')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrolment_id, week)
);
select public.attach_updated_at('public.flexibility_checkins');

comment on table public.flexibility_checkins is
  'Self-report only. No photographs are stored, and nothing here is scored: the screen compares measures one by one, in words.';

-- ---------------------------------------------------------------------------
-- Ownership across tables
-- ---------------------------------------------------------------------------
--
-- As with workout sets (0014): RLS checks the row's own user_id, and a foreign
-- key is checked with the owner's rights, so a session or check-in could point
-- at someone else's enrolment. This refuses that.
create or replace function public.guard_flexibility_enrolment_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.enrolment_id is not null and not exists (
    select 1 from public.flexibility_enrolments e
    where e.id = new.enrolment_id and e.user_id = new.user_id
  ) then
    raise exception 'enrolment does not belong to this user' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists flexibility_session_owner on public.flexibility_sessions;
create trigger flexibility_session_owner before insert or update on public.flexibility_sessions
  for each row execute function public.guard_flexibility_enrolment_owner();

drop trigger if exists flexibility_checkin_owner on public.flexibility_checkins;
create trigger flexibility_checkin_owner before insert or update on public.flexibility_checkins
  for each row execute function public.guard_flexibility_enrolment_owner();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['flexibility_enrolments', 'flexibility_checkins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated '
      'using (user_id = public.current_user_id()) '
      'with check (user_id = public.current_user_id())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- Export must cover the new user-owned tables.
create or replace function public.user_owned_tables() returns text[]
language sql immutable as $$
  select array[
    'preferences', 'onboarding_answers', 'onboarding_progress',
    'notification_preferences', 'safety_acknowledgements',
    'health_profile', 'training_profile', 'nutrition_profile', 'mind_profile',
    'goals', 'goal_measurements', 'goal_reviews',
    'milestones', 'projects', 'tasks',
    'task_occurrences', 'habits', 'habit_schedules', 'habit_logs',
    'daily_plans', 'daily_plan_items', 'day_reviews', 'plan_drafts',
    'focus_sessions', 'meditation_sessions',
    'breathwork_sessions', 'cognitive_sessions',
    'workout_sessions', 'workout_logs',
    'flexibility_enrolments', 'flexibility_sessions', 'flexibility_checkins',
    'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
