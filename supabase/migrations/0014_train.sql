-- 0014_train.sql — the Train system: plan inputs, workouts as performed,
-- set-level logging, and the exercise library's instruction text.
--
-- Replayable, like 0012 and 0013: every statement is guarded.

-- ---------------------------------------------------------------------------
-- Plan inputs
-- ---------------------------------------------------------------------------
--
-- `training_profile` already holds what onboarding asked (experience,
-- equipment, minutes). The plan engine needs a little more, and it belongs on
-- the same row: two copies of "how long are your sessions" would disagree
-- within a week.
alter table public.training_profile
  add column if not exists goal text not null default 'general',
  add column if not exists training_weekdays smallint[] not null default '{}',
  add column if not exists activities text[] not null default '{}',
  add column if not exists tennis_weekdays smallint[] not null default '{}',
  -- Current pain flags for training: [{ "region": "knees", "severity": "moderate" }].
  -- Separate from onboarding's injury history, which feeds the safety rules.
  add column if not exists pain_flags jsonb not null default '[]'::jsonb,
  add column if not exists avoid_exercises text[] not null default '{}',
  -- Null until the person has seen and saved a Train setup. The plan is not
  -- shown as theirs before then.
  add column if not exists setup_confirmed_at timestamptz;

alter table public.training_profile drop constraint if exists training_goal_known;
alter table public.training_profile add constraint training_goal_known
  check (goal in ('general', 'strength', 'running', 'tennis'));

alter table public.training_profile drop constraint if exists training_days_two_to_six;
alter table public.training_profile add constraint training_days_two_to_six
  check (
    cardinality(training_weekdays) = 0
    or cardinality(training_weekdays) between 2 and 6
  );

alter table public.training_profile drop constraint if exists training_pain_flags_array;
alter table public.training_profile add constraint training_pain_flags_array
  check (jsonb_typeof(pain_flags) = 'array');

-- ---------------------------------------------------------------------------
-- The library's instruction text
-- ---------------------------------------------------------------------------
--
-- Every exercise carries its own text instruction, animated or not. These
-- columns make the database copy complete; the seed writes them from
-- content/train/exercises.ts.
alter table public.exercises
  add column if not exists pattern text,
  add column if not exists measure text not null default 'reps',
  add column if not exists difficulty smallint,
  add column if not exists per_side boolean not null default false,
  add column if not exists loadable boolean not null default false,
  add column if not exists increment_kg numeric,
  add column if not exists requires text[] not null default '{}',
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists cues jsonb not null default '[]'::jsonb,
  add column if not exists mistakes jsonb not null default '[]'::jsonb,
  add column if not exists stop_if jsonb not null default '[]'::jsonb,
  add column if not exists animation_slug text;

alter table public.exercises drop constraint if exists exercise_measure_known;
alter table public.exercises add constraint exercise_measure_known
  check (measure in ('reps', 'time', 'distance'));

alter table public.exercises drop constraint if exists exercise_difficulty_range;
alter table public.exercises add constraint exercise_difficulty_range
  check (difficulty is null or difficulty between 1 and 5);

-- A loadable exercise must say how big a load step is.
alter table public.exercises drop constraint if exists exercise_increment_when_loadable;
alter table public.exercises add constraint exercise_increment_when_loadable
  check (not loadable or (increment_kg is not null and increment_kg > 0));

-- `unique (user_id, slug)` does not stop two library rows sharing a slug,
-- because nulls are distinct. This does.
create unique index if not exists exercises_library_slug
  on public.exercises (slug) where user_id is null;

-- ---------------------------------------------------------------------------
-- Workouts as performed
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  -- Which planned session this was, e.g. '2-lower_a'. Stable for a setup.
  session_key text not null,
  title_snapshot text not null,
  readiness text not null default 'normal' check (readiness in ('low', 'normal', 'high')),
  minimum_mode boolean not null default false,
  status text not null default 'running' check (status in ('running', 'completed', 'abandoned')),
  -- What was prescribed when the workout started: exercises, targets and the
  -- rule behind each. Editing the plan later never changes a past workout.
  snapshot jsonb not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  client_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_token),
  constraint workout_session_ended_after_start check (ended_at is null or ended_at >= started_at),
  constraint workout_session_end_matches_status check ((status = 'running') = (ended_at is null))
);
select public.attach_updated_at('public.workout_sessions');

create unique index if not exists workout_sessions_one_running
  on public.workout_sessions (user_id) where status = 'running';
create index if not exists workout_sessions_by_day
  on public.workout_sessions (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- Set-level logging
-- ---------------------------------------------------------------------------
alter table public.workout_logs
  add column if not exists workout_session_id uuid references public.workout_sessions (id) on delete cascade,
  add column if not exists exercise_slug text,
  add column if not exists block text,
  add column if not exists distance_m numeric,
  add column if not exists pain smallint,
  add column if not exists form_ok boolean,
  add column if not exists notes text,
  add column if not exists completed boolean not null default true,
  add column if not exists substituted_from text;

alter table public.workout_logs drop constraint if exists workout_log_pain_range;
alter table public.workout_logs add constraint workout_log_pain_range
  check (pain is null or pain between 0 and 10);

alter table public.workout_logs drop constraint if exists workout_log_distance_positive;
alter table public.workout_logs add constraint workout_log_distance_positive
  check (distance_m is null or distance_m >= 0);

alter table public.workout_logs drop constraint if exists workout_log_notes_length;
alter table public.workout_logs add constraint workout_log_notes_length
  check (notes is null or char_length(notes) <= 280);

alter table public.workout_logs drop constraint if exists workout_log_block_known;
alter table public.workout_logs add constraint workout_log_block_known
  check (block is null or block in ('warmup', 'primary', 'accessory', 'cooldown'));

-- One row per set: logging the same set again corrects it rather than
-- duplicating it.
create unique index if not exists workout_logs_one_per_set
  on public.workout_logs (workout_session_id, exercise_slug, set_index)
  where workout_session_id is not null;

-- RLS checks the row's own user_id. It does not check that the workout the
-- row points at belongs to the same person, and a foreign key is checked with
-- the owner's rights, not the caller's. This closes that gap.
create or replace function public.guard_workout_log_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.workout_session_id is not null and not exists (
    select 1 from public.workout_sessions s
    where s.id = new.workout_session_id and s.user_id = new.user_id
  ) then
    raise exception 'workout session does not belong to this user' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists workout_log_owner on public.workout_logs;
create trigger workout_log_owner before insert or update on public.workout_logs
  for each row execute function public.guard_workout_log_owner();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'alter table public.workout_sessions enable row level security';
  execute 'alter table public.workout_sessions force row level security';
  execute 'drop policy if exists own_rows on public.workout_sessions';
  execute 'create policy own_rows on public.workout_sessions for all to authenticated
    using (user_id = public.current_user_id()) with check (user_id = public.current_user_id())';
  execute 'grant select, insert, update, delete on public.workout_sessions to authenticated';
end
$$;

-- Export must cover the new user-owned table.
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
    'flexibility_sessions', 'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
