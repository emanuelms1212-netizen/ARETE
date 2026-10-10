-- 0004_sessions.sql — focus, meditation, breathwork and cognitive practice.
--
-- Every table here is append-only history. Nothing is soft-deleted: a session
-- that happened, happened. All four carry `client_token` so that a timer
-- finishing while the connection is flapping records once, not three times.

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  goal_id uuid references public.goals (id) on delete set null,
  -- Snapshot, so a deleted goal does not blank the history attached to it.
  goal_title_snapshot text,
  local_date date not null,
  timezone text not null,
  planned_minutes integer not null check (planned_minutes > 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  actual_seconds integer not null default 0 check (actual_seconds >= 0),
  interruptions smallint not null default 0 check (interruptions >= 0),
  status text not null default 'running' check (status in ('running', 'completed', 'abandoned')),
  -- One line, optional. Never leaves the device in an analytics payload.
  reflection text,
  client_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_token),
  constraint focus_session_ended check (status = 'running' or ended_at is not null)
);
select public.attach_updated_at('public.focus_sessions');

create index focus_sessions_by_day on public.focus_sessions (user_id, local_date);

create table public.meditation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Which pack, if any. Packs are chosen, never inferred: see SOURCE_MAP §5.
  content_pack_id uuid,
  practice_slug text,
  local_date date not null,
  timezone text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes numeric not null default 0 check (minutes >= 0),
  note text,
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token)
);

create index meditation_sessions_by_day on public.meditation_sessions (user_id, local_date);

create table public.breathwork_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- { "inhale": 4, "hold": 2, "exhale": 6 } in seconds.
  pattern jsonb not null,
  rounds smallint not null default 0 check (rounds >= 0),
  local_date date not null,
  timezone text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes numeric not null default 0 check (minutes >= 0),
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token)
);

create index breathwork_sessions_by_day on public.breathwork_sessions (user_id, local_date);

create table public.cognitive_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  drill text not null,
  level smallint,
  local_date date not null,
  timezone text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  items_attempted integer not null default 0 check (items_attempted >= 0),
  items_correct integer not null default 0 check (items_correct >= 0),
  median_response_ms integer check (median_response_ms >= 0),
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token),
  constraint cognitive_correct_within_attempted check (items_correct <= items_attempted)
);

comment on table public.cognitive_sessions is
  'Practice performance at these drills and nothing else. No column here is a cognitive score, and the product never claims transfer or IQ change (PRODUCT_SPEC §9 non-goals).';

create index cognitive_sessions_by_day on public.cognitive_sessions (user_id, local_date);
