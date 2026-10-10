-- 0005_training.sql — exercises, workouts and flexibility.
--
-- Library rows (`user_id is null`) are ARETE's own content and are readable by
-- everyone; a row with a `user_id` is that user's own exercise or plan. The
-- rights columns are load-bearing: see docs/SOURCE_MAP.md §7, where the
-- flexibility programs are recorded as needing permission before they ship.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- Null = shipped library content. Not null = the user wrote it.
  user_id uuid references public.profiles (id) on delete cascade,
  slug text not null,
  name text not null,
  -- ARETE's own words. Never the source author's phrasing.
  cue text,
  primary_region text check (
    primary_region in (
      'hamstrings', 'hips', 'spine', 'shoulders', 'chest', 'back',
      'quads', 'glutes', 'calves', 'arms', 'core', 'full_body'
    )
  ),
  equipment text not null default 'none',
  -- The easier version offered whenever a movement is skipped for pain.
  regression_exercise_id uuid references public.exercises (id) on delete set null,
  -- Body regions an injury flag on which excludes this movement everywhere.
  loads_regions text[] not null default '{}',
  content_pack_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
select public.attach_updated_at('public.exercises');

create table public.exercise_animation_assets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  kind text not null check (kind in ('svg', 'lottie', 'static')),
  uri text not null,
  -- Must be true for anything that ships. A traced or adapted third-party
  -- illustration is not original, and 0009 keeps this table service-role only.
  is_original boolean not null default true,
  author text,
  licence text,
  created_at timestamptz not null default now()
);

comment on table public.exercise_animation_assets is
  'ARETE draws its own movement animations. No asset here may be traced from a source PDF''s photographs (SOURCE_MAP §7).';

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  slug text not null,
  name text not null,
  focus text,
  weeks smallint not null check (weeks > 0),
  days_per_week smallint not null check (days_per_week between 1 and 7),
  content_pack_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
select public.attach_updated_at('public.workout_plans');

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans (id) on delete cascade,
  week smallint not null check (week > 0),
  day smallint not null check (day > 0),
  name text,
  notes text,
  unique (workout_plan_id, week, day)
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position smallint not null default 0,
  sets smallint not null default 1 check (sets > 0),
  -- A movement is counted either in reps or by time, never both.
  reps smallint check (reps > 0),
  hold_seconds smallint check (hold_seconds > 0),
  -- Canonical kilograms; converted for display when preferences say 'us'.
  load_kg numeric check (load_kg >= 0),
  rest_seconds smallint check (rest_seconds >= 0),
  constraint workout_exercise_reps_or_time check (num_nonnulls(reps, hold_seconds) = 1)
);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_day_id uuid references public.workout_days (id) on delete set null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  exercise_name_snapshot text not null,
  local_date date not null,
  timezone text not null,
  set_index smallint not null check (set_index > 0),
  reps smallint check (reps >= 0),
  hold_seconds smallint check (hold_seconds >= 0),
  load_kg numeric check (load_kg >= 0),
  rpe numeric check (rpe between 1 and 10),
  -- True when the session was adapted rather than performed as written. An
  -- adapted session is a completed session, never a failure.
  adapted boolean not null default false,
  skip_reason text,
  performed_at timestamptz not null default now(),
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token)
);

create index workout_logs_by_day on public.workout_logs (user_id, local_date);

create table public.flexibility_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  slug text not null,
  name text not null,
  region text not null,
  weeks smallint not null check (weeks > 0),
  days_per_week smallint not null check (days_per_week between 1 and 7),
  content_pack_id uuid,
  -- Gate. A program may not be served to users until its rights are settled.
  rights_status text not null default 'pending'
    check (rights_status in ('cleared', 'pending', 'blocked')),
  rights_note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
select public.attach_updated_at('public.flexibility_programs');

comment on column public.flexibility_programs.rights_status is
  'Open risk in PROJECT_LEDGER §7. The Total Flexibility programs stay ''pending'' until permission is obtained or ARETE derives its own progression.';

create table public.flexibility_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  flexibility_program_id uuid references public.flexibility_programs (id) on delete set null,
  week smallint not null check (week > 0),
  day smallint not null check (day > 0),
  local_date date not null,
  timezone text not null,
  completed_at timestamptz,
  adapted boolean not null default false,
  -- Reported pain ends the movement and offers the regression. It is recorded
  -- because it should change what is generated next, not to score the user.
  pain_reported boolean not null default false,
  pain_note text,
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token)
);

create index flexibility_sessions_by_day on public.flexibility_sessions (user_id, local_date);
