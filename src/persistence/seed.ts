import type { SqlExecutor } from './sql-executor';
import { DEMO_USER_ID, demoDays } from './demo-data';

/**
 * The deterministic seed.
 *
 * Two parts, and the split matters:
 *
 *   * **Content** — the source documents and the packs derived from them. This
 *     is shipped reference data and belongs in every environment, including
 *     production. Every row carries its licence, so the rights position from
 *     docs/SOURCE_MAP.md is in the database rather than only in a document.
 *   * **The demo account** — the same fixed day the in-memory repository
 *     serves, so demo mode and a seeded database show the same thing.
 *
 * Nothing here uses a random value or the current time, so running it twice
 * produces exactly the same database.
 */

interface SeededSource {
  readonly slug: string;
  readonly title: string;
  readonly filename: string;
  readonly author: string | null;
  readonly licence:
    | 'user-authored-personal'
    | 'public-domain'
    | 'third-party-permission-required'
    | 'third-party-no-redistribution';
  readonly rightsNote: string;
  readonly pages: number;
}

/** One row per document in docs/SOURCE_MAP.md, with the same rights position. */
export const CONTENT_SOURCES: readonly SeededSource[] = [
  {
    slug: 'reset-66-day',
    title: '60-Day Reset - Calm and Sleek',
    filename: '66_Day_Reset_CALM_SLEEK_LINKED.pdf',
    author: null,
    licence: 'user-authored-personal',
    rightsNote:
      'Titled 60-Day, contains 66 numbered days. Ships as a 66-day template with the discrepancy stated.',
    pages: 38,
  },
  {
    slug: 'reset-pamphlet',
    title: 'The 60-Day Reset: Quick Reference',
    filename: '60_Day_Reset_Pamphlet.pdf',
    author: null,
    licence: 'user-authored-personal',
    rightsNote:
      'Merged into the reset template. Conflicts with the long file on social cap and push-ups.',
    pages: 2,
  },
  {
    slug: 'teen-regimen',
    title: '60-Day Reset Regimen',
    filename: '60_day_reset_regimen.pdf',
    author: null,
    licence: 'user-authored-personal',
    rightsNote:
      'Written for a 17-year-old. Contributes a push/pull/legs progression shape only; its schedule is not a template, and its five unattributed quotes are not shipped.',
    pages: 2,
  },
  {
    slug: 'contrast-therapy',
    title: 'Contrast Therapy Schedules',
    filename: 'Contrast_Therapy_Schedule.pdf',
    author: null,
    licence: 'user-authored-personal',
    rightsNote:
      'Highest-risk content in the set: 70-82C heat and 13C immersion with no screening. Opt-in, safety-gated, conservative defaults below the source numbers.',
    pages: 1,
  },
  {
    slug: 'jewish-meditation',
    title: 'Jewish Meditation - 4 Week Starter Program',
    filename: 'Jewish_Meditation_4_Week_Program.pdf',
    author: null,
    licence: 'public-domain',
    rightsNote:
      'Liturgical text is public domain. Never enabled by default and never inferred from name, language, region or any other signal.',
    pages: 1,
  },
  {
    slug: 'seed-oil-guide',
    title: 'The Complete Seed Oil Guide',
    filename: 'The-Complete-Seed-Oil-Guide-Joseph-Everett.pdf',
    author: 'Joseph Everett',
    licence: 'third-party-no-redistribution',
    rightsNote:
      'Third-party article, all rights reserved, and a contested viewpoint rather than consensus. Not bundled, not paraphrased section by section. At most one optional labelled note.',
    pages: 27,
  },
  {
    slug: 'total-flexibility',
    title: 'Total Flexibility V2 (four mobility programs)',
    filename: 'Total Flexibility - V2.pdf',
    author: 'David Thurin',
    licence: 'third-party-permission-required',
    rightsNote:
      'Commercial ebook. Movement names are common vocabulary; the programme structure needs written permission or must be re-derived. Descriptions rewritten in ARETE words; photographs never reproduced.',
    pages: 72,
  },
];

interface SeededPack {
  readonly slug: string;
  readonly title: string;
  readonly kind: 'program' | 'meditation' | 'mobility' | 'nutrition' | 'quotes' | 'workout';
  readonly sourceSlug: string;
  readonly requiresExplicitChoice: boolean;
  readonly requiresSafetyAcknowledgement: boolean;
  readonly provenanceNote: string;
}

export const CONTENT_PACKS: readonly SeededPack[] = [
  {
    slug: 'reset-66-day',
    title: '66-Day Reset',
    kind: 'program',
    sourceSlug: 'reset-66-day',
    requiresExplicitChoice: false,
    requiresSafetyAcknowledgement: false,
    provenanceNote:
      'The source PDF is titled 60-Day and contains 66 numbered days. Shipped as 66 days, with a labelled 60-day variant. Every parameter is a default the user can change.',
  },
  {
    slug: 'contrast-therapy',
    title: 'Contrast therapy',
    kind: 'program',
    sourceSlug: 'contrast-therapy',
    requiresExplicitChoice: true,
    requiresSafetyAcknowledgement: true,
    provenanceNote:
      'Off by default. Requires a safety acknowledgement, and ships defaults milder than the source.',
  },
  {
    slug: 'jewish-meditation',
    title: 'Jewish meditation - four weeks',
    kind: 'meditation',
    sourceSlug: 'jewish-meditation',
    requiresExplicitChoice: true,
    requiresSafetyAcknowledgement: false,
    provenanceNote:
      'Listed neutrally alongside secular packs. Never enabled by default, never inferred from identity or location.',
  },
  {
    slug: 'hamstring-mobility',
    title: 'Hamstring mobility - four weeks',
    kind: 'mobility',
    sourceSlug: 'total-flexibility',
    requiresExplicitChoice: false,
    requiresSafetyAcknowledgement: true,
    provenanceNote:
      'Rights pending. Not served to users until permission is obtained or the progression is re-derived.',
  },
];

/** Applies the content seed. Safe to run repeatedly. */
export async function seedContent(executor: SqlExecutor): Promise<void> {
  for (const source of CONTENT_SOURCES) {
    await executor.query(
      `insert into public.content_sources (slug, title, filename, author, licence, rights_note, pages)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (slug) do update set
         title = excluded.title, filename = excluded.filename, author = excluded.author,
         licence = excluded.licence, rights_note = excluded.rights_note, pages = excluded.pages`,
      [
        source.slug,
        source.title,
        source.filename,
        source.author,
        source.licence,
        source.rightsNote,
        source.pages,
      ],
    );
  }

  for (const pack of CONTENT_PACKS) {
    await executor.query(
      `insert into public.content_packs
         (slug, title, kind, content_source_id, requires_explicit_choice,
          requires_safety_acknowledgement, provenance_note)
       select $1, $2, $3, s.id, $4, $5, $6
         from public.content_sources s where s.slug = $7
       on conflict (slug) do update set
         title = excluded.title, kind = excluded.kind,
         requires_explicit_choice = excluded.requires_explicit_choice,
         requires_safety_acknowledgement = excluded.requires_safety_acknowledgement,
         provenance_note = excluded.provenance_note`,
      [
        pack.slug,
        pack.title,
        pack.kind,
        pack.requiresExplicitChoice,
        pack.requiresSafetyAcknowledgement,
        pack.provenanceNote,
        pack.sourceSlug,
      ],
    );
  }

  // The flexibility programme is shipped with its rights status, not without it.
  await executor.query(
    `insert into public.flexibility_programs
       (user_id, slug, name, region, weeks, days_per_week, content_pack_id, rights_status, rights_note)
     select null, 'hamstring-mobility', 'Hamstring mobility', 'hamstrings', 4, 3, p.id, 'pending',
            'Structure derived from a third-party commercial ebook. Needs written permission or re-derivation before release.'
       from public.content_packs p where p.slug = 'hamstring-mobility'
     on conflict (user_id, slug) do nothing`,
  );

  // One line of ARETE's own, carrying no author — the schema forbids attributing
  // anything that has not been verified.
  await executor.query(
    `insert into public.quotes (content_pack_id, text, attribution_status)
     select null, 'A missed day is a fact, not a verdict.', 'original-paraphrase'
      where not exists (select 1 from public.quotes where text = 'A missed day is a fact, not a verdict.')`,
  );
}

/**
 * Seeds the demo account: the same fixed day the in-memory repository serves.
 * Never run against production.
 */
export async function seedDemoAccount(executor: SqlExecutor): Promise<void> {
  await executor.query(
    `insert into auth.users (id, email) values ($1, 'demo@arete.invalid') on conflict (id) do nothing`,
    [DEMO_USER_ID],
  );
  await executor.query(
    `insert into public.profiles (id, display_name, timezone) values ($1, 'Demo', 'Europe/London')
     on conflict (id) do nothing`,
    [DEMO_USER_ID],
  );
  await executor.query(
    `insert into public.preferences (user_id) values ($1) on conflict (user_id) do nothing`,
    [DEMO_USER_ID],
  );
  await executor.query(
    `insert into public.notification_preferences (user_id) values ($1) on conflict (user_id) do nothing`,
    [DEMO_USER_ID],
  );

  for (const day of demoDays) {
    const plan = await executor.query<{ id: string }>(
      `insert into public.daily_plans (user_id, local_date, timezone, mark, committed_at)
       values ($1, $2, 'Europe/London', $3, $4)
       on conflict (user_id, local_date) do update set mark = excluded.mark
       returning id`,
      [DEMO_USER_ID, day.date, day.mark === 'not-today' ? 'not_today' : day.mark, day.committedAt],
    );
    const planId = plan.rows[0]?.id;
    if (!planId) continue;

    for (const [index, commitment] of day.commitments.entries()) {
      await executor.query(
        `insert into public.daily_plan_items
           (user_id, daily_plan_id, kind, title_snapshot, is_minimum, status, skip_reason, completed_at, position)
         select $1, $2, $3, $4, $5, $6, $7, $8, $9
          where not exists (
            select 1 from public.daily_plan_items
             where user_id = $1 and daily_plan_id = $2 and title_snapshot = $4
          )`,
        [
          DEMO_USER_ID,
          planId,
          commitment.kind,
          commitment.title,
          commitment.isMinimum,
          commitment.status,
          commitment.skipReason ?? null,
          commitment.status === 'done' ? `${day.date}T08:00:00Z` : null,
          index,
        ],
      );
    }
  }
}
