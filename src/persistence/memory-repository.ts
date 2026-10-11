import {
  ONBOARDING_STEPS,
  onboardingProfileSchema,
  parseStepAnswers,
  type AnswerableStep,
  type Commitment,
  type Day,
  type DayMark,
  type DraftWeek,
  type IsoDate,
  type OnboardingProgress,
  type OnboardingStep,
} from '@/domain';
import { demoDays, demoSeed, type DemoSeed } from './demo-data';
import { createMemoryDailySystem } from './memory/daily-system';
import {
  RecordNotFoundError,
  type AccountExport,
  type AreteRepository,
  type FocusSession,
  type RecordFocusSessionInput,
  type SetCommitmentStatusInput,
  type UpsertDayInput,
} from './repository';

interface OnboardingRecord {
  answers: Record<string, unknown>;
  progress: OnboardingProgress;
}

interface MemoryState {
  days: Map<string, Day>;
  focus: Map<string, FocusSession>;
  onboarding: Map<string, OnboardingRecord>;
  drafts: Map<string, { id: string; userId: string; draft: DraftWeek; acceptedAt: string | null }>;
}

function key(userId: string, localDate: IsoDate): string {
  return `${userId}::${localDate}`;
}

/**
 * The demo-mode repository.
 *
 * It implements the same contract as the SQL one, including writes, so that
 * demo mode exercises the real domain behaviour rather than a cut-down version
 * of it. What it does not do is pretend to be durable: everything lives in the
 * server process, and the UI says so. That is the honest version of a demo —
 * the dishonest version is a store that looks permanent and empties on deploy.
 *
 * Deterministic: the same seed every time, so screenshots and tests agree.
 */
export function createMemoryRepository(
  seedUserId: string,
  seed: readonly Day[] = demoDays,
  /**
   * Goals, tasks and habits for the seeded account. `null` is an empty
   * account — what the contract suite asks for, mirroring the empty `seed`
   * it already passes for days.
   */
  planSeed: DemoSeed | null = demoSeed,
): AreteRepository {
  const state: MemoryState = {
    days: new Map(),
    focus: new Map(),
    onboarding: new Map(),
    drafts: new Map(),
  };

  for (const day of seed) {
    state.days.set(key(seedUserId, day.date), structuredClone(day) as Day);
  }

  function requireDay(userId: string, localDate: IsoDate): Day {
    const day = state.days.get(key(userId, localDate));
    if (!day) throw new RecordNotFoundError(`No day ${localDate} for this account`);
    return day;
  }

  function save(userId: string, day: Day): Day {
    state.days.set(key(userId, day.date), day);
    return structuredClone(day) as Day;
  }

  function emptyDay(localDate: IsoDate): Day {
    return { date: localDate, mark: 'normal', committedAt: null, commitments: [] };
  }

  // Goals, tasks, habits, the day's framing and the live timer. Kept in their
  // own module because the day loop added five entities at once.
  const daily = createMemoryDailySystem({
    getDay: (userId, localDate) => state.days.get(key(userId, localDate)),
    requireDay,
    saveDay: save,
    emptyDay,
  });

  // The demo account gets goals, tasks and habits too, so the Plan screen
  // shows the states the design has to survive rather than three empty ones.
  if (planSeed !== null) daily.seed(seedUserId, planSeed);

  function onboardingFor(userId: string): OnboardingRecord {
    let record = state.onboarding.get(userId);
    if (!record) {
      record = {
        answers: {},
        progress: {
          currentStep: 'intent',
          completedSteps: [],
          skippedSteps: [],
          completedAt: null,
        },
      };
      state.onboarding.set(userId, record);
    }
    return record;
  }

  function onboardingState(userId: string) {
    const record = onboardingFor(userId);
    return {
      progress: { ...record.progress },
      profile: onboardingProfileSchema.parse(record.answers),
    };
  }

  function advance(record: OnboardingRecord, step: OnboardingStep, skipped: boolean): void {
    const completed = new Set(record.progress.completedSteps);
    const skippedSet = new Set(record.progress.skippedSteps);
    if (skipped) {
      skippedSet.add(step);
      completed.delete(step);
    } else {
      completed.add(step);
      skippedSet.delete(step);
    }

    const index = ONBOARDING_STEPS.indexOf(step);
    const next = ONBOARDING_STEPS[index + 1] ?? 'review';

    record.progress = {
      ...record.progress,
      currentStep: next,
      completedSteps: [...completed],
      skippedSteps: [...skippedSet],
    };
  }

  return {
    kind: 'memory',
    ...daily,

    async getOnboarding(userId: string) {
      return onboardingState(userId);
    },

    async saveStep(userId: string, step: AnswerableStep, answers: unknown) {
      const record = onboardingFor(userId);
      record.answers = { ...record.answers, [step]: parseStepAnswers(step, answers) };
      advance(record, step, false);
      return onboardingState(userId);
    },

    async skipStep(userId: string, step: OnboardingStep) {
      const record = onboardingFor(userId);
      advance(record, step, true);
      return onboardingState(userId);
    },

    async saveDraftWeek(userId: string, draft: DraftWeek) {
      const id = `draft-${state.drafts.size + 1}`;
      state.drafts.set(id, { id, userId, draft, acceptedAt: null });
      return id;
    },

    async getLatestDraft(userId: string) {
      const mine = [...state.drafts.values()].filter((entry) => entry.userId === userId);
      const latest = mine[mine.length - 1];
      return latest ? { id: latest.id, draft: latest.draft } : null;
    },

    async acceptDraft(userId: string, draftId: string, at: Date) {
      const entry = state.drafts.get(draftId);
      if (!entry || entry.userId !== userId) {
        throw new RecordNotFoundError(`No draft ${draftId} for this account`);
      }

      for (const day of entry.draft.days) {
        const commitments: Commitment[] = day.items.map((item, index) => ({
          id: `${day.date}-${index + 1}`,
          kind: item.kind,
          title: item.title,
          isMinimum: item.isMinimum,
          status: 'pending',
        }));
        state.days.set(key(userId, day.date), {
          date: day.date,
          mark: 'normal',
          committedAt: null,
          commitments,
        });
      }

      entry.acceptedAt = at.toISOString();
      const record = onboardingFor(userId);
      record.progress = {
        ...record.progress,
        currentStep: 'review',
        completedAt: at.toISOString(),
      };
    },

    async getTimeZone() {
      // The demo account lives in one place, so screenshots are reproducible.
      return 'Europe/London';
    },

    async getDay(userId, localDate) {
      const day = state.days.get(key(userId, localDate));
      return day ? (structuredClone(day) as Day) : null;
    },

    async listDays(userId, range) {
      return [...state.days.entries()]
        .filter(([mapKey]) => mapKey.startsWith(`${userId}::`))
        .map(([, day]) => day)
        .filter((day) => day.date >= range.from && day.date <= range.to)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((day) => structuredClone(day) as Day);
    },

    async upsertDay(userId, input: UpsertDayInput) {
      const existing = state.days.get(key(userId, input.localDate));

      const commitments: Commitment[] = input.commitments.map((commitment, index) => {
        const previous = existing?.commitments.find(
          (candidate) => candidate.title === commitment.title && candidate.kind === commitment.kind,
        );
        return {
          id: previous?.id ?? `${input.localDate}-${index + 1}`,
          kind: commitment.kind,
          title: commitment.title,
          isMinimum: commitment.isMinimum ?? false,
          status: previous?.status ?? 'pending',
          ...(previous?.skipReason === undefined ? {} : { skipReason: previous.skipReason }),
        };
      });

      return save(userId, {
        date: input.localDate,
        mark: existing?.mark ?? 'normal',
        committedAt: existing?.committedAt ?? null,
        commitments,
      });
    },

    async commitDay(userId, localDate, at) {
      const day = requireDay(userId, localDate);
      return save(userId, { ...day, committedAt: at.toISOString() });
    },

    async markDay(userId, localDate, mark: DayMark) {
      const day = requireDay(userId, localDate);
      return save(userId, { ...day, mark });
    },

    async setCommitmentStatus(userId, input: SetCommitmentStatusInput) {
      const day = requireDay(userId, input.localDate);
      const target = day.commitments.find((commitment) => commitment.id === input.commitmentId);
      if (!target) throw new RecordNotFoundError(`No commitment ${input.commitmentId}`);

      if (input.status === 'skipped' && !input.skipReason) {
        throw new Error(
          'A skipped commitment needs a reason — that is what makes it not a failure',
        );
      }

      const commitments = day.commitments.map((commitment) =>
        commitment.id === input.commitmentId
          ? ({
              ...commitment,
              status: input.status,
              ...(input.skipReason === undefined ? {} : { skipReason: input.skipReason }),
            } satisfies Commitment)
          : commitment,
      );

      return save(userId, { ...day, commitments });
    },

    async recordFocusSession(userId, input: RecordFocusSessionInput) {
      const tokenKey = `${userId}::${input.clientToken}`;
      const existing = state.focus.get(tokenKey);
      if (existing) return existing;

      const session: FocusSession = {
        id: `focus-${state.focus.size + 1}`,
        localDate: input.localDate,
        plannedMinutes: input.plannedMinutes,
        actualSeconds: input.actualSeconds,
        interruptions: input.interruptions ?? 0,
        status: input.status,
        clientToken: input.clientToken,
      };
      state.focus.set(tokenKey, session);
      return session;
    },

    async listFocusSessions(userId, localDate) {
      return [...state.focus.entries()]
        .filter(([mapKey]) => mapKey.startsWith(`${userId}::`))
        .map(([, session]) => session)
        .filter((session) => session.localDate === localDate);
    },

    async exportEverything(userId): Promise<AccountExport> {
      const days = [...state.days.entries()]
        .filter(([mapKey]) => mapKey.startsWith(`${userId}::`))
        .map(([, day]) => day as unknown as Record<string, unknown>);
      const focus = [...state.focus.entries()]
        .filter(([mapKey]) => mapKey.startsWith(`${userId}::`))
        .map(([, session]) => session as unknown as Record<string, unknown>);

      return {
        exportedAt: new Date(0).toISOString(),
        schemaVersion: 10,
        profile: { id: userId, mode: 'demo' },
        tables: { daily_plans: days, focus_sessions: focus },
      };
    },

    async deleteEverything(userId) {
      for (const mapKey of [...state.days.keys()]) {
        if (mapKey.startsWith(`${userId}::`)) state.days.delete(mapKey);
      }
      for (const mapKey of [...state.focus.keys()]) {
        if (mapKey.startsWith(`${userId}::`)) state.focus.delete(mapKey);
      }
    },
  };
}
