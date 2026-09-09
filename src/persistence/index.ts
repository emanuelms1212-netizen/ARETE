import { env } from '@/lib/env';
import { createMemoryRepository } from './memory-repository';
import { PersistenceNotConfiguredError, type DayRepository } from './repository';

let repository: DayRepository | null = null;

/**
 * Resolves the repository for the current app mode.
 *
 * `live` mode is rejected in `src/lib/env.ts` before this is ever reached; the
 * branch is kept here so that adding the Supabase adapter in stage 4 is an
 * obvious, single-place change rather than a hunt.
 */
export function getDayRepository(): DayRepository {
  if (repository) return repository;

  if (env.NEXT_PUBLIC_APP_MODE === 'demo') {
    repository = createMemoryRepository();
    return repository;
  }

  throw new PersistenceNotConfiguredError(
    'No persistence adapter is configured for this app mode. The Supabase adapter arrives in stage 4.',
  );
}

export { createMemoryRepository, PersistenceNotConfiguredError };
export type { DayRepository };
export { DEMO_TODAY, demoDays } from './demo-data';
