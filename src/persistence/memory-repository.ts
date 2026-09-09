import type { Day, IsoDate } from '@/domain';
import { demoDays } from './demo-data';
import type { DayRepository } from './repository';

/**
 * In-memory adapter over the deterministic demo data.
 *
 * It is read-only on purpose. A writable in-memory store would let the UI show
 * a save that vanishes on refresh, which is exactly the "fake persistence" the
 * build rules forbid. Writes arrive with real persistence in stage 4.
 */
export function createMemoryRepository(days: readonly Day[] = demoDays): DayRepository {
  const byDate = new Map<IsoDate, Day>(days.map((day) => [day.date, day]));

  return {
    kind: 'memory',
    async getDay(date: IsoDate): Promise<Day | null> {
      return byDate.get(date) ?? null;
    },
    async listDays(): Promise<readonly Day[]> {
      return [...days].sort((a, b) => b.date.localeCompare(a.date));
    },
  };
}
