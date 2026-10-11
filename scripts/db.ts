/**
 * Database CLI: apply migrations, then seed.
 *
 *   npm run db:migrate   — apply every migration that has not been applied yet
 *   npm run db:seed      — content, and the demo account outside production
 *   npm run db:reset     — both, against a disposable database
 *
 * Migrations are recorded in `public.schema_migrations`, so each file runs
 * exactly once and an already-applied file that has since been edited fails
 * loudly rather than diverging quietly. See src/persistence/migrator.ts.
 *
 * Reads SUPABASE_DB_URL (service role, which bypasses row-level security)
 * because creating tables and inserting shipped content are deployment work,
 * never something a request does.
 */
import { createPgExecutor } from '../src/persistence/pg-executor';
import { migrate } from '../src/persistence/migrator';
import { seedContent, seedDemoAccount } from '../src/persistence/seed';

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
      const result = await migrate(executor, {
        onApply: (file) => process.stdout.write(`applying ${file}\n`),
      });
      if (result.applied.length === 0) {
        process.stdout.write(`nothing to apply; ${result.skipped.length} already applied\n`);
      } else {
        process.stdout.write(
          `applied ${result.applied.length}, skipped ${result.skipped.length}\n`,
        );
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
