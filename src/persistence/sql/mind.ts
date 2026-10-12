import {
  finishMindPatch,
  pauseMindPatch,
  resumeMindPatch,
  scoreItems,
  type Drill,
  type MindKind,
  type MindSession,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type FinishMindInput,
  type MindHistoryEntry,
  type MindPack,
  type MindPractice,
  type StartMindInput,
} from '../repository';
import type { SqlExecutor } from '../sql-executor';

/**
 * Mind, in SQL.
 *
 * The three session tables stay separate because they hold different things,
 * so most of this file is a small amount of per-kind dispatch over one shared
 * shape. The alternative — one wide table with mostly-null columns — would
 * make the schema lie about what a breathwork session is.
 *
 * `listMindPractices` is the enforcement point for SOURCE_MAP §5: a practice
 * tied to a pack is excluded by the query unless a `user_content_packs` row
 * exists. Not hidden by the caller. Absent.
 */
const TABLE: Record<MindKind, string> = {
  meditation: 'meditation_sessions',
  breathwork: 'breathwork_sessions',
  cognitive: 'cognitive_sessions',
};

interface PracticeRow {
  slug: string;
  kind: MindKind;
  title: string;
  summary: string;
  default_minutes: string | number | null;
  min_minutes: string | number | null;
  max_minutes: string | number | null;
  pattern: Record<string, number> | null;
  drill: string | null;
  content_pack_slug: string | null;
  provenance_note: string | null;
  steps: MindPractice['steps'];
}

interface SessionRow {
  id: string;
  practice_slug_ref: string | null;
  status: 'running' | 'completed' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  accumulated_seconds: number;
  rating: number | null;
  reflection: string | null;
  local_date: string;
  minutes: string | number | null;
}

const num = (value: string | number | null): number | null =>
  value === null ? null : typeof value === 'number' ? value : Number(value);

function toPractice(row: PracticeRow): MindPractice {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    defaultMinutes: num(row.default_minutes),
    minMinutes: num(row.min_minutes),
    maxMinutes: num(row.max_minutes),
    pattern: row.pattern,
    drill: row.drill,
    contentPackSlug: row.content_pack_slug,
    provenanceNote: row.provenance_note,
    steps: row.steps ?? [],
  };
}

function toSession(kind: MindKind, row: SessionRow): MindSession {
  return {
    id: row.id,
    kind,
    practiceSlug: row.practice_slug_ref ?? '',
    status: row.status,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at === null ? null : new Date(row.ended_at),
    pausedAt: row.paused_at === null ? null : new Date(row.paused_at),
    accumulatedSeconds: row.accumulated_seconds,
    plannedMinutes: num(row.minutes),
    rating: row.rating,
    reflection: row.reflection,
  };
}

const SESSION_COLUMNS = `id, practice_slug_ref, status, started_at, ended_at, paused_at,
  accumulated_seconds, rating, reflection, local_date::text, minutes`;

export function createSqlMind(executor: SqlExecutor) {
  async function runningRow(userId: string, kind: MindKind): Promise<SessionRow | null> {
    const result = await executor.query<SessionRow>(
      `select ${SESSION_COLUMNS} from public.${TABLE[kind]}
        where user_id = $1 and status = 'running' limit 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async function packs(userId: string): Promise<MindPack[]> {
    const result = await executor.query<{
      slug: string;
      title: string;
      requires_explicit_choice: boolean;
      provenance_note: string | null;
      chosen: boolean;
    }>(
      `select p.slug, p.title, p.requires_explicit_choice, p.provenance_note,
              (c.id is not null) as chosen
         from public.content_packs p
         left join public.user_content_packs c
           on c.content_pack_slug = p.slug and c.user_id = $1
        where p.kind = 'meditation'
        order by p.title`,
      [userId],
    );

    return result.rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      requiresExplicitChoice: row.requires_explicit_choice,
      provenanceNote: row.provenance_note,
      chosen: row.chosen,
    }));
  }

  return {
    async listMindPractices(userId: string, kind?: MindKind): Promise<readonly MindPractice[]> {
      // The pack rule, in one `where`: a practice tied to a pack is returned
      // only when this user has a row choosing that pack.
      const result = await executor.query<PracticeRow>(
        `select slug, kind, title, summary, default_minutes, min_minutes, max_minutes,
                pattern, drill, content_pack_slug, provenance_note, steps
           from public.mind_practices m
          where ($2::text is null or m.kind = $2)
            and (
              m.content_pack_slug is null
              or exists (
                select 1 from public.user_content_packs c
                 where c.user_id = $1 and c.content_pack_slug = m.content_pack_slug
              )
            )
          order by m.kind, m.position, m.title`,
        [userId, kind ?? null],
      );
      return result.rows.map(toPractice);
    },

    async listMindPacks(userId: string) {
      return packs(userId);
    },

    async setPackChosen(userId: string, packSlug: string, chosen: boolean) {
      const known = await executor.query<{ slug: string }>(
        `select slug from public.content_packs where slug = $1`,
        [packSlug],
      );
      if (!known.rows[0]) throw new RecordNotFoundError(`No pack ${packSlug}`);

      if (chosen) {
        await executor.query(
          `insert into public.user_content_packs (user_id, content_pack_slug)
           values ($1, $2) on conflict (user_id, content_pack_slug) do nothing`,
          [userId, packSlug],
        );
      } else {
        await executor.query(
          `update public.user_content_packs set chosen_at = chosen_at
            where user_id = $1 and content_pack_slug = $2`,
          [userId, packSlug],
        );
        // Un-choosing removes the row, which is what makes the pack invisible
        // again. Deleting is correct here: the choice is the data.
        await executor.query(
          `delete from public.user_content_packs where user_id = $1 and content_pack_slug = $2`,
          [userId, packSlug],
        );
      }

      return packs(userId);
    },

    async startMindSession(userId: string, input: StartMindInput): Promise<MindSession> {
      const seen = await executor.query<SessionRow>(
        `select ${SESSION_COLUMNS} from public.${TABLE[input.kind]}
          where user_id = $1 and client_token = $2`,
        [userId, input.clientToken],
      );
      const already = seen.rows[0];
      if (already) return toSession(input.kind, already);

      if ((await runningRow(userId, input.kind)) !== null) {
        throw new InvalidWriteError(`A ${input.kind} session is already running.`);
      }

      // Checked against the same filtered view the UI reads, so a practice from
      // an unchosen pack cannot be started by guessing its slug.
      const allowed = await executor.query<{ slug: string; drill: string | null }>(
        `select m.slug, m.drill from public.mind_practices m
          where m.slug = $2
            and (
              m.content_pack_slug is null
              or exists (
                select 1 from public.user_content_packs c
                 where c.user_id = $1 and c.content_pack_slug = m.content_pack_slug
              )
            )`,
        [userId, input.practiceSlug],
      );
      if (!allowed.rows[0]) {
        throw new InvalidWriteError(
          `“${input.practiceSlug}” is not available to this account. It may belong to a pack that has not been chosen.`,
        );
      }

      const common = [
        userId,
        input.localDate,
        input.timeZone,
        input.startedAt.toISOString(),
        input.practiceSlug,
        input.clientToken,
        input.plannedMinutes ?? 0,
      ];

      const inserts: Record<MindKind, { text: string; params: readonly unknown[] }> = {
        meditation: {
          text: `insert into public.meditation_sessions
                   (user_id, local_date, timezone, started_at, practice_slug_ref, client_token,
                    minutes, practice_slug, status)
                 values ($1, $2, $3, $4, $5, $6, $7, $5, 'running')
                 returning ${SESSION_COLUMNS}`,
          params: common,
        },
        breathwork: {
          text: `insert into public.breathwork_sessions
                   (user_id, local_date, timezone, started_at, practice_slug_ref, client_token,
                    minutes, pattern, planned_rounds, status)
                 values ($1, $2, $3, $4, $5, $6, $7,
                   coalesce((select pattern from public.mind_practices where slug = $5), '{}'::jsonb),
                   $8, 'running')
                 returning ${SESSION_COLUMNS}`,
          params: [...common, input.plannedRounds ?? null],
        },
        cognitive: {
          text: `insert into public.cognitive_sessions
                   (user_id, local_date, timezone, started_at, practice_slug_ref, client_token,
                    minutes, drill, status)
                 values ($1, $2, $3, $4, $5, $6, $7,
                   coalesce((select drill from public.mind_practices where slug = $5), $5),
                   'running')
                 returning ${SESSION_COLUMNS}`,
          params: common,
        },
      };

      const insert = inserts[input.kind];
      const result = await executor.query<SessionRow>(insert.text, insert.params);
      const row = result.rows[0];
      if (!row) throw new InvalidWriteError('The session was refused by the database.');
      return toSession(input.kind, row);
    },

    async getRunningMindSession(userId: string, kind: MindKind): Promise<MindSession | null> {
      const row = await runningRow(userId, kind);
      return row === null ? null : toSession(kind, row);
    },

    async pauseMindSession(userId: string, kind: MindKind, at: Date): Promise<MindSession> {
      const row = await runningRow(userId, kind);
      if (row === null) throw new RecordNotFoundError(`No ${kind} session is running.`);

      const session = toSession(kind, row);
      if (session.pausedAt !== null) return session;

      const patch = pauseMindPatch(session, at);
      const result = await executor.query<SessionRow>(
        `update public.${TABLE[kind]} set accumulated_seconds = $2, paused_at = $3
          where id = $1 returning ${SESSION_COLUMNS}`,
        [session.id, patch.accumulatedSeconds, patch.pausedAt.toISOString()],
      );
      const updated = result.rows[0];
      if (!updated) throw new RecordNotFoundError(`No ${kind} session is running.`);
      return toSession(kind, updated);
    },

    async resumeMindSession(userId: string, kind: MindKind, at: Date): Promise<MindSession> {
      const row = await runningRow(userId, kind);
      if (row === null) throw new RecordNotFoundError(`No ${kind} session is running.`);

      const session = toSession(kind, row);
      if (session.pausedAt === null) return session;

      const result = await executor.query<SessionRow>(
        `update public.${TABLE[kind]} set started_at = $2, paused_at = null
          where id = $1 returning ${SESSION_COLUMNS}`,
        [session.id, resumeMindPatch(at).startedAt.toISOString()],
      );
      const updated = result.rows[0];
      if (!updated) throw new RecordNotFoundError(`No ${kind} session is running.`);
      return toSession(kind, updated);
    },

    async finishMindSession(userId: string, input: FinishMindInput): Promise<MindSession | null> {
      const row = await runningRow(userId, input.kind);
      if (row === null) return null;

      const session = toSession(input.kind, row);
      const patch = finishMindPatch(session, input.at, input.status);
      const minutes = Math.round((patch.accumulatedSeconds / 60) * 100) / 100;

      const base = `set accumulated_seconds = $2, ended_at = $3, paused_at = null,
                        status = $4, rating = $5, reflection = $6, minutes = $7`;
      const params: unknown[] = [
        session.id,
        patch.accumulatedSeconds,
        patch.endedAt.toISOString(),
        patch.status,
        input.rating ?? null,
        input.reflection ?? null,
        minutes,
      ];

      let text = `update public.${TABLE[input.kind]} ${base} where id = $1 returning ${SESSION_COLUMNS}`;

      if (input.kind === 'breathwork') {
        text = `update public.breathwork_sessions ${base}, rounds = $8
                 where id = $1 returning ${SESSION_COLUMNS}`;
        params.push(input.rounds ?? 0);
      }

      if (input.kind === 'cognitive') {
        const drillRow = await executor.query<{ drill: string }>(
          `select drill from public.cognitive_sessions where id = $1`,
          [session.id],
        );
        const scored =
          input.items === undefined
            ? null
            : scoreItems((drillRow.rows[0]?.drill ?? 'recall') as Drill, input.items);

        text = `update public.cognitive_sessions ${base},
                   items = $8, items_attempted = $9, items_correct = $10, median_response_ms = $11
                 where id = $1 returning ${SESSION_COLUMNS}`;
        params.push(
          JSON.stringify(input.items ?? []),
          scored?.itemsAttempted ?? 0,
          scored?.itemsCorrect ?? 0,
          scored?.medianResponseMs ?? null,
        );
      }

      const result = await executor.query<SessionRow>(text, params);
      const updated = result.rows[0];
      return updated ? toSession(input.kind, updated) : null;
    },

    async listMindHistory(
      userId: string,
      options?: { kind?: MindKind; limit?: number },
    ): Promise<readonly MindHistoryEntry[]> {
      const kinds: MindKind[] =
        options?.kind === undefined ? ['meditation', 'breathwork', 'cognitive'] : [options.kind];

      const entries: MindHistoryEntry[] = [];
      for (const kind of kinds) {
        const extra =
          kind === 'cognitive'
            ? ', drill, items_attempted, items_correct, median_response_ms'
            : ', null::text as drill, null::int as items_attempted, null::int as items_correct, null::int as median_response_ms';

        const result = await executor.query<
          SessionRow & {
            drill: string | null;
            items_attempted: number | null;
            items_correct: number | null;
            median_response_ms: number | null;
          }
        >(
          `select ${SESSION_COLUMNS}${extra} from public.${TABLE[kind]}
            where user_id = $1 and status <> 'running'
            order by ended_at desc nulls last limit $2`,
          [userId, options?.limit ?? 50],
        );

        for (const row of result.rows) {
          entries.push({
            id: row.id,
            kind,
            practiceSlug: row.practice_slug_ref ?? '',
            localDate: row.local_date,
            minutes: num(row.minutes) ?? 0,
            status: row.status === 'abandoned' ? 'abandoned' : 'completed',
            rating: row.rating,
            reflection: row.reflection,
            drill: row.drill,
            itemsAttempted: row.items_attempted,
            itemsCorrect: row.items_correct,
            medianResponseMs: row.median_response_ms,
          });
        }
      }

      return entries
        .sort((a, b) => b.localDate.localeCompare(a.localDate))
        .slice(0, options?.limit ?? 50);
    },
  };
}
