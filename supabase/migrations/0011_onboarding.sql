-- 0011_onboarding.sql — what onboarding collects, and the safety flags it sets.
--
-- Two kinds of thing live here, and the split is deliberate:
--
--   * `onboarding_answers` (0002) holds every raw answer, so the flow can be
--     resumed and revisited without interpretation.
--   * The profile tables below hold the small number of facts that actually
--     *gate* behaviour. Anything a safety rule reads is a typed column, never a
--     key inside a json blob, because a blob cannot be constrained, indexed or
--     reviewed.

-- ---------------------------------------------------------------------------
-- Resume
-- ---------------------------------------------------------------------------
create table public.onboarding_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_step text not null default 'intent',
  -- Steps the user has finished or deliberately skipped. Skipping is a first
  -- class outcome: the flow must be completable in four minutes by someone who
  -- wants to answer almost nothing.
  completed_steps text[] not null default '{}',
  skipped_steps text[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.onboarding_progress');

-- ---------------------------------------------------------------------------
-- Age gate
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column birth_year smallint check (birth_year between 1900 and 2100),
  -- Set only when a guardian or clinician has agreed targets for a minor.
  add column guardian_confirmed_at timestamptz;

comment on column public.profiles.birth_year is
  'Year only — the app never needs a date of birth. Drives the age gate in src/domain/safety.ts.';

-- ---------------------------------------------------------------------------
-- Planning preferences
-- ---------------------------------------------------------------------------
alter table public.preferences
  add column planning_style text not null default 'light'
    check (planning_style in ('light', 'structured')),
  -- 0 = Sunday. Days the user says they are generally available.
  add column available_weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  -- Free text is wrong here; these are the shapes the plan generator reasons about.
  add column weekday_constraint text not null default 'none'
    check (weekday_constraint in ('none', 'work', 'school', 'shift', 'caring'));

-- ---------------------------------------------------------------------------
-- Health — every column here can block a module
-- ---------------------------------------------------------------------------
create table public.health_profile (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Asked plainly, answered optionally, never diagnosed from.
  pregnancy_status text not null default 'not_applicable'
    check (pregnancy_status in ('not_applicable', 'pregnant', 'postpartum', 'prefer_not_to_say')),
  cardiovascular_or_fainting_history boolean not null default false,
  heat_sensitivity boolean not null default false,
  cold_sensitivity boolean not null default false,
  -- Set by the user, or by a safety rule that decides the combination warrants it.
  medical_clearance_needed boolean not null default false,
  medical_clearance_confirmed_at timestamptz,
  -- [{ "region": "hamstrings", "severity": "mild"|"moderate"|"severe", "since": "2026-01-02" }]
  injuries jsonb not null default '[]'::jsonb,
  mobility_limitations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.health_profile');

comment on table public.health_profile is
  'Self-reported, never diagnostic. ARETE does not infer a condition from these answers; it only declines to generate things that would be unwise given them.';

-- ---------------------------------------------------------------------------
-- Training
-- ---------------------------------------------------------------------------
create table public.training_profile (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  experience text not null default 'returning'
    check (experience in ('new', 'returning', 'consistent', 'experienced')),
  recent_activity text not null default 'light'
    check (recent_activity in ('none', 'light', 'moderate', 'high')),
  desired_outcomes text[] not null default '{}',
  -- 'none' is a complete answer. Bodyweight plans exist for a reason.
  equipment text[] not null default '{none}',
  session_minutes smallint not null default 30 check (session_minutes between 5 and 180),
  preferred_weekdays smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.training_profile');

-- ---------------------------------------------------------------------------
-- Nutrition
-- ---------------------------------------------------------------------------
create table public.nutrition_profile (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  logging_goal text not null default 'awareness'
    check (logging_goal in ('none', 'awareness', 'protein', 'full_macros')),
  -- For anyone who would rather not see numbers at all. Honoured everywhere.
  hide_calorie_numbers boolean not null default false,
  dietary_preferences text[] not null default '{}',
  allergies text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.nutrition_profile');

-- ---------------------------------------------------------------------------
-- Mind
-- ---------------------------------------------------------------------------
create table public.mind_profile (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  meditation_experience text not null default 'new'
    check (meditation_experience in ('new', 'some', 'regular')),
  breathwork_experience text not null default 'new'
    check (breathwork_experience in ('new', 'some', 'regular')),
  -- Packs the user *chose*, by slug. Nothing is ever added here by inference.
  chosen_pack_slugs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.mind_profile');

comment on column public.mind_profile.chosen_pack_slugs is
  'Only ever written from an explicit choice. The Jewish meditation pack in particular is never added from a name, a language, a region or any other signal (SOURCE_MAP §5).';

-- ---------------------------------------------------------------------------
-- The draft week onboarding produces, before the user accepts it
-- ---------------------------------------------------------------------------
create table public.plan_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_on date not null,
  timezone text not null,
  -- The generated week plus the reason attached to every item, exactly as the
  -- generator produced it. Kept so that "why is this here?" has an answer after
  -- the fact, and so a regenerated plan can be diffed against what was shown.
  draft jsonb not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.plan_drafts');

create index plan_drafts_by_user on public.plan_drafts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The age gate, enforced in the database
-- ---------------------------------------------------------------------------
--
-- A minor may use the app. A minor may not be handed a calorie prescription by
-- software. This is a trigger rather than a check constraint because it reads
-- another table, and it exists rather than living only in the plan generator
-- because an application rule that guards a child is the wrong rule to have in
-- exactly one place.
create or replace function public.guard_minor_nutrition_targets() returns trigger
language plpgsql as $$
declare
  year_of_birth smallint;
  guardian timestamptz;
begin
  if new.calories is null and new.is_enabled = false then
    return new;
  end if;

  select p.birth_year, p.guardian_confirmed_at
    into year_of_birth, guardian
    from public.profiles p
   where p.id = new.user_id;

  if year_of_birth is not null
     and (extract(year from now())::int - year_of_birth) < 18
     and guardian is null then
    raise exception
      'Calorie targets for a user under 18 need guardian or clinician confirmation (profiles.guardian_confirmed_at).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger guard_minor_nutrition_targets
  before insert or update on public.nutrition_targets
  for each row execute function public.guard_minor_nutrition_targets();

-- ---------------------------------------------------------------------------
-- Row-level security for everything added above
-- ---------------------------------------------------------------------------
do $$
declare
  owned text[] := array[
    'onboarding_progress', 'health_profile', 'training_profile',
    'nutrition_profile', 'mind_profile', 'plan_drafts'
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

-- Export must cover the new tables, or an export quietly loses them.
create or replace function public.user_owned_tables() returns text[]
language sql immutable as $$
  select array[
    'preferences', 'onboarding_answers', 'onboarding_progress',
    'notification_preferences', 'safety_acknowledgements',
    'health_profile', 'training_profile', 'nutrition_profile', 'mind_profile',
    'goals', 'milestones', 'projects', 'tasks',
    'task_occurrences', 'habits', 'habit_schedules', 'habit_logs',
    'daily_plans', 'daily_plan_items', 'plan_drafts',
    'focus_sessions', 'meditation_sessions',
    'breathwork_sessions', 'cognitive_sessions', 'workout_logs',
    'flexibility_sessions', 'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
