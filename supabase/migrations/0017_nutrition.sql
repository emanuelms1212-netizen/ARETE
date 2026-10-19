-- 0017_nutrition.sql — manual-first food logging, targets as ranges, water,
-- an optional weight trend, and the optional ingredient/oil awareness.
--
-- Replayable, like 0012 onwards: every statement is guarded.

-- ---------------------------------------------------------------------------
-- Settings: on the onboarding row, so there is one place for them
-- ---------------------------------------------------------------------------
alter table public.nutrition_profile
  add column if not exists goal text not null default 'none',
  add column if not exists activity text not null default 'light',
  add column if not exists sex_for_calculation text not null default 'unspecified',
  add column if not exists birth_year smallint,
  add column if not exists height_cm numeric,
  add column if not exists hide_all_numbers boolean not null default false,
  -- The person said counting or weighing has not helped them. Hides numbers,
  -- removes deficits and the weight trend (domain/nutrition.ts).
  add column if not exists eating_disorder_caution boolean not null default false,
  add column if not exists prescribed_diet boolean not null default false,
  add column if not exists weight_trend_enabled boolean not null default false;

alter table public.nutrition_profile drop constraint if exists nutrition_goal_known;
alter table public.nutrition_profile add constraint nutrition_goal_known
  check (goal in ('maintain', 'lose_gently', 'gain', 'none'));
alter table public.nutrition_profile drop constraint if exists nutrition_activity_known;
alter table public.nutrition_profile add constraint nutrition_activity_known
  check (activity in ('sedentary', 'light', 'moderate', 'active'));
alter table public.nutrition_profile drop constraint if exists nutrition_sex_known;
alter table public.nutrition_profile add constraint nutrition_sex_known
  check (sex_for_calculation in ('female', 'male', 'unspecified'));
alter table public.nutrition_profile drop constraint if exists nutrition_height_sane;
alter table public.nutrition_profile add constraint nutrition_height_sane
  check (height_cm is null or height_cm between 100 and 250);

-- ---------------------------------------------------------------------------
-- Targets a person sets: an override of the calculated ones
-- ---------------------------------------------------------------------------
--
-- Calculated targets are never stored; they follow from the settings, like the
-- training plan (ledger D65). What is stored is a person's own numbers, or
-- their clinician's, and the fact of which.
alter table public.nutrition_targets
  add column if not exists fiber_g numeric check (fiber_g >= 0),
  add column if not exists water_ml numeric check (water_ml >= 0),
  add column if not exists from_clinician boolean not null default false;

create unique index if not exists nutrition_targets_one_current
  on public.nutrition_targets (user_id) where effective_to is null;

-- ---------------------------------------------------------------------------
-- Foods and recipes
-- ---------------------------------------------------------------------------
-- A serving need not be weighed: "1 bowl" is a serving. The weight is optional.
alter table public.foods alter column serving_grams drop not null;
alter table public.foods alter column serving_grams drop default;
alter table public.foods alter column serving_label set default '1 serving';

alter table public.foods
  add column if not exists fiber_g numeric check (fiber_g >= 0),
  add column if not exists is_favourite boolean not null default false,
  -- A recipe: [{ "foodId": "…", "servings": 2 }]. Its numbers are calculated
  -- from these when saved, and stored, so a later edit to an ingredient does
  -- not silently rewrite meals already logged.
  add column if not exists ingredients jsonb not null default '[]'::jsonb,
  add column if not exists servings_made numeric check (servings_made > 0);

-- Where the numbers came from. Shown beside every food.
alter table public.foods drop constraint if exists food_source_known;
alter table public.foods add constraint food_source_known
  check (source is null or source in ('label', 'estimate', 'recipe', 'synthetic-demo'));

alter table public.foods drop constraint if exists food_recipe_complete;
alter table public.foods add constraint food_recipe_complete
  check (source is distinct from 'recipe' or (jsonb_array_length(ingredients) > 0 and servings_made is not null));

-- ---------------------------------------------------------------------------
-- Entries: one meal row per day and slot
-- ---------------------------------------------------------------------------
create unique index if not exists meals_one_per_slot on public.meals (user_id, local_date, slot);

alter table public.food_entries
  add column if not exists fiber_g numeric check (fiber_g >= 0),
  -- 'label' | 'estimate' | 'recipe' | 'synthetic-demo' | 'quick-add'
  add column if not exists source text,
  add column if not exists updated_at timestamptz not null default now();
select public.attach_updated_at('public.food_entries');

alter table public.food_entries drop constraint if exists food_entry_source_known;
alter table public.food_entries add constraint food_entry_source_known
  check (source is null or source in ('label', 'estimate', 'recipe', 'synthetic-demo', 'quick-add'));

-- ---------------------------------------------------------------------------
-- Water
-- ---------------------------------------------------------------------------
create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  -- Canonical millilitres; fluid ounces are a display conversion.
  ml numeric not null check (ml > 0 and ml <= 5000),
  logged_at timestamptz not null default now(),
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token)
);
create index if not exists hydration_by_day on public.hydration_logs (user_id, local_date);

-- ---------------------------------------------------------------------------
-- Ingredient / oil awareness — optional, off by default, deletable
-- ---------------------------------------------------------------------------
--
-- The row's existence is the switch: no row, no feature. Turning it off
-- deletes the row, and with it the list and every label note, because the
-- brief asks that it "can be deleted with all related data" — and keeping
-- someone's food beliefs after they switched the feature off would be odd.
create table if not exists public.oil_awareness (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cooking_oils text[] not null default '{}',
  -- [{ "ingredient": "canola", "stance": "limit" }]
  list jsonb not null default '[]'::jsonb check (jsonb_typeof(list) = 'array'),
  -- { "<food id>": "label text" }
  label_notes jsonb not null default '{}'::jsonb check (jsonb_typeof(label_notes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.oil_awareness');

comment on table public.oil_awareness is
  'Optional preference, off by default. Informed by one author''s viewpoint (SOURCE_MAP §6), presented as such. Deleted whole when turned off.';

-- ---------------------------------------------------------------------------
-- Ownership across tables
-- ---------------------------------------------------------------------------
create or replace function public.guard_food_entry_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.meals m where m.id = new.meal_id and m.user_id = new.user_id) then
    raise exception 'meal does not belong to this user' using errcode = '42501';
  end if;
  if new.food_id is not null and not exists (
    select 1 from public.foods f where f.id = new.food_id and (f.user_id = new.user_id or f.user_id is null)
  ) then
    raise exception 'food does not belong to this user' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists food_entry_owner on public.food_entries;
create trigger food_entry_owner before insert or update on public.food_entries
  for each row execute function public.guard_food_entry_owner();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['hydration_logs', 'oil_awareness'] loop
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
    'body_metrics', 'journal_entries', 'analytics_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
