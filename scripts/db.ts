/**
 * Database CLI: apply migrations, then seed.
 *
 *   npm run db:migrate   — apply every migration, in order, from zero
 *   npm run db:seed      — content, and the demo account outside production
 *   npm run db:reset     — both, against a disposable database
 *
 * Reads SUPABASE_DB_URL (service role, which bypasses row-level security)
 * because creating tables and inserting shipped content are deployment work,
 * never something a request does.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPgExecutor } from '../src/persistence/pg-executor';
import { seedContent, seedDemoAccount } from '../src/persistence/seed';

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations');

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'migrate';
  const connectionString = process.env['SUPABASE_DB_URL'];

  if (!connectionString) {
    console.error(
      'SUPABASE_DB_URL is not set.\n' +
        'This is the service-role connection string from the Supabase dashboard\n' +
        '(Project settings -> Database -> Connection string). Keep it out of the repository.',
    );
    process.exitCode = 1;
    return;
  }

  const executor = createPgExecutor(connectionString);

  try {
    if (command === 'migrate' || command === 'reset') {
      for (const file of readdirSync(MIGRATIONS)
        .filter((n) => n.endsWith('.sql'))
        .sort()) {
        process.stdout.write(`applying ${file}\n`);
        await executor.query(readFileSync(resolve(MIGRATIONS, file), 'utf8'));
      }
    }

    if (command === 'seed' || command === 'reset') {
      process.stdout.write('seeding content\n');
      await seedContent(executor);

      if (process.env['NODE_ENV'] !== 'production') {
        process.stdout.write('seeding the demo account\n');
        await seedDemoAccount(executor);
      }
    }

    process.stdout.write('done\n');
  } finally {
    await executor.end();
  }
}

void main();
