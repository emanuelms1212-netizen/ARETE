-- 0016_flexibility_rights.sql — the hamstring programme's rights are cleared.
--
-- The product owner obtained the author's permission for the Total Flexibility
-- material on 2026-10-19 (ledger D85). Rights live in the database, not in
-- code, so the release is this update rather than a deploy (D78). On a fresh
-- database the row does not exist yet when migrations run; the seed then
-- inserts it already cleared. On an existing one, this clears it.
--
-- Replayable: running it twice changes nothing the second time.

update public.flexibility_programs
   set rights_status = 'cleared',
       rights_note = 'Used with the author''s permission, obtained by the product owner on 2026-10-19.'
 where slug = 'hamstring-mobility'
   and user_id is null
   and rights_status <> 'cleared';

update public.content_packs
   set provenance_note = 'Session structure from Total Hamstring Mobility 2.0, used with the author''s permission (2026-10-19). Instructions are ARETE''s own.'
 where slug = 'hamstring-mobility';

-- The source document itself now has a licence the schema can say out loud.
alter table public.content_sources drop constraint if exists content_sources_licence_check;
alter table public.content_sources add constraint content_sources_licence_check
  check (
    licence in (
      'user-authored-personal',
      'public-domain',
      'third-party-permission-required',
      'third-party-permission-granted',
      'third-party-no-redistribution'
    )
  );

update public.content_sources
   set licence = 'third-party-permission-granted',
       rights_note = 'Commercial ebook, used with the author''s permission obtained by the product owner on 2026-10-19. Descriptions are still ARETE''s own words, and no photographs are reproduced.'
 where slug = 'total-flexibility';
