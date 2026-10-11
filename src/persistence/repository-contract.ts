import { describe, expect, it } from 'vitest';
import { generateFirstWeek } from '@/domain';
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

    describe('onboarding', () => {
      it('starts at the first step with the conservative profile', async () => {
        const { repository, userId } = await fresh();
        const state = await repository.getOnboarding(userId);

        expect(state.progress.currentStep).toBe('intent');
        expect(state.progress.completedSteps).toEqual([]);
        expect(state.progress.completedAt).toBeNull();
        // A user who has answered nothing still has a usable profile.
        expect(state.profile.training.experience).toBe('returning');
        expect(state.profile.minimum.minimumDaySize).toBe(1);
      });

      it('saves a step and moves on', async () => {
        const { repository, userId } = await fresh();
        const state = await repository.saveStep(userId, 'training', {
          experience: 'experienced',
          sessionMinutes: 60,
        });

        expect(state.profile.training.experience).toBe('experienced');
        expect(state.profile.training.sessionMinutes).toBe(60);
        expect(state.progress.completedSteps).toContain('training');
        expect(state.progress.currentStep).toBe('health');
      });

      it('resumes where it was left', async () => {
        const { repository, userId } = await fresh();
        await repository.saveStep(userId, 'intent', { focuses: ['calm'] });

        const resumed = await repository.getOnboarding(userId);
        expect(resumed.progress.currentStep).toBe('schedule');
        expect(resumed.profile.intent.focuses).toEqual(['calm']);
      });

      it('treats a skipped step as the conservative default, not as missing', async () => {
        const { repository, userId } = await fresh();
        const state = await repository.skipStep(userId, 'health');

        expect(state.progress.skippedSteps).toContain('health');
        expect(state.progress.completedSteps).not.toContain('health');
        expect(state.profile.health.pregnancyStatus).toBe('not_applicable');
        expect(state.profile.health.injuries).toEqual([]);
      });

      it('lets an answer be changed after it was given', async () => {
        const { repository, userId } = await fresh();
        await repository.saveStep(userId, 'minimum', { minimumDaySize: 3 });
        const changed = await repository.saveStep(userId, 'minimum', { minimumDaySize: 1 });

        expect(changed.profile.minimum.minimumDaySize).toBe(1);
      });

      it('rejects answers that are not valid for the step', async () => {
        const { repository, userId } = await fresh();
        await expect(
          repository.saveStep(userId, 'minimum', { minimumDaySize: 9 }),
        ).rejects.toThrow();
      });

      it('stores a draft week and reads it back unchanged', async () => {
        const { repository, userId } = await fresh();
        const { profile } = await repository.getOnboarding(userId);
        const week = generateFirstWeek(profile, { startDate: DAY, timeZone: ZONE });

        const id = await repository.saveDraftWeek(userId, week);
        const latest = await repository.getLatestDraft(userId);

        expect(latest?.id).toBe(id);
        expect(latest?.draft.days).toHaveLength(7);
        expect(latest?.draft.notes.length).toBeGreaterThan(0);
      });

      it('writes nothing until the draft is accepted', async () => {
        const { repository, userId } = await fresh();
        const { profile } = await repository.getOnboarding(userId);
        await repository.saveDraftWeek(
          userId,
          generateFirstWeek(profile, { startDate: DAY, timeZone: ZONE }),
        );

        expect(await repository.getDay(userId, DAY)).toBeNull();
      });

      it('turns an accepted draft into real days and finishes onboarding', async () => {
        const { repository, userId } = await fresh();
        const { profile } = await repository.getOnboarding(userId);
        const week = generateFirstWeek(profile, { startDate: DAY, timeZone: ZONE });
        const id = await repository.saveDraftWeek(userId, week);

        await repository.acceptDraft(userId, id, new Date('2026-03-16T07:00:00.000Z'));

        const day = await repository.getDay(userId, DAY);
        expect(day).not.toBeNull();
        expect(day?.commitments.length).toBe(week.days[0]?.items.length);
        expect(day?.commitments.some((commitment) => commitment.isMinimum)).toBe(true);
        expect(day?.commitments.every((commitment) => commitment.status === 'pending')).toBe(true);

        const days = await repository.listDays(userId, { from: DAY, to: '2026-03-22' });
        expect(days).toHaveLength(7);

        const state = await repository.getOnboarding(userId);
        expect(state.progress.completedAt).not.toBeNull();
      });

      it("refuses to accept a draft that is not this account's", async () => {
        const { repository, userId } = await fresh();
        await expect(
          repository.acceptDraft(userId, '00000000-0000-4000-8000-0000000000ff', new Date()),
        ).rejects.toThrow();
      });
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
