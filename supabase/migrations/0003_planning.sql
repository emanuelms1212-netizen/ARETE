-- 0003_planning.sql — goals down to a single day's commitments.
--
-- The template/instance/log split matters here. `tasks` and `habits` are
-- definitions that can be edited without rewriting history; `task_occurrences`
-- and `habit_logs` are what actually happened on a given local day.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  why text,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'abandoned')),
  target_date date,
  -- Soft delete: sessions keep an immutable snapshot of their goal's title, and
  -- removing a goal must never remove the history attached to it.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.goals');

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null,
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.milestones');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'abandoned')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.projects');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  goal_id uuid references public.goals (id) on delete set null,
  title text not null,
  notes text,
  estimate_minutes integer check (estimate_minutes > 0),
  priority smallint not null default 0 check (priority between 0 and 3),
  due_date date,
  -- Null for a one-off. Otherwise the recurrence rule, validated in the domain
  -- layer by src/domain/recurrence.ts rather than by a check constraint, so the
  -- rules and the tests live in one language.
  recurrence jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.tasks');

comment on column public.tasks.recurrence is
  'Shape: { "freq": "daily"|"weekly"|"monthly", "interval": int, "weekdays": [0-6], "monthDay": int, "until": date }';

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  skip_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One occurrence per task per local day. This is what makes a repeated
  -- "complete" from a flaky connection a no-op rather than a duplicate.
  unique (user_id, task_id, local_date),
  constraint task_occurrence_done_has_time check (status <> 'done' or completed_at is not null),
  constraint task_occurrence_skip_has_reason check (status <> 'skipped' or skip_reason is not null)
);
select public.attach_updated_at('public.task_occurrences');

create index task_occurrences_by_day on public.task_occurrences (user_id, local_date);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  title text not null,
  -- The user's own minimum for a real day, in `unit`. Null means "did it or not".
  minimum_target numeric check (minimum_target > 0),
  unit text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.habits');

create table public.habit_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  rule jsonb not null,
  effective_from date not null,
  -- Null means "still in force". Changing a schedule closes the old row and
  -- opens a new one, so past days still expand with the rule that applied then.
  effective_to date,
  created_at timestamptz not null default now(),
  constraint habit_schedule_range check (effective_to is null or effective_to >= effective_from)
);

create index habit_schedules_by_habit on public.habit_schedules (user_id, habit_id, effective_from);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  value numeric,
  status text not null default 'done' check (status in ('done', 'skipped')),
  skip_reason text,
  completed_at timestamptz not null default now(),
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, local_date)
);

create index habit_logs_by_day on public.habit_logs (user_id, local_date);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  -- Null until the user commits. Committing freezes intent so that
  -- plan-to-actual stays honest when the day is edited afterwards.
  committed_at timestamptz,
  mark text not null default 'normal' check (mark in ('normal', 'travel', 'not_today')),
  mark_reason text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
select public.attach_updated_at('public.daily_plans');

-- Not in the brief's minimum list, but a plan with no items cannot represent a
-- day. This is the Commitment the Today screen renders.
create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  daily_plan_id uuid not null references public.daily_plans (id) on delete cascade,
  kind text not null check (
    kind in ('habit', 'task', 'focus', 'workout', 'mobility', 'mind', 'food', 'review')
  ),
  -- The row this item points at, in the table named by `kind`. Kept loose on
  -- purpose: a plan item outlives the thing it referred to, and the snapshot
  -- below is what the day is rendered from.
  ref_id uuid,
  title_snapshot text not null,
  is_minimum boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  skip_reason text,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_item_skip_has_reason check (status <> 'skipped' or skip_reason is not null)
);
select public.attach_updated_at('public.daily_plan_items');

create index daily_plan_items_by_plan on public.daily_plan_items (user_id, daily_plan_id, position);
