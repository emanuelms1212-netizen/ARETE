import type { Day, IsoDate } from '@/domain';

/**
 * The persistence contract.
 *
 * Everything above this line talks to `DayRepository`, never to a database
 * client. Swapping the demo adapter for Supabase in stage 4 is a change to
 * `src/persistence` and to nothing else.
 */
export interface DayRepository {
  readonly kind: 'memory';
  getDay(date: IsoDate): Promise<Day | null>;
  listDays(): Promise<readonly Day[]>;
}

export class PersistenceNotConfiguredError extends Error {
  override readonly name = 'PersistenceNotConfiguredError';
}
