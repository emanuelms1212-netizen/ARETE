import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/content/train/exercises';
import {
  buildWorkout,
  generateFirstWeek,
  generateTrainingPlan,
  trainingSetupSchema,
  type WorkoutSnapshot,
} from '@/domain';
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

    // =====================================================================
    // Goals
    // =====================================================================
    describe('goals', () => {
      it('refuses half a measure, in both adapters', async () => {
        const { repository, userId } = await fresh();

        // A unit without a target renders a progress bar that cannot be read.
        await expect(
          repository.createGoal(userId, { title: 'Run further', measureUnit: 'km' }),
        ).rejects.toThrow();
      });

      it('stores a goal with no measure at all, and says it is judged', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, {
          title: 'Be a better listener',
          why: 'Because people notice.',
        });

        const detail = await repository.getGoal(userId, goal.id);
        expect(detail?.goal.title).toBe('Be a better listener');
        expect(detail?.goal.targetValue).toBeNull();
      });

      it('keeps one reading per day, replacing a correction rather than stacking', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, {
          title: 'Run 10k',
          measureUnit: 'km',
          startValue: 3,
          targetValue: 10,
        });

        await repository.recordMeasurement(userId, {
          goalId: goal.id,
          localDate: DAY,
          timeZone: ZONE,
          value: 5,
          clientToken: 'reading-1',
        });
        const after = await repository.recordMeasurement(userId, {
          goalId: goal.id,
          localDate: DAY,
          timeZone: ZONE,
          value: 6,
          clientToken: 'reading-2',
        });

        expect(after).toHaveLength(1);
        expect(after[0]?.value).toBe(6);
      });

      it('returns readings in date order whatever order they arrived in', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, {
          title: 'Run 10k',
          measureUnit: 'km',
          targetValue: 10,
        });

        await repository.recordMeasurement(userId, {
          goalId: goal.id,
          localDate: '2026-03-20',
          timeZone: ZONE,
          value: 7,
          clientToken: 'b',
        });
        const all = await repository.recordMeasurement(userId, {
          goalId: goal.id,
          localDate: '2026-03-16',
          timeZone: ZONE,
          value: 4,
          clientToken: 'a',
        });

        expect(all.map((m) => m.localDate)).toEqual(['2026-03-16', '2026-03-20']);
      });

      it('lets a review change the goal, because a review that changes nothing is a form', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, { title: 'Learn Greek' });

        await repository.saveGoalReview(userId, {
          goalId: goal.id,
          weekStart: '2026-03-16',
          timeZone: ZONE,
          progressNote: 'Two sessions.',
          frictionNote: 'Evenings vanish.',
          nextCommitment: 'Mornings instead.',
          verdict: 'pause',
        });

        const detail = await repository.getGoal(userId, goal.id);
        expect(detail?.goal.status).toBe('paused');
        expect(detail?.latestReview?.nextCommitment).toBe('Mornings instead.');
      });

      it('brings a paused goal back when the next review says continue', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, { title: 'Learn Greek' });

        const review = {
          goalId: goal.id,
          timeZone: ZONE,
          progressNote: null,
          frictionNote: null,
          nextCommitment: null,
        };
        await repository.saveGoalReview(userId, {
          ...review,
          weekStart: '2026-03-16',
          verdict: 'pause',
        });
        await repository.saveGoalReview(userId, {
          ...review,
          weekStart: '2026-03-23',
          verdict: 'continue',
        });

        expect((await repository.getGoal(userId, goal.id))?.goal.status).toBe('active');
      });

      it('replaces a review for the same week rather than keeping two', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, { title: 'Learn Greek' });

        const base = {
          goalId: goal.id,
          weekStart: '2026-03-16',
          timeZone: ZONE,
          frictionNote: null,
          nextCommitment: null,
          verdict: 'continue' as const,
        };
        await repository.saveGoalReview(userId, { ...base, progressNote: 'First try' });
        await repository.saveGoalReview(userId, { ...base, progressNote: 'Thought again' });

        const reviews = await repository.listGoalReviews(userId, goal.id);
        expect(reviews).toHaveLength(1);
        expect(reviews[0]?.progressNote).toBe('Thought again');
      });

      it('keeps a goal’s history when the goal is archived', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, {
          title: 'Run 10k',
          measureUnit: 'km',
          targetValue: 10,
        });
        await repository.recordMeasurement(userId, {
          goalId: goal.id,
          localDate: DAY,
          timeZone: ZONE,
          value: 5,
          clientToken: 'r1',
        });

        await repository.archiveGoal(userId, goal.id, new Date('2026-03-20T10:00:00Z'));

        expect(await repository.listGoals(userId)).toHaveLength(0);
        const detail = await repository.getGoal(userId, goal.id);
        expect(detail?.measurements).toHaveLength(1);
      });

      it('tracks milestones without turning them into a percentage', async () => {
        const { repository, userId } = await fresh();
        const goal = await repository.createGoal(userId, { title: 'Ship it' });
        const milestone = await repository.addMilestone(userId, {
          goalId: goal.id,
          title: 'Draft the spec',
        });

        await repository.setMilestoneDone(userId, milestone.id, new Date('2026-03-18T09:00:00Z'));

        const detail = await repository.getGoal(userId, goal.id);
        expect(detail?.milestones[0]?.completedAt).not.toBeNull();
        expect(detail?.goal.targetValue).toBeNull();
      });

      it('refuses a measurement against someone else’s goal', async () => {
        const { repository, userId } = await fresh();

        await expect(
          repository.recordMeasurement(userId, {
            goalId: '00000000-0000-0000-0000-000000000001',
            localDate: DAY,
            timeZone: ZONE,
            value: 1,
            clientToken: 'nope',
          }),
        ).rejects.toThrow();
      });
    });

    // =====================================================================
    // Tasks
    // =====================================================================
    describe('tasks', () => {
      it('puts a task with no date in the inbox, not in today', async () => {
        const { repository, userId } = await fresh();
        await repository.createTask(userId, { title: 'Think about the thing' });

        const inbox = await repository.listTasks(userId, { view: 'inbox', today: DAY });
        const today = await repository.listTasks(userId, { view: 'today', today: DAY });

        expect(inbox.map((t) => t.title)).toEqual(['Think about the thing']);
        expect(today).toHaveLength(0);
      });

      it('shows an overdue task in today rather than hiding it in the past', async () => {
        const { repository, userId } = await fresh();
        await repository.createTask(userId, { title: 'Overdue', scheduledDate: '2026-03-10' });

        const today = await repository.listTasks(userId, { view: 'today', today: DAY });
        expect(today.map((t) => t.title)).toEqual(['Overdue']);
      });

      it('separates upcoming from someday by the horizon', async () => {
        const { repository, userId } = await fresh();
        await repository.createTask(userId, { title: 'Soon', scheduledDate: '2026-03-18' });
        await repository.createTask(userId, { title: 'Later', scheduledDate: '2026-05-01' });

        const upcoming = await repository.listTasks(userId, {
          view: 'upcoming',
          today: DAY,
          horizonDays: 7,
        });
        const someday = await repository.listTasks(userId, {
          view: 'someday',
          today: DAY,
          horizonDays: 7,
        });

        expect(upcoming.map((t) => t.title)).toEqual(['Soon']);
        expect(someday.map((t) => t.title)).toEqual(['Later']);
      });

      it('nests subtasks inside their parent rather than listing them beside it', async () => {
        const { repository, userId } = await fresh();
        const parent = await repository.createTask(userId, {
          title: 'Move house',
          scheduledDate: DAY,
        });
        await repository.createTask(userId, {
          title: 'Book the van',
          parentTaskId: parent.id,
          scheduledDate: DAY,
        });

        const today = await repository.listTasks(userId, { view: 'today', today: DAY });

        expect(today).toHaveLength(1);
        expect(today[0]?.subtasks.map((t) => t.title)).toEqual(['Book the van']);
      });

      it('refuses a subtask of a subtask, in both adapters', async () => {
        const { repository, userId } = await fresh();
        const parent = await repository.createTask(userId, { title: 'Move house' });
        const child = await repository.createTask(userId, {
          title: 'Book the van',
          parentTaskId: parent.id,
        });

        await expect(
          repository.createTask(userId, { title: 'Compare prices', parentTaskId: child.id }),
        ).rejects.toThrow();
      });

      it('refuses a recurring subtask', async () => {
        const { repository, userId } = await fresh();
        const parent = await repository.createTask(userId, { title: 'Move house' });

        await expect(
          repository.createTask(userId, {
            title: 'Weekly check',
            parentTaskId: parent.id,
            recurrence: { freq: 'weekly', interval: 1, weekdays: [1] },
          }),
        ).rejects.toThrow();
      });

      it('advances a recurring task instead of ending the series', async () => {
        const { repository, userId } = await fresh();
        // 2026-03-16 is a Monday.
        const task = await repository.createTask(userId, {
          title: 'Water the plants',
          scheduledDate: DAY,
          recurrence: { freq: 'weekly', interval: 1, weekdays: [1] },
        });

        const after = await repository.setTaskStatus(userId, {
          taskId: task.id,
          status: 'done',
          at: new Date('2026-03-16T20:00:00Z'),
          today: DAY,
        });

        expect(after.status).toBe('open');
        expect(after.scheduledDate).toBe('2026-03-23');
      });

      it('keeps the series anchored when a recurring task is finished late', async () => {
        const { repository, userId } = await fresh();
        const task = await repository.createTask(userId, {
          title: 'Water the plants',
          scheduledDate: DAY,
          recurrence: { freq: 'weekly', interval: 1, weekdays: [1] },
        });

        // Ticked on the Thursday, not the Monday it was due.
        const after = await repository.setTaskStatus(userId, {
          taskId: task.id,
          status: 'done',
          at: new Date('2026-03-19T20:00:00Z'),
          today: '2026-03-19',
        });

        // Still the following Monday, not the Thursday after.
        expect(after.scheduledDate).toBe('2026-03-23');
      });

      it('finishes a one-off task rather than rescheduling it', async () => {
        const { repository, userId } = await fresh();
        const task = await repository.createTask(userId, { title: 'Renew passport' });

        const after = await repository.setTaskStatus(userId, {
          taskId: task.id,
          status: 'done',
          at: new Date('2026-03-16T20:00:00Z'),
          today: DAY,
        });

        expect(after.status).toBe('done');
        expect(after.completedAt).not.toBeNull();
      });

      it('archives subtasks with their parent, leaving no orphans', async () => {
        const { repository, userId } = await fresh();
        const parent = await repository.createTask(userId, { title: 'Move house' });
        await repository.createTask(userId, { title: 'Book the van', parentTaskId: parent.id });

        await repository.archiveTask(userId, parent.id, new Date('2026-03-20T10:00:00Z'));

        const all = await repository.listTasks(userId, { view: 'all', today: DAY });
        expect(all).toHaveLength(0);
      });

      it('keeps energy and context, because they decide what is doable at 9pm', async () => {
        const { repository, userId } = await fresh();
        const task = await repository.createTask(userId, {
          title: 'Reply to Dana',
          scheduledDate: DAY,
          energy: 'low',
          context: 'phone',
          estimateMinutes: 5,
        });

        const read = await repository.getTask(userId, task.id);
        expect(read?.energy).toBe('low');
        expect(read?.context).toBe('phone');
        expect(read?.estimateMinutes).toBe(5);
      });
    });

    // =====================================================================
    // Habits
    // =====================================================================
    describe('habits', () => {
      it('refuses a counted habit with no target', async () => {
        const { repository, userId } = await fresh();

        await expect(
          repository.createHabit(userId, { title: 'Read', kind: 'count', unit: 'pages' }),
        ).rejects.toThrow();
      });

      it('keeps one log per habit per day, replacing rather than duplicating', async () => {
        const { repository, userId } = await fresh();
        const habit = await repository.createHabit(userId, { title: 'Read', kind: 'binary' });

        await repository.logHabit(userId, {
          habitId: habit.id,
          localDate: DAY,
          timeZone: ZONE,
          status: 'done',
          clientToken: 'log-1',
        });
        await repository.logHabit(userId, {
          habitId: habit.id,
          localDate: DAY,
          timeZone: ZONE,
          status: 'skipped',
          skipReason: 'Travelling',
          clientToken: 'log-2',
        });

        const logs = await repository.listHabitLogs(userId, { from: DAY, to: DAY });
        expect(logs).toHaveLength(1);
        expect(logs[0]?.status).toBe('skipped');
      });

      it('refuses a skip with no reason — that is what makes it not a failure', async () => {
        const { repository, userId } = await fresh();
        const habit = await repository.createHabit(userId, { title: 'Read', kind: 'binary' });

        await expect(
          repository.logHabit(userId, {
            habitId: habit.id,
            localDate: DAY,
            timeZone: ZONE,
            status: 'skipped',
            clientToken: 'log-1',
          }),
        ).rejects.toThrow();
      });

      it('refuses a partial log with no value', async () => {
        const { repository, userId } = await fresh();
        const habit = await repository.createHabit(userId, {
          title: 'Read',
          kind: 'count',
          unit: 'pages',
          targetValue: 20,
        });

        await expect(
          repository.logHabit(userId, {
            habitId: habit.id,
            localDate: DAY,
            timeZone: ZONE,
            status: 'partial',
            clientToken: 'log-1',
          }),
        ).rejects.toThrow();
      });

      it('stores a rest day as its own thing, not as a skip', async () => {
        const { repository, userId } = await fresh();
        const habit = await repository.createHabit(userId, { title: 'Run', kind: 'binary' });

        await repository.logHabit(userId, {
          habitId: habit.id,
          localDate: DAY,
          timeZone: ZONE,
          status: 'rest',
          clientToken: 'log-1',
        });

        const logs = await repository.listHabitLogs(userId, { from: DAY, to: DAY });
        expect(logs[0]?.status).toBe('rest');
      });

      it('round-trips a limit habit, where lower is better', async () => {
        const { repository, userId } = await fresh();
        const habit = await repository.createHabit(userId, {
          title: 'Coffee',
          kind: 'limit',
          unit: 'cups',
          targetValue: 2,
        });

        const listed = await repository.listHabits(userId);
        expect(listed[0]?.habit.kind).toBe('limit');
        expect(listed[0]?.habit.targetValue).toBe(2);
        expect(habit.kind).toBe('limit');
      });

      it('hides a paused habit from the day without archiving it', async () => {
        const { repository, userId } = await fresh();
        const habit = await repository.createHabit(userId, { title: 'Run', kind: 'binary' });

        const paused = await repository.setHabitPaused(
          userId,
          habit.id,
          new Date('2026-03-16T08:00:00Z'),
        );

        expect(paused.pausedAt).not.toBeNull();
        expect(paused.archivedAt).toBeNull();
        expect(await repository.listHabits(userId)).toHaveLength(1);
      });

      it('refuses a log against someone else’s habit', async () => {
        const { repository, userId } = await fresh();

        await expect(
          repository.logHabit(userId, {
            habitId: '00000000-0000-0000-0000-000000000001',
            localDate: DAY,
            timeZone: ZONE,
            status: 'done',
            clientToken: 'nope',
          }),
        ).rejects.toThrow();
      });
    });

    // =====================================================================
    // The day: framing, edits, minimum mode and the review
    // =====================================================================
    describe('the day loop', () => {
      it('starts with an empty framing rather than failing', async () => {
        const { repository, userId } = await fresh();
        const framing = await repository.getFraming(userId, DAY);

        expect(framing.intention).toBeNull();
        expect(framing.minimumMode).toBe(false);
      });

      it('keeps the morning intention and the control prompt', async () => {
        const { repository, userId } = await fresh();
        await repository.setFraming(userId, {
          localDate: DAY,
          timeZone: ZONE,
          intention: 'Finish the draft.',
          inMyControl: 'Starting at nine.',
          notMyControl: 'Whether they reply.',
        });

        const framing = await repository.getFraming(userId, DAY);
        expect(framing.intention).toBe('Finish the draft.');
        expect(framing.notMyControl).toBe('Whether they reply.');
      });

      it('updates one field of the framing without clearing the others', async () => {
        const { repository, userId } = await fresh();
        await repository.setFraming(userId, {
          localDate: DAY,
          timeZone: ZONE,
          intention: 'Finish the draft.',
          inMyControl: 'Starting at nine.',
        });
        await repository.setFraming(userId, {
          localDate: DAY,
          timeZone: ZONE,
          notMyControl: 'The weather.',
        });

        const framing = await repository.getFraming(userId, DAY);
        expect(framing.intention).toBe('Finish the draft.');
        expect(framing.notMyControl).toBe('The weather.');
      });

      it('turns on minimum mode without marking anything as failed', async () => {
        const { repository, userId } = await fresh();
        await repository.upsertDay(userId, {
          localDate: DAY,
          timeZone: ZONE,
          commitments: [
            { kind: 'mind', title: 'Sit', isMinimum: true },
            { kind: 'workout', title: 'Session' },
          ],
        });

        const day = await repository.setMinimumMode(userId, {
          localDate: DAY,
          timeZone: ZONE,
          on: true,
          at: new Date('2026-03-16T07:00:00Z'),
        });

        expect((await repository.getFraming(userId, DAY)).minimumMode).toBe(true);
        // The decisive assertion: nothing was skipped, nothing was failed.
        expect(day.commitments.every((c) => c.status === 'pending')).toBe(true);
      });

      it('adds a commitment to a day that does not exist yet', async () => {
        const { repository, userId } = await fresh();
        const day = await repository.addCommitment(userId, {
          localDate: '2026-04-01',
          timeZone: ZONE,
          commitment: { kind: 'task', title: 'Call the bank' },
        });

        expect(day.commitments.map((c) => c.title)).toEqual(['Call the bank']);
      });

      it('reorders commitments, and keeps the ones the caller did not mention', async () => {
        const { repository, userId } = await fresh();
        const day = await repository.upsertDay(userId, {
          localDate: DAY,
          timeZone: ZONE,
          commitments: [
            { kind: 'mind', title: 'First' },
            { kind: 'task', title: 'Second' },
            { kind: 'food', title: 'Third' },
          ],
        });

        const ids = day.commitments.map((c) => c.id);
        const reordered = await repository.reorderCommitments(userId, {
          localDate: DAY,
          orderedIds: [ids[2]!, ids[0]!],
        });

        expect(reordered.commitments.map((c) => c.title)).toEqual(['Third', 'First', 'Second']);
      });

      it('moves a commitment to a later day and records that it was moved', async () => {
        const { repository, userId } = await fresh();
        const day = await repository.upsertDay(userId, {
          localDate: DAY,
          timeZone: ZONE,
          commitments: [{ kind: 'task', title: 'Call the bank' }],
        });

        const after = await repository.snoozeCommitment(userId, {
          localDate: DAY,
          commitmentId: day.commitments[0]!.id,
          to: '2026-03-17',
          timeZone: ZONE,
          at: new Date('2026-03-16T18:00:00Z'),
        });

        // "I moved this" stays distinguishable from "I ignored this".
        expect(after.commitments[0]?.snoozedTo).toBe('2026-03-17');
        const tomorrow = await repository.getDay(userId, '2026-03-17');
        expect(tomorrow?.commitments.map((c) => c.title)).toEqual(['Call the bank']);
      });

      it('refuses to move a commitment backwards', async () => {
        const { repository, userId } = await fresh();
        const day = await repository.upsertDay(userId, {
          localDate: DAY,
          timeZone: ZONE,
          commitments: [{ kind: 'task', title: 'Call the bank' }],
        });

        await expect(
          repository.snoozeCommitment(userId, {
            localDate: DAY,
            commitmentId: day.commitments[0]!.id,
            to: '2026-03-15',
            timeZone: ZONE,
            at: new Date('2026-03-16T18:00:00Z'),
          }),
        ).rejects.toThrow();
      });

      it('stores the evening review and reads it back', async () => {
        const { repository, userId } = await fresh();
        await repository.saveDayReview(userId, {
          localDate: DAY,
          timeZone: ZONE,
          wentWell: 'Started early.',
          friction: 'Too many tabs.',
          tomorrowOneThing: 'Draft the intro.',
          energy: 'steady',
          metMinimum: true,
        });

        const review = await repository.getDayReview(userId, DAY);
        expect(review?.tomorrowOneThing).toBe('Draft the intro.');
        expect(review?.metMinimum).toBe(true);
      });

      it('keeps the review’s verdict even if the plan is edited afterwards', async () => {
        const { repository, userId } = await fresh();
        await repository.upsertDay(userId, {
          localDate: DAY,
          timeZone: ZONE,
          commitments: [{ kind: 'mind', title: 'Sit', isMinimum: true }],
        });
        await repository.saveDayReview(userId, {
          localDate: DAY,
          timeZone: ZONE,
          wentWell: null,
          friction: null,
          tomorrowOneThing: null,
          energy: null,
          metMinimum: true,
        });

        await repository.addCommitment(userId, {
          localDate: DAY,
          timeZone: ZONE,
          commitment: { kind: 'workout', title: 'A session nobody did', isMinimum: true },
        });

        expect((await repository.getDayReview(userId, DAY))?.metMinimum).toBe(true);
      });

      it('has no review before one is written', async () => {
        const { repository, userId } = await fresh();
        expect(await repository.getDayReview(userId, DAY)).toBeNull();
      });
    });

    // =====================================================================
    // The focus timer
    // =====================================================================
    describe('the focus timer', () => {
      const STARTED = new Date('2026-03-16T09:00:00Z');

      async function start(subject: ContractSubject, token = 'focus-1') {
        return subject.repository.startFocusSession(subject.userId, {
          localDate: DAY,
          timeZone: ZONE,
          plannedMinutes: 25,
          kind: 'work',
          preset: 'classic',
          startedAt: STARTED,
          clientToken: token,
        });
      }

      it('has nothing running on a fresh account', async () => {
        const { repository, userId } = await fresh();
        expect(await repository.getRunningFocusSession(userId)).toBeNull();
      });

      it('restores a running session after a refresh, with its elapsed time intact', async () => {
        const subject = await fresh();
        await start(subject);

        // The reload: nothing is carried over but the user id.
        const restored = await subject.repository.getRunningFocusSession(subject.userId);

        expect(restored).not.toBeNull();
        expect(restored?.startedAt.toISOString()).toBe(STARTED.toISOString());
        expect(restored?.accumulatedSeconds).toBe(0);
      });

      it('refuses a second timer rather than leaving the UI to pick one', async () => {
        const subject = await fresh();
        await start(subject);

        await expect(start(subject, 'focus-2')).rejects.toThrow();
      });

      it('returns the same session for a retried start', async () => {
        const subject = await fresh();
        const first = await start(subject, 'same-token');
        const second = await start(subject, 'same-token');

        expect(second.id).toBe(first.id);
      });

      it('banks the elapsed seconds when paused, and stops the clock', async () => {
        const subject = await fresh();
        await start(subject);

        const paused = await subject.repository.pauseFocusSession(
          subject.userId,
          new Date(STARTED.getTime() + 300_000),
        );

        expect(paused.accumulatedSeconds).toBe(300);
        expect(paused.pausedAt).not.toBeNull();
        expect(paused.interruptions).toBe(1);
      });

      it('does not count paused time as focus', async () => {
        const subject = await fresh();
        await start(subject);

        await subject.repository.pauseFocusSession(
          subject.userId,
          new Date(STARTED.getTime() + 300_000),
        );
        // An hour passes while paused.
        const resumed = await subject.repository.resumeFocusSession(
          subject.userId,
          new Date(STARTED.getTime() + 3_900_000),
        );

        expect(resumed.accumulatedSeconds).toBe(300);
        expect(resumed.pausedAt).toBeNull();

        const finished = await subject.repository.finishFocusSession(subject.userId, {
          at: new Date(STARTED.getTime() + 4_200_000),
          status: 'completed',
        });

        // Five minutes before the pause, five after. Not seventy.
        expect(finished?.accumulatedSeconds).toBe(600);
      });

      it('links the session to the task it was for, by snapshot', async () => {
        const subject = await fresh();
        const task = await subject.repository.createTask(subject.userId, {
          title: 'Draft the report',
          scheduledDate: DAY,
        });

        const session = await subject.repository.startFocusSession(subject.userId, {
          localDate: DAY,
          timeZone: ZONE,
          plannedMinutes: 25,
          kind: 'work',
          taskId: task.id,
          startedAt: STARTED,
          clientToken: 'linked',
        });

        expect(session.taskId).toBe(task.id);
        expect(session.taskTitleSnapshot).toBe('Draft the report');
      });

      it('keeps the link readable after the task is archived', async () => {
        const subject = await fresh();
        const task = await subject.repository.createTask(subject.userId, {
          title: 'Draft the report',
        });
        await subject.repository.startFocusSession(subject.userId, {
          localDate: DAY,
          timeZone: ZONE,
          plannedMinutes: 25,
          kind: 'work',
          taskId: task.id,
          startedAt: STARTED,
          clientToken: 'linked',
        });
        await subject.repository.finishFocusSession(subject.userId, {
          at: new Date(STARTED.getTime() + 1_500_000),
          status: 'completed',
        });

        await subject.repository.archiveTask(
          subject.userId,
          task.id,
          new Date('2026-03-20T10:00:00Z'),
        );

        // The history of work done on a thing outlives the thing.
        const running = await subject.repository.getRunningFocusSession(subject.userId);
        expect(running).toBeNull();
      });

      it('does not hand back a finished session to a new start', async () => {
        // The bug this guards: a start token coarse enough to repeat — one
        // derived from the date and the current minute, say — matches the row
        // of a session that has already ended, and the caller is handed a
        // stopped timer as if it had just begun.
        const subject = await fresh();
        const first = await start(subject, 'attempt-1');
        await subject.repository.finishFocusSession(subject.userId, {
          at: new Date(STARTED.getTime() + 1_500_000),
          status: 'completed',
        });

        const second = await start(subject, 'attempt-2');

        expect(second.id).not.toBe(first.id);
        expect(second.status).toBe('running');
        expect(second.endedAt).toBeNull();
      });

      it('frees the slot once a session is finished', async () => {
        const subject = await fresh();
        await start(subject);
        await subject.repository.finishFocusSession(subject.userId, {
          at: new Date(STARTED.getTime() + 1_500_000),
          status: 'completed',
        });

        expect(await subject.repository.getRunningFocusSession(subject.userId)).toBeNull();
        await expect(start(subject, 'focus-next')).resolves.toBeDefined();
      });

      it('keeps a one-line reflection with the finished session', async () => {
        const subject = await fresh();
        await start(subject);

        const finished = await subject.repository.finishFocusSession(subject.userId, {
          at: new Date(STARTED.getTime() + 1_500_000),
          status: 'completed',
          reflection: 'Got the structure down.',
        });

        expect(finished?.reflection).toBe('Got the structure down.');
      });

      it('returns null when there is nothing to finish', async () => {
        const { repository, userId } = await fresh();
        expect(
          await repository.finishFocusSession(userId, { at: new Date(), status: 'completed' }),
        ).toBeNull();
      });
    });

    // =====================================================================
    // Mind: meditation, breathwork and cognitive practice
    // =====================================================================
    describe('mind', () => {
      const MIND_START = new Date('2026-03-16T07:00:00Z');

      async function startMeditation(subject: ContractSubject, token = 'mind-1') {
        return subject.repository.startMindSession(subject.userId, {
          kind: 'meditation',
          practiceSlug: 'breath-awareness',
          localDate: DAY,
          timeZone: ZONE,
          startedAt: MIND_START,
          plannedMinutes: 10,
          clientToken: token,
        });
      }

      it('offers the secular practices to everyone', async () => {
        const { repository, userId } = await fresh();
        const practices = await repository.listMindPractices(userId, 'meditation');

        expect(practices.map((p) => p.slug)).toContain('breath-awareness');
        expect(practices.map((p) => p.slug)).toContain('loving-kindness');
      });

      it('hides an opt-in pack until it is chosen — the rule from SOURCE_MAP §5', async () => {
        const { repository, userId } = await fresh();
        const before = await repository.listMindPractices(userId, 'meditation');

        // Not greyed out, not listed as locked. Absent.
        expect(before.some((p) => p.contentPackSlug === 'jewish-meditation')).toBe(false);
      });

      it('shows the pack’s practices once the user chooses it', async () => {
        const { repository, userId } = await fresh();
        await repository.setPackChosen(userId, 'jewish-meditation', true);

        const after = await repository.listMindPractices(userId, 'meditation');
        expect(after.some((p) => p.contentPackSlug === 'jewish-meditation')).toBe(true);
      });

      it('hides them again when the pack is turned off', async () => {
        const { repository, userId } = await fresh();
        await repository.setPackChosen(userId, 'jewish-meditation', true);
        await repository.setPackChosen(userId, 'jewish-meditation', false);

        const after = await repository.listMindPractices(userId, 'meditation');
        expect(after.some((p) => p.contentPackSlug === 'jewish-meditation')).toBe(false);
      });

      it('refuses to start a practice from a pack that was never chosen', async () => {
        // The rule has to hold against a request that names the slug directly,
        // not only against a screen that declines to show it.
        const { repository, userId } = await fresh();

        await expect(
          repository.startMindSession(userId, {
            kind: 'meditation',
            practiceSlug: 'jm-week-3-shema',
            localDate: DAY,
            timeZone: ZONE,
            startedAt: MIND_START,
            plannedMinutes: 10,
            clientToken: 'sneaky',
          }),
        ).rejects.toThrow();
      });

      it('reports every pack as unchosen on a fresh account', async () => {
        const { repository, userId } = await fresh();
        const packs = await repository.listMindPacks(userId);

        expect(packs.length).toBeGreaterThan(0);
        expect(packs.every((pack) => !pack.chosen)).toBe(true);
      });

      it('marks the sensitive pack as one that must be chosen explicitly', async () => {
        const { repository, userId } = await fresh();
        const packs = await repository.listMindPacks(userId);
        const jewish = packs.find((pack) => pack.slug === 'jewish-meditation');

        expect(jewish?.requiresExplicitChoice).toBe(true);
      });

      it('restores a running session after a reload', async () => {
        const subject = await fresh();
        await startMeditation(subject);

        const restored = await subject.repository.getRunningMindSession(
          subject.userId,
          'meditation',
        );

        expect(restored?.practiceSlug).toBe('breath-awareness');
        expect(restored?.startedAt.toISOString()).toBe(MIND_START.toISOString());
      });

      it('refuses a second session of the same kind', async () => {
        const subject = await fresh();
        await startMeditation(subject);

        await expect(startMeditation(subject, 'mind-2')).rejects.toThrow();
      });

      it('returns the same session for a retried start', async () => {
        const subject = await fresh();
        const first = await startMeditation(subject, 'same');

        expect((await startMeditation(subject, 'same')).id).toBe(first.id);
      });

      it('allows a different kind to run at the same time', async () => {
        // Breathing before a focus block while a silent timer runs is sensible,
        // not a conflict.
        const subject = await fresh();
        await startMeditation(subject);

        await expect(
          subject.repository.startMindSession(subject.userId, {
            kind: 'breathwork',
            practiceSlug: 'box-breathing',
            localDate: DAY,
            timeZone: ZONE,
            startedAt: MIND_START,
            plannedRounds: 8,
            clientToken: 'breath-1',
          }),
        ).resolves.toBeDefined();
      });

      it('does not count paused time as practice', async () => {
        const subject = await fresh();
        await startMeditation(subject);

        await subject.repository.pauseMindSession(
          subject.userId,
          'meditation',
          new Date(MIND_START.getTime() + 120_000),
        );
        await subject.repository.resumeMindSession(
          subject.userId,
          'meditation',
          new Date(MIND_START.getTime() + 3_720_000),
        );
        const finished = await subject.repository.finishMindSession(subject.userId, {
          kind: 'meditation',
          at: new Date(MIND_START.getTime() + 3_780_000),
          status: 'completed',
        });

        // Two minutes before the pause, one after. Not sixty-three.
        expect(finished?.accumulatedSeconds).toBe(180);
      });

      it('keeps a rating and a reflection with the finished session', async () => {
        const subject = await fresh();
        await startMeditation(subject);

        const finished = await subject.repository.finishMindSession(subject.userId, {
          kind: 'meditation',
          at: new Date(MIND_START.getTime() + 600_000),
          status: 'completed',
          rating: 4,
          reflection: 'Quieter than last time.',
        });

        expect(finished?.rating).toBe(4);
        expect(finished?.reflection).toBe('Quieter than last time.');
      });

      it('records stopping early as abandoned rather than as nothing', async () => {
        const subject = await fresh();
        await startMeditation(subject);
        await subject.repository.finishMindSession(subject.userId, {
          kind: 'meditation',
          at: new Date(MIND_START.getTime() + 180_000),
          status: 'abandoned',
        });

        const history = await subject.repository.listMindHistory(subject.userId, {
          kind: 'meditation',
        });
        expect(history[0]?.status).toBe('abandoned');
      });

      it('keeps per-item detail for a drill without producing a score', async () => {
        const subject = await fresh();
        await subject.repository.startMindSession(subject.userId, {
          kind: 'cognitive',
          practiceSlug: 'mental-arithmetic',
          localDate: DAY,
          timeZone: ZONE,
          startedAt: MIND_START,
          clientToken: 'drill-1',
        });

        await subject.repository.finishMindSession(subject.userId, {
          kind: 'cognitive',
          at: new Date(MIND_START.getTime() + 300_000),
          status: 'completed',
          items: [
            { prompt: '2 + 2', answer: '4', given: '4', correct: true, responseMs: 900 },
            { prompt: '7 × 3', answer: '21', given: '18', correct: false, responseMs: 2000 },
            { prompt: '9 − 4', answer: '5', given: '5', correct: true, responseMs: 700 },
          ],
        });

        const history = await subject.repository.listMindHistory(subject.userId, {
          kind: 'cognitive',
        });
        expect(history[0]?.itemsAttempted).toBe(3);
        expect(history[0]?.itemsCorrect).toBe(2);
        // The median is over correct answers only, so a fast wrong one cannot
        // flatter it.
        expect(history[0]?.medianResponseMs).toBe(800);
      });

      it('has an empty history before anything is practised', async () => {
        const { repository, userId } = await fresh();
        expect(await repository.listMindHistory(userId)).toEqual([]);
      });

      it('returns null when there is nothing to finish', async () => {
        const { repository, userId } = await fresh();
        expect(
          await repository.finishMindSession(userId, {
            kind: 'breathwork',
            at: new Date(),
            status: 'completed',
          }),
        ).toBeNull();
      });
    });

    describe('train', () => {
      const SETUP = trainingSetupSchema.parse({
        goal: 'general',
        experience: 'consistent',
        equipment: ['dumbbells'],
        trainingWeekdays: [1, 3, 5],
        sessionMinutes: 35,
        painFlags: [{ region: 'knees', severity: 'mild' }],
      });
      const START = new Date('2026-03-16T07:00:00.000Z');

      function snapshot(): WorkoutSnapshot {
        const plan = generateTrainingPlan(SETUP, EXERCISES);
        return buildWorkout({
          session: plan.sessions[0]!,
          readiness: 'normal',
          minimumMode: false,
          history: [],
          library: EXERCISES,
          availability: {
            equipment: SETUP.equipment,
            excludedRegions: [],
            gentleRegions: [],
            avoid: [],
          },
        });
      }

      const primarySlug = (shot: WorkoutSnapshot) =>
        shot.items.find((item) => item.block === 'primary')!.exerciseSlug;

      it('has no setup until one is saved, then returns exactly what was saved', async () => {
        const { repository, userId } = await fresh();
        expect(await repository.getTrainingSetup(userId)).toBeNull();
        const saved = await repository.saveTrainingSetup(userId, SETUP, START);
        expect(saved).toEqual(SETUP);
        expect(await repository.getTrainingSetup(userId)).toEqual(SETUP);
      });

      it('keeps onboarding’s training answers in step with the setup', async () => {
        const { repository, userId } = await fresh();
        await repository.saveTrainingSetup(userId, { ...SETUP, sessionMinutes: 45 }, START);
        const { profile } = await repository.getOnboarding(userId);
        expect(profile.training.sessionMinutes).toBe(45);
        expect(profile.training.equipment).toEqual(['dumbbells']);
        expect(profile.training.experience).toBe('consistent');
      });

      it('starts a workout with its prescription, and a retry is the same workout', async () => {
        const { repository, userId } = await fresh();
        const shot = snapshot();
        const input = {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: shot,
          startedAt: START,
          clientToken: 'w-1',
        };
        const first = await repository.startWorkout(userId, input);
        const again = await repository.startWorkout(userId, input);
        expect(again.id).toBe(first.id);
        expect(first.status).toBe('running');
        expect(first.snapshot).toEqual(shot);
        expect((await repository.getRunningWorkout(userId))?.id).toBe(first.id);
      });

      it('refuses a second workout while one is running', async () => {
        const { repository, userId } = await fresh();
        const shot = snapshot();
        await repository.startWorkout(userId, {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: shot,
          startedAt: START,
          clientToken: 'w-1',
        });
        await expect(
          repository.startWorkout(userId, {
            localDate: DAY,
            timeZone: ZONE,
            snapshot: shot,
            startedAt: START,
            clientToken: 'w-2',
          }),
        ).rejects.toThrow(/already running/);
      });

      it('logs sets, and logging the same set again corrects it', async () => {
        const { repository, userId } = await fresh();
        const shot = snapshot();
        const workout = await repository.startWorkout(userId, {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: shot,
          startedAt: START,
          clientToken: 'w-1',
        });
        const slug = primarySlug(shot);
        const base = {
          workoutId: workout.id,
          exerciseSlug: slug,
          block: 'primary' as const,
          loadKg: 14,
          seconds: null,
          distanceM: null,
          completed: true,
          formOk: true,
          notes: null,
          substitutedFrom: null,
        };
        await repository.logWorkoutSet(userId, {
          ...base,
          setIndex: 1,
          reps: 10,
          rpe: 7,
          pain: 0,
          at: new Date(START.getTime() + 60_000),
        });
        await repository.logWorkoutSet(userId, {
          ...base,
          setIndex: 2,
          reps: 9,
          rpe: 8,
          pain: 0,
          at: new Date(START.getTime() + 180_000),
        });
        const corrected = await repository.logWorkoutSet(userId, {
          ...base,
          setIndex: 2,
          reps: 11,
          rpe: 7.5,
          pain: 1,
          at: new Date(START.getTime() + 200_000),
        });

        expect(corrected.sets).toHaveLength(2);
        const second = corrected.sets.find((set) => set.setIndex === 2)!;
        expect(second.reps).toBe(11);
        expect(second.rpe).toBe(7.5);
        expect(second.pain).toBe(1);
        expect(second.loadKg).toBe(14);
        expect(second.formOk).toBe(true);
      });

      it('refuses a set for an exercise that is not in the workout, or nonsense values', async () => {
        const { repository, userId } = await fresh();
        const workout = await repository.startWorkout(userId, {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: snapshot(),
          startedAt: START,
          clientToken: 'w-1',
        });
        const set = {
          workoutId: workout.id,
          block: 'primary' as const,
          setIndex: 1,
          reps: 10,
          loadKg: null,
          seconds: null,
          distanceM: null,
          rpe: 7,
          pain: 0,
          completed: true,
          formOk: null,
          notes: null,
          substitutedFrom: null,
          at: START,
        };
        await expect(
          repository.logWorkoutSet(userId, { ...set, exerciseSlug: 'pull-up' }),
        ).rejects.toThrow(/not part of this workout/);
        await expect(
          repository.logWorkoutSet(userId, {
            ...set,
            exerciseSlug: primarySlug(workout.snapshot),
            pain: 14,
          }),
        ).rejects.toThrow();
      });

      it('saves a substitution into the running workout', async () => {
        const { repository, userId } = await fresh();
        const shot = snapshot();
        const workout = await repository.startWorkout(userId, {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: shot,
          startedAt: START,
          clientToken: 'w-1',
        });
        const changed: WorkoutSnapshot = {
          ...shot,
          items: shot.items.map((item, index) =>
            index === 0
              ? { ...item, exerciseSlug: 'arm-circles', substitutedFrom: item.exerciseSlug }
              : item,
          ),
        };
        const updated = await repository.updateWorkoutSnapshot(userId, workout.id, changed);
        expect(updated.snapshot.items[0]?.exerciseSlug).toBe('arm-circles');
        expect(
          (await repository.getRunningWorkout(userId))?.snapshot.items[0]?.substitutedFrom,
        ).toBe(shot.items[0]?.exerciseSlug);
      });

      it('finishes once, keeps the notes, and refuses sets afterwards', async () => {
        const { repository, userId } = await fresh();
        const shot = snapshot();
        const workout = await repository.startWorkout(userId, {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: shot,
          startedAt: START,
          clientToken: 'w-1',
        });
        const end = new Date(START.getTime() + 30 * 60_000);
        const done = await repository.finishWorkout(userId, {
          workoutId: workout.id,
          status: 'completed',
          at: end,
          notes: 'Felt strong.',
        });
        const twice = await repository.finishWorkout(userId, {
          workoutId: workout.id,
          status: 'abandoned',
          at: new Date(),
          notes: null,
        });

        expect(done.status).toBe('completed');
        expect(done.endedAt).toBe(end.toISOString());
        expect(twice.status).toBe('completed');
        expect(twice.notes).toBe('Felt strong.');
        expect(await repository.getRunningWorkout(userId)).toBeNull();
        await expect(
          repository.logWorkoutSet(userId, {
            workoutId: workout.id,
            exerciseSlug: primarySlug(shot),
            block: 'primary',
            setIndex: 1,
            reps: 8,
            loadKg: null,
            seconds: null,
            distanceM: null,
            rpe: 7,
            pain: 0,
            completed: true,
            formOk: null,
            notes: null,
            substitutedFrom: null,
            at: end,
          }),
        ).rejects.toThrow(/already finished/);
      });

      it('lists workouts most recent first, with their sets', async () => {
        const { repository, userId } = await fresh();
        const shot = snapshot();
        const first = await repository.startWorkout(userId, {
          localDate: '2026-03-09',
          timeZone: ZONE,
          snapshot: shot,
          startedAt: new Date('2026-03-09T07:00:00Z'),
          clientToken: 'w-1',
        });
        await repository.logWorkoutSet(userId, {
          workoutId: first.id,
          exerciseSlug: primarySlug(shot),
          block: 'primary',
          setIndex: 1,
          reps: 12,
          loadKg: 16,
          seconds: null,
          distanceM: null,
          rpe: 7,
          pain: 0,
          completed: true,
          formOk: true,
          notes: null,
          substitutedFrom: null,
          at: new Date('2026-03-09T07:05:00Z'),
        });
        await repository.finishWorkout(userId, {
          workoutId: first.id,
          status: 'completed',
          at: new Date('2026-03-09T07:40:00Z'),
          notes: null,
        });
        const second = await repository.startWorkout(userId, {
          localDate: DAY,
          timeZone: ZONE,
          snapshot: shot,
          startedAt: START,
          clientToken: 'w-2',
        });

        const list = await repository.listWorkouts(userId);
        expect(list.map((workout) => workout.id)).toEqual([second.id, first.id]);
        expect(list[1]?.sets[0]?.loadKg).toBe(16);
        expect(list[1]?.localDate).toBe('2026-03-09');
        expect(await repository.getWorkout(userId, first.id)).not.toBeNull();
        expect(
          await repository.getWorkout(userId, '00000000-0000-4000-8000-00000000ffff'),
        ).toBeNull();
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
