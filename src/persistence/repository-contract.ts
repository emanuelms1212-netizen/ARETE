import { describe, expect, it } from 'vitest';
import type { AreteRepository } from './repository';

export interface ContractSubject {
  readonly repository: AreteRepository;
  readonly userId: string;
  /** Reset to a clean account between tests. */
  reset(): Promise<void>;
}

const DAY = '2026-03-16';
const ZONE = 'Europe/London';

/**
 * One suite, two implementations.
 *
 * The demo repository and the SQL repository are only interchangeable if they
 * behave identically, and the only way to know that is to hold both to the same
 * tests. Anything asserted here is a promise the persistence layer makes,
 * independent of where the rows live.
 */
export function describeRepositoryContract(
  name: string,
  createSubject: () => Promise<ContractSubject>,
): void {
  describe(`${name}: repository contract`, () => {
    async function fresh(): Promise<ContractSubject> {
      const subject = await createSubject();
      await subject.reset();
      return subject;
    }

    it('knows the zone the account measures its days in', async () => {
      const { repository, userId } = await fresh();
      const zone = await repository.getTimeZone(userId);

      expect(typeof zone).toBe('string');
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone })).not.toThrow();
    });

    it('returns null for a day that does not exist, rather than an empty day', async () => {
      const { repository, userId } = await fresh();
      expect(await repository.getDay(userId, '1999-01-01')).toBeNull();
    });

    it('creates a day with its commitments, in order', async () => {
      const { repository, userId } = await fresh();

      const day = await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [
          { kind: 'mind', title: 'Sit for ten minutes', isMinimum: true },
          { kind: 'habit', title: 'Read ten pages' },
        ],
      });

      expect(day.date).toBe(DAY);
      expect(day.mark).toBe('normal');
      expect(day.committedAt).toBeNull();
      expect(day.commitments.map((c) => c.title)).toEqual([
        'Sit for ten minutes',
        'Read ten pages',
      ]);
      expect(day.commitments[0]?.isMinimum).toBe(true);
      expect(day.commitments[1]?.isMinimum).toBe(false);
      expect(day.commitments.every((c) => c.status === 'pending')).toBe(true);
    });

    it('commits the day, freezing the intent', async () => {
      const { repository, userId } = await fresh();
      await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [{ kind: 'task', title: 'One focus block' }],
      });

      const at = new Date('2026-03-16T07:20:00.000Z');
      const committed = await repository.commitDay(userId, DAY, at);

      expect(committed.committedAt).not.toBeNull();
      expect(new Date(committed.committedAt!).toISOString()).toBe(at.toISOString());
    });

    it('marks a day as travel or not-today', async () => {
      const { repository, userId } = await fresh();
      await repository.upsertDay(userId, { localDate: DAY, timeZone: ZONE, commitments: [] });

      expect((await repository.markDay(userId, DAY, 'travel')).mark).toBe('travel');
      expect((await repository.markDay(userId, DAY, 'not-today', 'Slept badly')).mark).toBe(
        'not-today',
      );
      expect((await repository.markDay(userId, DAY, 'normal')).mark).toBe('normal');
    });

    it('completes a commitment', async () => {
      const { repository, userId } = await fresh();
      const day = await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [{ kind: 'mind', title: 'Sit for ten minutes', isMinimum: true }],
      });

      const updated = await repository.setCommitmentStatus(userId, {
        localDate: DAY,
        commitmentId: day.commitments[0]!.id,
        status: 'done',
        at: new Date('2026-03-16T08:00:00.000Z'),
      });

      expect(updated.commitments[0]?.status).toBe('done');
    });

    it('records why something was skipped, and refuses a skip without one', async () => {
      const { repository, userId } = await fresh();
      const day = await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [{ kind: 'workout', title: 'Lower body' }],
      });
      const commitmentId = day.commitments[0]!.id;

      const skipped = await repository.setCommitmentStatus(userId, {
        localDate: DAY,
        commitmentId,
        status: 'skipped',
        skipReason: 'Slept badly',
        at: new Date('2026-03-16T18:00:00.000Z'),
      });
      expect(skipped.commitments[0]?.skipReason).toBe('Slept badly');

      await expect(
        repository.setCommitmentStatus(userId, {
          localDate: DAY,
          commitmentId,
          status: 'skipped',
          at: new Date('2026-03-16T18:00:00.000Z'),
        }),
      ).rejects.toThrow(/reason/i);
    });

    it('keeps the status of items that survive an edit to the day', async () => {
      const { repository, userId } = await fresh();
      const day = await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [
          { kind: 'mind', title: 'Sit for ten minutes', isMinimum: true },
          { kind: 'habit', title: 'Read ten pages' },
        ],
      });
      await repository.setCommitmentStatus(userId, {
        localDate: DAY,
        commitmentId: day.commitments[0]!.id,
        status: 'done',
        at: new Date('2026-03-16T08:00:00.000Z'),
      });

      const edited = await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [
          { kind: 'mind', title: 'Sit for ten minutes', isMinimum: true },
          { kind: 'mobility', title: 'Hamstrings' },
        ],
      });

      expect(edited.commitments.map((c) => c.title)).toEqual(['Sit for ten minutes', 'Hamstrings']);
      expect(edited.commitments[0]?.status).toBe('done');
      expect(edited.commitments[1]?.status).toBe('pending');
    });

    it('lists days newest first, within the range asked for', async () => {
      const { repository, userId } = await fresh();
      for (const date of ['2026-03-14', '2026-03-15', '2026-03-16']) {
        await repository.upsertDay(userId, { localDate: date, timeZone: ZONE, commitments: [] });
      }

      const days = await repository.listDays(userId, { from: '2026-03-15', to: '2026-03-16' });
      expect(days.map((day) => day.date)).toEqual(['2026-03-16', '2026-03-15']);
    });

    it('records a focus session once, however many times it is sent', async () => {
      const { repository, userId } = await fresh();
      const input = {
        localDate: DAY,
        timeZone: ZONE,
        plannedMinutes: 25,
        startedAt: new Date('2026-03-16T09:00:00.000Z'),
        endedAt: new Date('2026-03-16T09:25:00.000Z'),
        actualSeconds: 1500,
        interruptions: 1,
        status: 'completed' as const,
        clientToken: 'focus:user:2026-03-16T09:00:00.000Z',
      };

      const first = await repository.recordFocusSession(userId, input);
      const retry = await repository.recordFocusSession(userId, input);

      expect(retry.id).toBe(first.id);
      expect(await repository.listFocusSessions(userId, DAY)).toHaveLength(1);
    });

    it('keeps genuinely different sessions apart', async () => {
      const { repository, userId } = await fresh();
      const base = {
        localDate: DAY,
        timeZone: ZONE,
        plannedMinutes: 25,
        startedAt: new Date('2026-03-16T09:00:00.000Z'),
        endedAt: new Date('2026-03-16T09:25:00.000Z'),
        actualSeconds: 1500,
        status: 'completed' as const,
      };

      await repository.recordFocusSession(userId, { ...base, clientToken: 'focus:a' });
      await repository.recordFocusSession(userId, { ...base, clientToken: 'focus:b' });

      expect(await repository.listFocusSessions(userId, DAY)).toHaveLength(2);
    });

    it('exports what the account holds', async () => {
      const { repository, userId } = await fresh();
      await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [{ kind: 'mind', title: 'Sit for ten minutes' }],
      });

      const exported = await repository.exportEverything(userId);

      expect(exported.schemaVersion).toBeGreaterThan(0);
      expect(Object.keys(exported.tables)).toContain('daily_plans');
      expect(exported.tables['daily_plans']?.length).toBeGreaterThan(0);
    });

    it('deletes everything, and means it', async () => {
      const { repository, userId } = await fresh();
      await repository.upsertDay(userId, {
        localDate: DAY,
        timeZone: ZONE,
        commitments: [{ kind: 'mind', title: 'Sit for ten minutes' }],
      });

      await repository.deleteEverything(userId);

      expect(await repository.getDay(userId, DAY)).toBeNull();
      expect(await repository.listDays(userId, { from: '2000-01-01', to: '2100-01-01' })).toEqual(
        [],
      );
    });
  });
}
