import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScriptExecutor } from './sql-executor';

/**
 * Applying migrations once, and proving they were applied.
 *
 * Until now `db:migrate` replayed every file on every run, which only works if
 * every file is a no-op the second time. A test showed that it is not: the
 * early migrations create tables unconditionally and fail on replay. Rather
 * than rewriting eleven proven files to be defensive, the runner now records
 * what it has applied, so each file runs exactly once.
 *
 * The checksum is the point of the exercise. A migration that has already run
 * and has since been edited is a silent divergence between what the database
 * contains and what the repository says it contains — the kind of thing that
 * is discovered during an incident. It fails here instead, loudly, by name.
 */
const MIGRATIONS_DIR = 'supabase/migrations';

export interface AppliedMigration {
  readonly filename: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export function migrationFilenames(directory = MIGRATIONS_DIR): string[] {
  return readdirSync(resolve(process.cwd(), directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

export function checksumOf(contents: string): string {
  // Line endings are normalised so a checkout on another platform does not
  // report every migration as modified.
  return createHash('sha256').update(contents.replace(/\r\n/g, '\n')).digest('hex');
}

// The ledger is deployment infrastructure, not user data, so it is reachable
// only by the service role that runs migrations. Row-level security is still
// enabled and forced, with a policy that permits nothing: without a policy the
// table would simply be absent from the audit that checks every table has one,
// and "nobody may read this" is worth stating rather than implying.
const LEDGER = `
  create table if not exists public.schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  );

  alter table public.schema_migrations enable row level security;
  alter table public.schema_migrations force row level security;

  drop policy if exists no_request_path_access on public.schema_migrations;
  create policy no_request_path_access on public.schema_migrations
    for all to authenticated using (false) with check (false);

  revoke all on public.schema_migrations from authenticated;
`;

/**
 * Applies every migration that has not been applied yet, in filename order.
 *
 * Running this twice applies nothing the second time. Running it against a
 * database whose applied migrations no longer match the repository throws
 * before touching anything.
 */
export async function migrate(
  executor: ScriptExecutor,
  options: { readonly directory?: string; readonly onApply?: (filename: string) => void } = {},
): Promise<MigrationResult> {
  const directory = options.directory ?? MIGRATIONS_DIR;

  await executor.execScript(LEDGER);

  const previous = await executor.query<AppliedMigration>(
    'select filename, checksum from public.schema_migrations',
  );
  const alreadyApplied = new Map(previous.rows.map((row) => [row.filename, row.checksum]));

  const applied: string[] = [];
  const skipped: string[] = [];
  const changed: string[] = [];

  const files = migrationFilenames(directory).map((filename) => {
    const contents = readFileSync(resolve(process.cwd(), directory, filename), 'utf8');
    return { filename, contents, checksum: checksumOf(contents) };
  });

  // Every mismatch is collected before anything runs, so the error names all of
  // them rather than the first one.
  for (const file of files) {
    const recorded = alreadyApplied.get(file.filename);
    if (recorded !== undefined && recorded !== file.checksum) changed.push(file.filename);
  }

  if (changed.length > 0) {
    throw new Error(
      `These migrations have already been applied and have since changed: ${changed.join(', ')}.\n` +
        'The database no longer matches the repository. Write a new migration rather than ' +
        'editing an applied one; if this is a development database, reset it.',
    );
  }

  for (const file of files) {
    if (alreadyApplied.has(file.filename)) {
      skipped.push(file.filename);
      continue;
    }

    options.onApply?.(file.filename);
    await executor.execScript(file.contents);
    await executor.query(
      'insert into public.schema_migrations (filename, checksum) values ($1, $2)',
      [file.filename, file.checksum],
    );
    applied.push(file.filename);
  }

  return { applied, skipped };
}
