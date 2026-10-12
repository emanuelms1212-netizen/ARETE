import {
  finishMindPatch,
  pauseMindPatch,
  practisedSeconds,
  resumeMindPatch,
  scoreItems,
  type Drill,
  type MindKind,
  type MindSession,
} from '@/domain';
import { ALL_PRACTICES, MIND_PACKS } from '@/content/mind/practices';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type FinishMindInput,
  type MindHistoryEntry,
  type MindPack,
  type MindPractice,
  type StartMindInput,
} from '../repository';

/**
 * Mind, in memory.
 *
 * The filtering in `listMindPractices` is the part that matters: a practice
 * belonging to a pack is invisible until the user has chosen that pack. The
 * SQL adapter does the same thing in SQL, and the contract suite checks both,
 * because this is the rule from SOURCE_MAP §5 and it is not the sort of rule
 * that should depend on a screen remembering it.
 */
interface StoredSession extends MindSession {
  readonly localDate: string;
  readonly drill: string | null;
  readonly itemsAttempted: number | null;
  readonly itemsCorrect: number | null;
  readonly medianResponseMs: number | null;
  readonly plannedRounds: number | null;
  readonly rounds: number | null;
}

export function createMemoryMind() {
  let sequence = 0;
  const chosenPacks = new Map<string, Set<string>>();
  const sessions = new Map<string, StoredSession[]>();
  const tokens = new Map<string, string>();

  function packsFor(userId: string): Set<string> {
    let found = chosenPacks.get(userId);
    if (!found) {
      found = new Set<string>();
      chosenPacks.set(userId, found);
    }
    return found;
  }

  function historyFor(userId: string): StoredSession[] {
    let found = sessions.get(userId);
    if (!found) {
      found = [];
      sessions.set(userId, found);
    }
    return found;
  }

  function running(userId: string, kind: MindKind): StoredSession | null {
    return historyFor(userId).find((s) => s.kind === kind && s.status === 'running') ?? null;
  }

  function replace(userId: string, updated: StoredSession): StoredSession {
    const list = historyFor(userId);
    const index = list.findIndex((s) => s.id === updated.id);
    if (index >= 0) list[index] = updated;
    return updated;
  }

  function packs(userId: string): MindPack[] {
    const chosen = packsFor(userId);
    return MIND_PACKS.map((pack) => ({ ...pack, chosen: chosen.has(pack.slug) }));
  }

  return {
    async listMindPractices(userId: string, kind?: MindKind): Promise<readonly MindPractice[]> {
      const chosen = packsFor(userId);
      return ALL_PRACTICES.filter(
        (practice) =>
          (kind === undefined || practice.kind === kind) &&
          // The enforcement point. A packed practice does not exist for a user
          // who has not opted in — it is not greyed out, it is simply absent.
          (practice.contentPackSlug === null || chosen.has(practice.contentPackSlug)),
      );
    },

    async listMindPacks(userId: string): Promise<readonly MindPack[]> {
      return packs(userId);
    },

    async setPackChosen(userId: string, packSlug: string, chosen: boolean) {
      if (!MIND_PACKS.some((pack) => pack.slug === packSlug)) {
        throw new RecordNotFoundError(`No pack ${packSlug}`);
      }
      const set = packsFor(userId);
      if (chosen) set.add(packSlug);
      else set.delete(packSlug);
      return packs(userId);
    },

    async startMindSession(userId: string, input: StartMindInput): Promise<MindSession> {
      const seen = tokens.get(`${userId}::${input.clientToken}`);
      if (seen !== undefined) {
        const existing = historyFor(userId).find((s) => s.id === seen);
        if (existing !== undefined) return existing;
      }

      if (running(userId, input.kind) !== null) {
        throw new InvalidWriteError(`A ${input.kind} session is already running.`);
      }

      const practice = ALL_PRACTICES.find((p) => p.slug === input.practiceSlug);
      if (practice === undefined) {
        throw new RecordNotFoundError(`No practice ${input.practiceSlug}`);
      }
      // A practice from an unchosen pack cannot be started either, not just
      // hidden. Otherwise the rule is only as strong as the UI.
      if (practice.contentPackSlug !== null && !packsFor(userId).has(practice.contentPackSlug)) {
        throw new InvalidWriteError(
          `“${practice.title}” belongs to a pack this account has not chosen.`,
        );
      }

      const session: StoredSession = {
        id: `mind-${(sequence += 1)}`,
        kind: input.kind,
        practiceSlug: input.practiceSlug,
        status: 'running',
        startedAt: input.startedAt,
        endedAt: null,
        pausedAt: null,
        accumulatedSeconds: 0,
        plannedMinutes: input.plannedMinutes ?? null,
        rating: null,
        reflection: null,
        localDate: input.localDate,
        drill: practice.drill,
        itemsAttempted: null,
        itemsCorrect: null,
        medianResponseMs: null,
        plannedRounds: input.plannedRounds ?? null,
        rounds: null,
      };

      historyFor(userId).push(session);
      tokens.set(`${userId}::${input.clientToken}`, session.id);
      return session;
    },

    async getRunningMindSession(userId: string, kind: MindKind): Promise<MindSession | null> {
      return running(userId, kind);
    },

    async pauseMindSession(userId: string, kind: MindKind, at: Date): Promise<MindSession> {
      const session = running(userId, kind);
      if (session === null) throw new RecordNotFoundError(`No ${kind} session is running.`);
      if (session.pausedAt !== null) return session;
      return replace(userId, { ...session, ...pauseMindPatch(session, at) });
    },

    async resumeMindSession(userId: string, kind: MindKind, at: Date): Promise<MindSession> {
      const session = running(userId, kind);
      if (session === null) throw new RecordNotFoundError(`No ${kind} session is running.`);
      if (session.pausedAt === null) return session;
      return replace(userId, { ...session, ...resumeMindPatch(at) });
    },

    async finishMindSession(userId: string, input: FinishMindInput): Promise<MindSession | null> {
      const session = running(userId, input.kind);
      if (session === null) return null;

      const scored =
        input.items === undefined || session.drill === null
          ? null
          : scoreItems(session.drill as Drill, input.items);

      return replace(userId, {
        ...session,
        ...finishMindPatch(session, input.at, input.status),
        rating: input.rating ?? null,
        reflection: input.reflection ?? null,
        rounds: input.rounds ?? null,
        itemsAttempted: scored?.itemsAttempted ?? null,
        itemsCorrect: scored?.itemsCorrect ?? null,
        medianResponseMs: scored?.medianResponseMs ?? null,
      });
    },

    async listMindHistory(
      userId: string,
      options?: { kind?: MindKind; limit?: number },
    ): Promise<readonly MindHistoryEntry[]> {
      return historyFor(userId)
        .filter((s) => s.status !== 'running')
        .filter((s) => options?.kind === undefined || s.kind === options.kind)
        .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))
        .slice(0, options?.limit ?? 50)
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          practiceSlug: s.practiceSlug,
          localDate: s.localDate,
          minutes: Math.round((practisedSeconds(s, s.endedAt ?? new Date()) / 60) * 10) / 10,
          status: s.status === 'abandoned' ? ('abandoned' as const) : ('completed' as const),
          rating: s.rating,
          reflection: s.reflection,
          drill: s.drill,
          itemsAttempted: s.itemsAttempted,
          itemsCorrect: s.itemsCorrect,
          medianResponseMs: s.medianResponseMs,
        }));
    },
  };
}
