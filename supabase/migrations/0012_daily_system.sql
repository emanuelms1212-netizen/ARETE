-- 0012_daily_system.sql — what the day loop needs that the foundation did not have.
--
-- Stage 4 built the skeleton: goals, tasks, habits, plans. Stage 6 builds the
-- screens that use them, and the screens need things the skeleton left out —
-- a habit that counts rather than ticks, a goal measured by something other
-- than how many boxes were checked, a timer that survives a refresh, and a day
-- that has a beginning and an end rather than only a middle.
--
-- This file is written to be replayable: `db:migrate` applies every migration
-- in order, so every statement here is guarded. `add constraint` has no
-- `if not exists`, so each one is preceded by `drop constraint if exists`.

-- ---------------------------------------------------------------------------
-- Habits: four kinds, not one
-- ---------------------------------------------------------------------------
--
-- `binary` did it or not. `count` reps, pages, glasses. `duration` minutes.
-- `limit` is the one that inverts: a ceiling to stay under, where a smaller
-- number is the success. Treating a limit habit as a target is how an app ends
-- up congratulating someone for a personal best in the thing they are trying
-- to do less of.
alter table public.habits
  add column if not exists kind text not null default 'binary',
  -- What a good day looks like, in `unit`. `minimum_target` is already the
  -- floor; this is the number the user is actually aiming at.
  add column if not exists target_value numeric,
  -- A habit may be paused without being archived: archiving ends it, pausing
  -- says "not this month". A paused habit expands onto no day and breaks no
  -- streak, because a deliberate pause is not a failure.
  add column if not exists paused_at timestamptz;

comment on column public.habits.kind is
  'binary | count | duration | limit. For `limit`, target_value is a ceiling and lower is better.';

alter table public.habits drop constraint if exists habit_kind_known;
alter table public.habits add constraint habit_kind_known
  check (kind in ('binary', 'count', 'duration', 'limit'));

alter table public.habits drop constraint if exists habit_target_positive;
alter table public.habits add constraint habit_target_positive
  check (target_value is null or target_value > 0);

alter table public.habits drop constraint if exists habit_measured_kinds_have_target;
alter table public.habits add constraint habit_measured_kinds_have_target
  check (kind = 'binary' or target_value is not null);

-- A floor above the target is incoherent — except for a limit habit, where the
-- target is a ceiling and the relationship inverts.
alter table public.habits drop constraint if exists habit_minimum_within_target;
alter table public.habits add constraint habit_minimum_within_target
  check (
    minimum_target is null
    or target_value is null
    or kind = 'limit'
    or minimum_target <= target_value
  );

-- A rest day is not a skipped day. "Skipped" is the user choosing not to;
-- "rest" is the schedule saying they did not have to. Collapsing them would
-- make a rest day look like a lapse in the one place the user goes to find out
-- whether they are lapsing.
alter table public.habit_logs drop constraint if exists habit_logs_status_check;
alter table public.habit_logs add constraint habit_logs_status_check
  check (status in ('done', 'partial', 'skipped', 'rest'));

alter table public.habit_logs drop constraint if exists habit_log_skip_has_reason;
alter table public.habit_logs add constraint habit_log_skip_has_reason
  check (status <> 'skipped' or skip_reason is not null);

-- "Partial" is a claim about a quantity, so it needs the quantity. Without
-- this, a partial log is indistinguishable from a shrug.
alter table public.habit_logs drop constraint if exists habit_log_partial_has_value;
alter table public.habit_logs add constraint habit_log_partial_has_value
  check (status <> 'partial' or value is not null);

-- ---------------------------------------------------------------------------
-- Goals: measured by something other than how busy you were
-- ---------------------------------------------------------------------------
alter table public.goals
  -- `why` holds the motivation. This holds the test: the sentence that says
  -- how the user will know, without arguing with themselves about it.
  add column if not exists success_measure text,
  add column if not exists measure_unit text,
  add column if not exists start_value numeric,
  add column if not exists target_value numeric,
  -- A target date is "by when". A maintenance date is "and still true on".
  -- Goals that are habits in disguise need the second one, and a goal with
  -- only the first quietly expires the day it is reached.
  add column if not exists maintenance_date date,
  add column if not exists review_day smallint;

alter table public.goals drop constraint if exists goal_review_day_valid;
alter table public.goals add constraint goal_review_day_valid
  check (review_day is null or review_day between 0 and 6);

-- Half a measure is worse than none: it renders a progress bar that cannot be
-- read. Either the goal is measured, or it is judged at review.
alter table public.goals drop constraint if exists goal_measure_is_complete;
alter table public.goals add constraint goal_measure_is_complete
  check (
    (target_value is null and start_value is null and measure_unit is null)
    or (target_value is not null and measure_unit is not null)
  );

-- The readings behind the progress bar. Append-only: a goal's history is not
-- the kind of thing that should be editable from the screen that displays it.
create table if not exists public.goal_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  value numeric not null,
  note text,
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token),
  unique (user_id, goal_id, local_date)
);

create index if not exists goal_measurements_by_goal
  on public.goal_measurements (user_id, goal_id, local_date);

-- The weekly review, which is where a goal either earns its place or does not.
create table if not exists public.goal_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  -- The local date of the first day of the reviewed week, in the user's own
  -- week start. Storing the week by its first day keeps "which week was this"
  -- answerable without re-deriving it from a timestamp in the wrong zone.
  week_start date not null,
  timezone text not null,
  -- What moved, what got in the way, and what the next week actually commits
  -- to. Three questions, because a review with ten questions does not happen.
  progress_note text,
  friction_note text,
  next_commitment text,
  -- The user's own call, not a computed one.
  verdict text not null default 'continue'
    check (verdict in ('continue', 'adjust', 'pause', 'drop', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, goal_id, week_start)
);
select public.attach_updated_at('public.goal_reviews');

-- ---------------------------------------------------------------------------
-- Tasks: subtasks, and the two things that decide whether a task gets done
-- ---------------------------------------------------------------------------
alter table public.tasks
  -- One level, deliberately. Arbitrary nesting turns a task list into an
  -- outliner, and an outliner is a place work goes to be organised instead of
  -- done.
  add column if not exists parent_task_id uuid references public.tasks (id) on delete cascade,
  -- Energy and context are what make a list usable at 9pm: not "what is most
  -- important" but "what can I actually do from here, feeling like this".
  add column if not exists energy text,
  add column if not exists context text,
  -- Null means the Inbox: captured, not yet decided. This is the difference
  -- between a system you trust with a thought and one you have to think before
  -- using.
  add column if not exists scheduled_date date,
  -- The date a recurring series is counted from, fixed at creation. Without
  -- it, completing an every-other-Tuesday task would re-anchor the rule to the
  -- day it was ticked, and the series would walk forward a little each time.
  add column if not exists recurrence_anchor date,
  add column if not exists completed_at timestamptz,
  add column if not exists status text not null default 'open';

alter table public.tasks drop constraint if exists task_energy_known;
alter table public.tasks add constraint task_energy_known
  check (energy is null or energy in ('low', 'medium', 'high'));

alter table public.tasks drop constraint if exists task_status_known;
alter table public.tasks add constraint task_status_known
  check (status in ('open', 'done', 'dropped'));

alter table public.tasks drop constraint if exists task_done_has_time;
alter table public.tasks add constraint task_done_has_time
  check (status <> 'done' or completed_at is not null);

create index if not exists tasks_by_schedule on public.tasks (user_id, scheduled_date)
  where archived_at is null;

create index if not exists tasks_by_parent on public.tasks (user_id, parent_task_id)
  where parent_task_id is not null;

-- A subtask may not have subtasks of its own, and a subtask may not recur: a
-- repeating child of a one-off parent has no coherent meaning.
create or replace function public.guard_task_nesting() returns trigger
language plpgsql as $$
declare
  parent_is_child uuid;
begin
  if new.parent_task_id is null then
    return new;
  end if;

  if new.parent_task_id = new.id then
    raise exception 'A task cannot be its own subtask.' using errcode = 'check_violation';
  end if;

  if new.recurrence is not null then
    raise exception 'A subtask cannot recur. Put the recurrence on the parent.'
      using errcode = 'check_violation';
  end if;

  select t.parent_task_id into parent_is_child
    from public.tasks t where t.id = new.parent_task_id;

  if parent_is_child is not null then
    raise exception 'Subtasks are one level deep. This parent is already a subtask.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_task_nesting on public.tasks;
create trigger guard_task_nesting
  before insert or update on public.tasks
  for each row execute function public.guard_task_nesting();

-- ---------------------------------------------------------------------------
-- The day: a beginning and an end, not only a middle
-- ---------------------------------------------------------------------------
alter table public.daily_plans
  -- One sentence, written in the morning. Not a goal, not a task — the thing
  -- the day is for.
  add column if not exists intention text,
  -- The dichotomy of control, as two boxes rather than a lecture. What is mine
  -- to do today, and what I am going to stop arguing with.
  add column if not exists in_my_control text,
  add column if not exists not_my_control text,
  -- Minimum mode is a switch, not a verdict. A day run at its minimum is a day
  -- that counted.
  add column if not exists minimum_mode boolean not null default false,
  add column if not exists minimum_mode_at timestamptz;

comment on column public.daily_plans.minimum_mode is
  'The user chose to run the day at its minimum. This is a success state, never a failure state.';

alter table public.daily_plan_items
  -- Moving an item to another day is a decision, not a lapse. Recording where
  -- it went keeps "I moved it" distinct from "I ignored it".
  add column if not exists snoozed_to date,
  add column if not exists snoozed_at timestamptz;

alter table public.daily_plan_items drop constraint if exists plan_item_snooze_is_recorded;
alter table public.daily_plan_items add constraint plan_item_snooze_is_recorded
  check (snoozed_to is null or snoozed_at is not null);

-- The evening review. A separate table because it happens once, at a known
-- time, and belongs to the day rather than describing it.
create table if not exists public.day_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  -- Three prompts, in the order a person can actually answer them.
  went_well text,
  friction text,
  tomorrow_one_thing text,
  -- Optional, and deliberately coarse. A five-point scale invites precision
  -- nobody has about their own day.
  energy text check (energy in ('low', 'steady', 'high')),
  -- Did the day meet the user's own minimum? Stored rather than recomputed,
  -- because the answer must not change when they later edit the plan.
  met_minimum boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
select public.attach_updated_at('public.day_reviews');

-- ---------------------------------------------------------------------------
-- Focus: a timer whose state lives on the server
-- ---------------------------------------------------------------------------
--
-- Elapsed time is never stored as a number that ticks. It is derived from
-- `started_at`, `accumulated_seconds` and `paused_at`, so a refresh, a dead
-- battery or a second tab all compute the same answer from the same facts.
alter table public.focus_sessions
  add column if not exists kind text not null default 'work',
  add column if not exists preset text,
  add column if not exists paused_at timestamptz,
  -- Seconds banked by previous run segments, excluding the segment currently
  -- running. Only ever written when a session is paused or finished.
  add column if not exists accumulated_seconds integer not null default 0,
  -- Snapshot, like `goal_title_snapshot`: a deleted task must not blank the
  -- history of the work done on it.
  add column if not exists task_title_snapshot text;

alter table public.focus_sessions drop constraint if exists focus_session_kind_known;
alter table public.focus_sessions add constraint focus_session_kind_known
  check (kind in ('work', 'break'));

alter table public.focus_sessions drop constraint if exists focus_session_accumulated_positive;
alter table public.focus_sessions add constraint focus_session_accumulated_positive
  check (accumulated_seconds >= 0);

alter table public.focus_sessions drop constraint if exists focus_session_pause_requires_running;
alter table public.focus_sessions add constraint focus_session_pause_requires_running
  check (paused_at is null or status = 'running');

-- At most one unfinished focus session per user. Two running timers is not a
-- feature, and without this the UI has to decide which one is real.
create unique index if not exists focus_sessions_one_running
  on public.focus_sessions (user_id)
  where status = 'running';

-- ---------------------------------------------------------------------------
-- Row-level security for everything added above
-- ---------------------------------------------------------------------------
do $$
declare
  owned text[] := array['goal_measurements', 'goal_reviews', 'day_reviews'];
  t text;
begin
  foreach t in array owned loop
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

-- Export must cover the new tables, or an export quietly loses them.
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
    'breathwork_sessions', 'cognitive_sessions', 'workout_logs',
    'flexibility_sessions', 'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
