import { env } from '@/lib/env';
import { DEMO_USER_ID } from './demo-data';
import { createMemoryRepository } from './memory-repository';
import { createPgExecutor, type PgExecutor } from './pg-executor';
import { createSqlRepository } from './sql-repository';
import { PersistenceNotConfiguredError, type AreteRepository } from './repository';

let memoryRepository: AreteRepository | null = null;
let executor: PgExecutor | null = null;

/**
 * Resolves the repository for the current app mode.
 *
 * Demo mode gets the in-memory implementation, seeded deterministically. Live
 * mode gets the SQL one over a pooled connection that row-level security
 * applies to. Both satisfy the same contract and are held to the same tests,
 * so nothing above this line needs to know which it has.
 */
export function getRepository(): AreteRepository {
  if (env.NEXT_PUBLIC_APP_MODE === 'demo') {
    memoryRepository ??= createMemoryRepository(DEMO_USER_ID);
    return memoryRepository;
  }

  if (!env.DATABASE_URL) {
    throw new PersistenceNotConfiguredError(
      'Live mode without DATABASE_URL. Environment validation should have caught this.',
    );
  }

  executor ??= createPgExecutor(env.DATABASE_URL);
  return createSqlRepository(executor);
}

/**
 * Runs `work` with the database session identified as `userId`.
 *
 * In live mode this opens a transaction and sets the JWT claim that row-level
 * security reads, so the policies apply to everything inside. In demo mode
 * there is nothing to scope — the in-memory store already takes the user id on
 * every call — so the work simply runs.
 */
export async function withUser<T>(
  userId: string,
  work: (repository: AreteRepository) => Promise<T>,
): Promise<T> {
  if (env.NEXT_PUBLIC_APP_MODE === 'demo') {
    return work(getRepository());
  }

  getRepository();
  if (!executor) throw new PersistenceNotConfiguredError('No database connection');

  return executor.withUser(userId, (scoped) => work(createSqlRepository(scoped)));
}

export { createMemoryRepository } from './memory-repository';
export { createSqlRepository } from './sql-repository';
export { createPgExecutor } from './pg-executor';
export { asUser } from './sql-executor';
export type { SqlExecutor } from './sql-executor';
export { seedContent, seedDemoAccount, CONTENT_PACKS, CONTENT_SOURCES } from './seed';
export { PersistenceNotConfiguredError, RecordNotFoundError } from './repository';
export type {
  AccountExport,
  AreteRepository,
  DayRepository,
  FocusSession,
  FocusSessionRepository,
  RecordFocusSessionInput,
  SetCommitmentStatusInput,
  UpsertDayInput,
} from './repository';
export { DEMO_TODAY, DEMO_USER_ID, demoDays } from './demo-data';
