import type { Commitment, Day, DayMark, IsoDate } from '@/domain';
import { demoDays } from './demo-data';
import {
  RecordNotFoundError,
  type AccountExport,
  type AreteRepository,
  type FocusSession,
  type RecordFocusSessionInput,
  type SetCommitmentStatusInput,
  type UpsertDayInput,
} from './repository';

interface MemoryState {
  days: Map<string, Day>;
  focus: Map<string, FocusSession>;
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
): AreteRepository {
  const state: MemoryState = { days: new Map(), focus: new Map() };

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

  return {
    kind: 'memory',

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
