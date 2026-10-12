-- 0013_mind.sql — meditation, breathwork and cognitive practice.
--
-- Three modes, one session player. The three session tables stay separate
-- because they hold genuinely different things — a breath pattern, a drill's
-- item counts, a practice slug — but they gain the same player columns, so a
-- single component can run any of them.
--
-- Replayable, like 0012: every statement is guarded.

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
--
-- Practices are content, not code, so they live in a table rather than in a
-- constant. The flags are the important part: `requires_explicit_choice`
-- carries the rule from SOURCE_MAP §5 into the data, where a query can enforce
-- it, instead of leaving it to every screen to remember.
create table if not exists public.mind_practices (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null check (kind in ('meditation', 'breathwork', 'cognitive')),
  title text not null,
  -- One sentence. What this is, in plain words.
  summary text not null,
  -- The steps the player reads out. Shape:
  -- [{ "label": "Settle", "seconds": 30, "say": "..." }]
  steps jsonb not null default '[]'::jsonb,
  default_minutes numeric check (default_minutes > 0),
  min_minutes numeric check (min_minutes > 0),
  max_minutes numeric check (max_minutes > 0),
  -- Breathwork only: { "inhale": 4, "holdIn": 0, "exhale": 6, "holdOut": 0 }
  pattern jsonb,
  -- Cognitive only: which drill engine runs it.
  drill text,
  -- Null for the secular practices that ship with the app. Non-null ties the
  -- practice to a pack the user must choose.
  content_pack_slug text,
  provenance_note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.mind_practices');

comment on table public.mind_practices is
  'The practice catalogue. A practice belonging to a pack is only ever offered when the user has chosen that pack - see content_packs.requires_explicit_choice and SOURCE_MAP section 5.';

alter table public.mind_practices drop constraint if exists mind_practice_minutes_ordered;
alter table public.mind_practices add constraint mind_practice_minutes_ordered
  check (
    min_minutes is null or max_minutes is null or min_minutes <= max_minutes
  );

-- A breathwork practice needs a pattern; a cognitive one needs a drill.
-- Without these, a practice can exist that the player cannot run.
alter table public.mind_practices drop constraint if exists mind_practice_has_what_it_needs;
alter table public.mind_practices add constraint mind_practice_has_what_it_needs
  check (
    (kind <> 'breathwork' or pattern is not null)
    and (kind <> 'cognitive' or drill is not null)
  );

create index if not exists mind_practices_by_kind
  on public.mind_practices (kind, position);

-- Which packs this user has chosen. Absence is the default, and the default is
-- off: there is no pack anybody is given.
create table if not exists public.user_content_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_pack_slug text not null,
  chosen_at timestamptz not null default now(),
  unique (user_id, content_pack_slug)
);

comment on table public.user_content_packs is
  'Chosen packs. A row here is the only thing that makes an optional pack visible, and it is created by the user picking it - never inferred from name, language, region or any other signal.';

-- ---------------------------------------------------------------------------
-- The shared player, across three different session tables
-- ---------------------------------------------------------------------------
--
-- Same approach as the focus timer (D48): nothing stores a countdown. A
-- session holds when its current segment started and what earlier segments
-- banked, and elapsed is derived — which is what lets a session survive
-- backgrounding, a reload, or a phone that slept.
do $$
declare
  t text;
begin
  foreach t in array array['meditation_sessions', 'breathwork_sessions', 'cognitive_sessions'] loop
    execute format('alter table public.%I
      add column if not exists status text not null default ''completed'',
      add column if not exists paused_at timestamptz,
      add column if not exists accumulated_seconds integer not null default 0,
      add column if not exists practice_slug_ref text,
      add column if not exists rating smallint,
      add column if not exists reflection text', t);

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_status_known');
    execute format('alter table public.%I add constraint %I
      check (status in (''running'', ''completed'', ''abandoned''))', t, t || '_status_known');

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_accumulated_positive');
    execute format('alter table public.%I add constraint %I
      check (accumulated_seconds >= 0)', t, t || '_accumulated_positive');

    -- One to five, and optional. A rating is how the session felt, which is
    -- the only thing the user is in a position to report.
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_rating_range');
    execute format('alter table public.%I add constraint %I
      check (rating is null or rating between 1 and 5)', t, t || '_rating_range');

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_pause_requires_running');
    execute format('alter table public.%I add constraint %I
      check (paused_at is null or status = ''running'')', t, t || '_pause_requires_running');

    -- At most one unfinished session of each kind. Two running meditations is
    -- not a feature, and without this the UI has to pick one.
    execute format('create unique index if not exists %I on public.%I (user_id)
      where status = ''running''', t || '_one_running', t);
  end loop;
end
$$;

-- A drill takes time like any other session, and the player shows it. The
-- other two session tables already had `minutes`; this one did not, which only
-- showed up when one component tried to read all three the same way.
alter table public.cognitive_sessions
  add column if not exists minutes numeric not null default 0;

alter table public.cognitive_sessions drop constraint if exists cognitive_minutes_positive;
alter table public.cognitive_sessions add constraint cognitive_minutes_positive
  check (minutes >= 0);

-- Per-item detail for a cognitive drill: what was asked, what was answered,
-- how long it took. Append-only, and deliberately not a score.
alter table public.cognitive_sessions
  add column if not exists items jsonb not null default '[]'::jsonb;

comment on column public.cognitive_sessions.items is
  'Per-item practice detail: prompt, answer, correct, response_ms. Used to show a practice curve for this drill. It is not a measure of ability and the product never presents it as one.';

-- Breathwork rounds are configurable, so the planned count is worth keeping
-- beside the completed one: stopping early is a choice, not a failure.
alter table public.breathwork_sessions
  add column if not exists planned_rounds smallint;

alter table public.breathwork_sessions drop constraint if exists breathwork_planned_rounds_positive;
alter table public.breathwork_sessions add constraint breathwork_planned_rounds_positive
  check (planned_rounds is null or planned_rounds > 0);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
do $$
begin
  -- The catalogue is library content: any signed-in user may read it, nobody
  -- may write it through the request path.
  execute 'alter table public.mind_practices enable row level security';
  execute 'alter table public.mind_practices force row level security';
  execute 'drop policy if exists library_read on public.mind_practices';
  execute 'create policy library_read on public.mind_practices for select to authenticated using (true)';
  execute 'grant select on public.mind_practices to authenticated';

  execute 'alter table public.user_content_packs enable row level security';
  execute 'alter table public.user_content_packs force row level security';
  execute 'drop policy if exists own_rows on public.user_content_packs';
  execute 'create policy own_rows on public.user_content_packs for all to authenticated
    using (user_id = public.current_user_id()) with check (user_id = public.current_user_id())';
  execute 'grant select, insert, update, delete on public.user_content_packs to authenticated';
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
    'breathwork_sessions', 'cognitive_sessions', 'workout_logs',
    'flexibility_sessions', 'nutrition_targets', 'meals', 'food_entries',
    'body_metrics', 'journal_entries', 'analytics_events',
    'user_content_packs',
    'exercises', 'workout_plans', 'flexibility_programs', 'foods'
  ]
$$;
