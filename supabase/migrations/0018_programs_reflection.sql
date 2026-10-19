-- 0018_programs_reflection.sql — the 60-day reset as an editable programme,
-- the Stoic journal's extra prompts, the weekly review, and contrast therapy
-- as an optional, screened pack.
--
-- Replayable, like 0012 onwards: every statement is guarded.

-- ---------------------------------------------------------------------------
-- The journal: the morning and evening pages are Today's framing and review
-- ---------------------------------------------------------------------------
alter table public.daily_plans
  -- The quality the person means to practise today (domain/journal.ts VIRTUES).
  add column if not exists virtue text,
  -- Today's likely obstacle, and how they will meet it.
  add column if not exists obstacle text;

alter table public.daily_plans drop constraint if exists daily_plan_virtue_known;
alter table public.daily_plans add constraint daily_plan_virtue_known
  check (virtue is null or virtue in ('wisdom', 'courage', 'justice', 'temperance'));

alter table public.day_reviews
  add column if not exists learned text;

-- A weekly review is one row per prompt, on the Monday that starts the week.
create unique index if not exists journal_weekly_one_per_prompt
  on public.journal_entries (user_id, local_date, prompt) where kind = 'weekly_review';

-- ---------------------------------------------------------------------------
-- The reset programme
-- ---------------------------------------------------------------------------
create table if not exists public.reset_enrolments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_slug text not null default 'reset-60-day',
  started_on date not null,
  timezone text not null,
  -- Everything the person changed: components on or off, their own ranges,
  -- wake and bed times, climate, intensity, the extension week. Validated by
  -- resetCustomisationSchema; the targets themselves are never stored (D65).
  customisation jsonb not null default '{}'::jsonb check (jsonb_typeof(customisation) = 'object'),
  status text not null default 'active' check (status in ('active', 'finished', 'ended')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reset_ended_has_time check ((status = 'active') = (ended_at is null))
);
select public.attach_updated_at('public.reset_enrolments');

create unique index if not exists reset_enrolments_one_active
  on public.reset_enrolments (user_id) where status = 'active';

-- Pause and sick stop the programme clock; travel keeps it running.
create table if not exists public.reset_breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid not null references public.reset_enrolments (id) on delete cascade,
  kind text not null check (kind in ('pause', 'travel', 'sick')),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint reset_break_order check (ends_on is null or ends_on >= starts_on),
  constraint reset_travel_has_end check (kind <> 'travel' or ends_on is not null)
);
create index if not exists reset_breaks_by_enrolment on public.reset_breaks (enrolment_id, starts_on);

-- One row per component per day. The programme day and the target's text are
-- recorded as they were, so a later break or edit never rewrites history.
create table if not exists public.reset_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid not null references public.reset_enrolments (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  program_day smallint not null check (program_day between 1 and 66),
  component text not null check (component in (
    'wake', 'hydration', 'movement', 'study', 'reading', 'meditation',
    'cold', 'screen', 'evening', 'sleep', 'weekly')),
  status text not null check (status in ('done', 'skipped')),
  target_text text not null default '',
  logged_at timestamptz not null default now(),
  unique (enrolment_id, local_date, component)
);
create index if not exists reset_logs_by_day on public.reset_logs (user_id, local_date);

create table if not exists public.reset_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid not null references public.reset_enrolments (id) on delete cascade,
  program_week smallint not null check (program_week between 1 and 10),
  choice text not null check (choice in ('easier', 'same', 'harder')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (enrolment_id, program_week)
);

-- ---------------------------------------------------------------------------
-- Contrast therapy
-- ---------------------------------------------------------------------------
-- Health answers. Deleted whole when the person turns the pack off.
create table if not exists public.contrast_screenings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  clinician_cleared boolean not null default false,
  screened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.contrast_screenings');

comment on table public.contrast_screenings is
  'Opt-in. Health answers for the contrast-therapy screen; the pack stays off until this row and a current safety acknowledgement exist.';

create table if not exists public.contrast_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  -- The protocol as run: { heatSeconds, coldSeconds, cycles, finishOn }.
  protocol jsonb not null check (jsonb_typeof(protocol) = 'object'),
  phases_completed smallint not null check (phases_completed >= 0),
  status text not null check (status in ('completed', 'stopped')),
  stop_reason text check (stop_reason is null or stop_reason in ('dizzy', 'unwell', 'too_cold', 'too_hot', 'other')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token),
  constraint contrast_ended_after_start check (ended_at >= started_at)
);
create index if not exists contrast_sessions_by_day on public.contrast_sessions (user_id, local_date);

-- ---------------------------------------------------------------------------
-- Ownership across tables
-- ---------------------------------------------------------------------------
create or replace function public.guard_reset_enrolment_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.reset_enrolments e
    where e.id = new.enrolment_id and e.user_id = new.user_id
  ) then
    raise exception 'enrolment does not belong to this user' using errcode = '42501';
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['reset_breaks', 'reset_logs', 'reset_checkins'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function public.guard_reset_enrolment_owner()', t || '_owner', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['reset_enrolments', 'reset_breaks', 'reset_logs', 'reset_checkins',
                           'contrast_screenings', 'contrast_sessions'] loop
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
    'nutrition_targets', 'meals', 'food_entries', 'hydration_logs', 'oil_awareness',
    'reset_enrolments', 'reset_breaks', 'reset_logs', 'reset_checkins',
    'contrast_screenings', 'contrast_sessions',
    'body_metrics', 'journal_entries', 'analytics_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;

-- ---------------------------------------------------------------------------
-- Content: the reset ships as 60 days, with an optional extension week
-- ---------------------------------------------------------------------------
-- SOURCE_MAP §1, revised in stage 11: the programme is sixty days, its title's
-- number; the source's days 61–66 are an optional extension week. Nothing is
-- imported silently.
update public.content_packs
  set title = '60-Day Reset',
      provenance_note = 'The source PDF is titled 60-Day and contains 66 numbered days. ARETE runs 60 days; days 61-66 are an optional extension week the person can add. Every target is an editable range.'
  where slug = 'reset-66-day';
