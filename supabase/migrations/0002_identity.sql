-- 0002_identity.sql — who the user is and how they want to be treated.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- IANA zone. Every local_date in this schema is relative to the zone stored
  -- on the row that recorded it, not to this one; this is the default for new
  -- records and the zone the user is asked to confirm when their device moves.
  timezone text not null default 'UTC',
  locale text not null default 'en',
  onboarded_at timestamptz,
  -- Set when the user asks for deletion. Rows are removed immediately by
  -- delete_my_account(); this column exists for the brief window between the
  -- request and the cascade completing, and for support to see the state.
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.profiles');

comment on table public.profiles is 'One row per account. Deleting auth.users cascades through every table.';

create table public.preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Display only. Everything is stored metric; see 0001.
  unit_system text not null default 'metric' check (unit_system in ('metric', 'us')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  -- Deliberately nullable: ARETE imposes no wake or sleep time. See SOURCE_MAP §1.
  wake_time time,
  sleep_time time,
  minimum_day_size smallint not null default 1 check (minimum_day_size between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.preferences');

create table public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null,
  answer jsonb not null,
  answered_at timestamptz not null default now(),
  unique (user_id, step)
);

comment on table public.onboarding_answers is
  'Answers are kept so onboarding can be resumed and revisited. Religion, ethnicity and body weight are never asked here.';

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Null means off. Nothing is scheduled until the user chooses a time.
  morning_plan_at time,
  evening_review_at time,
  focus_session_end boolean not null default true,
  program_day_ready boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time,
  -- Kinds the app muted itself after two ignored notifications (PRODUCT_SPEC §8).
  auto_muted_kinds text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.notification_preferences');

create table public.safety_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic text not null check (
    topic in ('contrast_therapy', 'cold_exposure', 'loaded_mobility', 'fasting', 'nutrition')
  ),
  -- Which wording they saw. A reworded notice needs a fresh acknowledgement.
  notice_version text not null,
  acknowledged_at timestamptz not null default now(),
  unique (user_id, topic, notice_version)
);

comment on table public.safety_acknowledgements is
  'A gate, not a disclaimer dump: a module that can hurt someone stays off until the matching row exists.';
