-- 0006_nutrition_body.sql — food and body measurements.
--
-- Nutrition in ARETE is awareness, not doctrine. Targets are optional and off
-- by default; a meal logged with no numbers still counts (PRODUCT_SPEC §5.5).
-- Energy is stored in kilocalories and mass in grams regardless of the user's
-- display units.

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  effective_to date,
  -- All nullable: a user may track protein only, or nothing at all.
  calories integer check (calories > 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_target_range check (effective_to is null or effective_to >= effective_from)
);
select public.attach_updated_at('public.nutrition_targets');

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  -- Null = the small shipped list. Not null = the user's own entry.
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  brand text,
  serving_label text not null default '100 g',
  serving_grams numeric not null default 100 check (serving_grams > 0),
  calories numeric check (calories >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  source text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.foods');

create index foods_by_name on public.foods (user_id, lower(name));

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  slot text not null default 'other'
    check (slot in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  eaten_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.meals');

create index meals_by_day on public.meals (user_id, local_date);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  meal_id uuid not null references public.meals (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  -- Free text is allowed and expected. "Dinner at my sister's" is a valid entry
  -- with no numbers at all, and the app must not nag for them.
  description text,
  quantity numeric check (quantity > 0),
  unit text,
  calories numeric check (calories >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token),
  constraint food_entry_has_something check (food_id is not null or description is not null)
);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  measured_at timestamptz not null default now(),
  -- Canonical metric. Pounds and inches are a display conversion only.
  weight_kg numeric check (weight_kg > 0),
  body_fat_pct numeric check (body_fat_pct between 0 and 100),
  waist_cm numeric check (waist_cm > 0),
  resting_heart_rate smallint check (resting_heart_rate between 20 and 200),
  sleep_minutes integer check (sleep_minutes between 0 and 1440),
  -- 1-5, the user's own read on how ready they feel. Feeds the adaptive engine.
  readiness smallint check (readiness between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

comment on table public.body_metrics is
  'Every column is optional and the whole module is opt-in. Weight is never asked for during onboarding (PRODUCT_SPEC §5.1).';
