-- 0007_content.sql — imported content, its provenance, and the journal.
--
-- docs/SOURCE_MAP.md is the prose version of these two tables. Nothing derived
-- from a source document may be served without a row here saying where it came
-- from and what the licence permits.

create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  filename text,
  author text,
  licence text not null check (
    licence in (
      'user-authored-personal',
      'public-domain',
      'third-party-permission-required',
      'third-party-no-redistribution'
    )
  ),
  rights_note text,
  pages integer,
  created_at timestamptz not null default now()
);

comment on table public.content_sources is
  'One row per source document. See docs/SOURCE_MAP.md for what each licence permits.';

create table public.content_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  kind text not null check (
    kind in ('program', 'meditation', 'mobility', 'nutrition', 'quotes', 'workout')
  ),
  content_source_id uuid references public.content_sources (id) on delete restrict,
  -- Every pack is optional. There is no pack a user is given by default.
  is_optional boolean not null default true,
  -- True for anything that must never be inferred from identity, language or
  -- location - the Jewish meditation pack above all (SOURCE_MAP §5).
  requires_explicit_choice boolean not null default false,
  -- True for anything behind a safety screen: contrast therapy, cold exposure.
  requires_safety_acknowledgement boolean not null default false,
  provenance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.content_packs');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  content_pack_id uuid references public.content_packs (id) on delete cascade,
  text text not null,
  author text,
  work text,
  year text,
  source_url text,
  -- The product rule, enforced by the schema: a quote is either verifiably
  -- public domain, or labelled as ARETE's own paraphrase. There is no third
  -- option, and no quote may carry an author unless it is verified.
  attribution_status text not null check (
    attribution_status in ('verified-public-domain', 'original-paraphrase', 'unattributed-saying')
  ),
  created_at timestamptz not null default now(),
  constraint quote_author_only_when_verified check (
    author is null or attribution_status = 'verified-public-domain'
  )
);

comment on constraint quote_author_only_when_verified on public.quotes is
  'Never invent an attribution. A paraphrase or a common saying may not carry an author name.';

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  timezone text not null,
  kind text not null default 'free'
    check (kind in ('evening_review', 'weekly_review', 'free')),
  prompt text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.journal_entries');

comment on table public.journal_entries is
  'The most sensitive data in the product. Never sent to a third party, never used for training, never in a log line or an analytics payload.';

create index journal_entries_by_day on public.journal_entries (user_id, local_date);
