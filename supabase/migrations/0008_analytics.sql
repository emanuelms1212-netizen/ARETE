-- 0008_analytics.sql — product analytics, with the privacy rule in the schema.
--
-- PRODUCT_SPEC §10: no free text the user typed ever leaves the device in an
-- event. src/analytics/events.ts enforces that for the client; this enforces it
-- for anything that reaches the database by any other route.

create or replace function public.payload_has_free_text(payload jsonb) returns boolean
language sql immutable as $$
  select exists (
    select 1
    from jsonb_object_keys(coalesce(payload, '{}'::jsonb)) as key
    where key ~* '(note|text|title|description|content|entry|answer|reflection|journal|body|prompt|name|email|message|comment)'
  )
$$;

comment on function public.payload_has_free_text(jsonb) is
  'True when an analytics payload has a key that looks like free text. Used as a check constraint, not a lint.';

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- Ids, counts, durations and enums only.
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  local_date date,
  timezone text,
  client_token text,
  created_at timestamptz not null default now(),
  unique (user_id, client_token),
  constraint analytics_payload_is_not_free_text check (not public.payload_has_free_text(payload))
);

comment on constraint analytics_payload_is_not_free_text on public.analytics_events is
  'Journal text, review answers, food descriptions and goal titles are the most sensitive data here. This makes storing them an error rather than a mistake.';

create index analytics_events_by_name on public.analytics_events (user_id, name, occurred_at);
