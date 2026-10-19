import { ALL_PRACTICES } from '@/content/mind/practices';
import { FLEX_PROGRAMS } from '@/content/flexibility/hamstring';
import { EXERCISES } from '@/content/train/exercises';
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
    | 'third-party-permission-granted'
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
      'Titled 60-Day, contains 66 numbered days. Runs as 60 days with days 61-66 as an optional extension week, the discrepancy stated.',
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
    licence: 'third-party-permission-granted',
    rightsNote:
      'Commercial ebook, used with the author’s permission obtained by the product owner on 2026-10-19. Descriptions are still ARETE’s own words, and no photographs are reproduced.',
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
    title: '60-Day Reset',
    kind: 'program',
    sourceSlug: 'reset-66-day',
    requiresExplicitChoice: false,
    requiresSafetyAcknowledgement: false,
    provenanceNote:
      'The source PDF is titled 60-Day and contains 66 numbered days. ARETE runs 60 days; days 61-66 are an optional extension week the person can add. Every target is an editable range.',
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
      'Session structure from Total Hamstring Mobility 2.0, used with the author’s permission (2026-10-19). Instructions are ARETE’s own.',
  },
];

/** Applies the content seed. Safe to run repeatedly. */
/**
 * The mind practice catalogue.
 *
 * Content, so it is seeded rather than migrated — which means it can be
 * corrected without a schema change. The pack link is what the request-path
 * query filters on, so a practice seeded with a `contentPackSlug` is invisible
 * until the user chooses that pack.
 */
async function seedMindPractices(executor: SqlExecutor): Promise<void> {
  let position = 0;
  for (const practice of ALL_PRACTICES) {
    position += 1;
    await executor.query(
      `insert into public.mind_practices
         (slug, kind, title, summary, steps, default_minutes, min_minutes, max_minutes,
          pattern, drill, content_pack_slug, provenance_note, position)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
       on conflict (slug) do update set
         kind = excluded.kind, title = excluded.title, summary = excluded.summary,
         steps = excluded.steps, default_minutes = excluded.default_minutes,
         min_minutes = excluded.min_minutes, max_minutes = excluded.max_minutes,
         pattern = excluded.pattern, drill = excluded.drill,
         content_pack_slug = excluded.content_pack_slug,
         provenance_note = excluded.provenance_note, position = excluded.position`,
      [
        practice.slug,
        practice.kind,
        practice.title,
        practice.summary,
        JSON.stringify(practice.steps),
        practice.defaultMinutes,
        practice.minMinutes,
        practice.maxMinutes,
        practice.pattern === null ? null : JSON.stringify(practice.pattern),
        practice.drill,
        practice.contentPackSlug,
        practice.provenanceNote,
        position,
      ],
    );
  }
}

/**
 * The exercise library, with its instruction text.
 *
 * Library rows are the ones with no owner. Their slugs are unique among
 * themselves (a partial index from 0014), which is what the upsert targets —
 * a person's own exercise may reuse a slug without colliding with ARETE's.
 */
async function seedExercises(executor: SqlExecutor): Promise<void> {
  for (const exercise of EXERCISES) {
    await executor.query(
      `insert into public.exercises
         (user_id, slug, name, cue, equipment, loads_regions, pattern, measure, difficulty,
          per_side, loadable, increment_kg, requires, steps, cues, mistakes, stop_if, animation_slug)
       values (null, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17)
       on conflict (slug) where user_id is null do update set
         name = excluded.name, cue = excluded.cue, equipment = excluded.equipment,
         loads_regions = excluded.loads_regions, pattern = excluded.pattern,
         measure = excluded.measure, difficulty = excluded.difficulty,
         per_side = excluded.per_side, loadable = excluded.loadable,
         increment_kg = excluded.increment_kg, requires = excluded.requires,
         steps = excluded.steps, cues = excluded.cues, mistakes = excluded.mistakes,
         stop_if = excluded.stop_if, animation_slug = excluded.animation_slug`,
      [
        exercise.slug,
        exercise.name,
        exercise.cues[0] ?? null,
        exercise.requires.length === 0 ? 'none' : exercise.requires.join(','),
        exercise.loads,
        exercise.pattern,
        exercise.measure,
        exercise.difficulty,
        exercise.perSide,
        exercise.loadable,
        exercise.incrementKg,
        exercise.requires,
        JSON.stringify(exercise.steps),
        JSON.stringify(exercise.cues),
        JSON.stringify(exercise.mistakes),
        JSON.stringify(exercise.stopIf),
        exercise.animation,
      ],
    );
  }
}

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
  // A re-seed refreshes the description but never the rights status: once the
  // product owner has cleared it in the database, seeding must not undo that.
  for (const program of FLEX_PROGRAMS) {
    await executor.query(
      `insert into public.flexibility_programs
         (user_id, slug, name, region, weeks, days_per_week, content_pack_id, rights_status,
          rights_note, provenance_note)
       select null, $1, $2, $3, $4, $5, p.id, $6,
              case when $6 = 'cleared'
                then 'Used with the author’s permission, obtained by the product owner on 2026-10-19.'
                else 'Structure derived from a third-party commercial ebook. Needs written permission or re-derivation before release.'
              end,
              $7
         from public.content_packs p where p.slug = $1
       on conflict (slug) where user_id is null do update set
         name = excluded.name, region = excluded.region, weeks = excluded.weeks,
         days_per_week = excluded.days_per_week, provenance_note = excluded.provenance_note`,
      [
        program.slug,
        program.title,
        program.region,
        program.weeks,
        program.sessionsPerWeek,
        program.rightsStatus,
        program.provenance.note,
      ],
    );
  }

  // One line of ARETE's own, carrying no author — the schema forbids attributing
  // anything that has not been verified.
  await executor.query(
    `insert into public.quotes (content_pack_id, text, attribution_status)
     select null, 'A missed day is a fact, not a verdict.', 'original-paraphrase'
      where not exists (select 1 from public.quotes where text = 'A missed day is a fact, not a verdict.')`,
  );

  await seedMindPractices(executor);
  await seedExercises(executor);
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
