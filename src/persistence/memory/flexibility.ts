import { FLEX_PROGRAMS, flexProgram } from '@/content/flexibility/hamstring';
import {
  checkinSchema,
  flexItemSchema,
  flexWeekdaysSchema,
  isProgramOffered,
  sessionKey,
  templateFor,
  type Checkin,
  type FlexEnrolment,
  type FlexItemRecord,
  type FlexSessionRecord,
  type StoredCheckin,
  type WarmupChoice,
} from '@/domain';
import { InvalidWriteError, RecordNotFoundError, type FlexProgramListing } from '../repository';

/**
 * Flexibility, in memory.
 *
 * The same rules as the SQL adapter, held to the same contract suite: a
 * programme whose rights are pending is offered only when the caller allows
 * it, one active enrolment per programme, one running session per person, a
 * slot closes once, a stop is always pain, and a skip always has a reason.
 */
interface UserState {
  enrolments: FlexEnrolment[];
  sessions: FlexSessionRecord[];
  checkins: Map<string, { enrolmentId: string; checkin: StoredCheckin }>;
  tokens: Map<string, string>;
}

export function createMemoryFlexibility() {
  let sequence = 0;
  const users = new Map<string, UserState>();

  function state(userId: string): UserState {
    let found = users.get(userId);
    if (!found) {
      found = { enrolments: [], sessions: [], checkins: new Map(), tokens: new Map() };
      users.set(userId, found);
    }
    return found;
  }

  function enrolment(userId: string, enrolmentId: string): FlexEnrolment {
    const found = state(userId).enrolments.find((entry) => entry.id === enrolmentId);
    if (!found) throw new RecordNotFoundError('No such enrolment for this account.');
    return found;
  }

  function replaceEnrolment(userId: string, next: FlexEnrolment): FlexEnrolment {
    const list = state(userId).enrolments;
    list[list.findIndex((entry) => entry.id === next.id)] = next;
    return structuredClone(next);
  }

  function session(userId: string, sessionId: string): FlexSessionRecord {
    const found = state(userId).sessions.find((entry) => entry.id === sessionId);
    if (!found) throw new RecordNotFoundError('No such session for this account.');
    return found;
  }

  function replaceSession(userId: string, next: FlexSessionRecord): FlexSessionRecord {
    const list = state(userId).sessions;
    list[list.findIndex((entry) => entry.id === next.id)] = next;
    return structuredClone(next);
  }

  function requireOpenSlot(userId: string, current: FlexEnrolment, week: number, day: number) {
    if (current.status !== 'active')
      throw new InvalidWriteError('That programme is no longer active.');
    const program = flexProgram(current.programSlug);
    if (!program || !templateFor(program, week, day)) {
      throw new InvalidWriteError(
        `There is no session ${sessionKey(week, day)} in this programme.`,
      );
    }
    const closed = state(userId).sessions.some(
      (entry) =>
        entry.enrolmentId === current.id &&
        entry.week === week &&
        entry.day === day &&
        (entry.status === 'completed' || entry.status === 'skipped'),
    );
    if (closed) throw new InvalidWriteError('That session is already done.');
  }

  return {
    async listFlexPrograms(_userId: string, options: { readonly includeRightsPending: boolean }) {
      return FLEX_PROGRAMS.filter((program) =>
        isProgramOffered(program.rightsStatus, options.includeRightsPending),
      ).map((program): FlexProgramListing => ({ program, rightsStatus: program.rightsStatus }));
    },

    async getActiveEnrolment(userId: string, programSlug: string) {
      const found = state(userId).enrolments.find(
        (entry) => entry.programSlug === programSlug && entry.status === 'active',
      );
      return found ? structuredClone(found) : null;
    },

    async enrolFlex(
      userId: string,
      input: {
        programSlug: string;
        startedOn: string;
        weekdays: readonly number[];
        at: Date;
        includeRightsPending: boolean;
      },
    ) {
      const program = flexProgram(input.programSlug);
      if (!program) throw new InvalidWriteError('Unknown programme.');
      const allowed = isProgramOffered(program.rightsStatus, input.includeRightsPending);
      if (!allowed) throw new InvalidWriteError('That programme is not available yet.');
      const weekdays = flexWeekdaysSchema.parse([...input.weekdays]);

      const mine = state(userId);
      mine.enrolments = mine.enrolments.map((entry) =>
        entry.programSlug === program.slug && entry.status === 'active'
          ? { ...entry, status: 'ended', endedAt: input.at.toISOString() }
          : entry,
      );
      sequence += 1;
      const created: FlexEnrolment = {
        id: `flex-enrolment-${sequence}`,
        programSlug: program.slug,
        startedOn: input.startedOn,
        weekdays,
        status: 'active',
        endedAt: null,
      };
      mine.enrolments.push(created);
      return structuredClone(created);
    },

    async setFlexSchedule(userId: string, enrolmentId: string, weekdays: readonly number[]) {
      const current = enrolment(userId, enrolmentId);
      return replaceEnrolment(userId, {
        ...current,
        weekdays: flexWeekdaysSchema.parse([...weekdays]),
      });
    },

    async endFlexEnrolment(
      userId: string,
      enrolmentId: string,
      status: 'completed' | 'ended',
      at: Date,
    ) {
      const current = enrolment(userId, enrolmentId);
      if (current.status !== 'active') return structuredClone(current);
      return replaceEnrolment(userId, { ...current, status, endedAt: at.toISOString() });
    },

    async listFlexSessionsBetween(userId: string, range: { from: string; to: string }) {
      return state(userId)
        .sessions.filter((entry) => entry.localDate >= range.from && entry.localDate <= range.to)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((entry) => structuredClone(entry));
    },

    async listFlexSessions(userId: string, enrolmentId: string) {
      return state(userId)
        .sessions.filter((entry) => entry.enrolmentId === enrolmentId)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((entry) => structuredClone(entry));
    },

    async getRunningFlexSession(userId: string) {
      const found = state(userId).sessions.find((entry) => entry.status === 'running');
      return found ? structuredClone(found) : null;
    },

    async startFlexSession(
      userId: string,
      input: {
        enrolmentId: string;
        week: number;
        day: number;
        localDate: string;
        timeZone: string;
        startedAt: Date;
        clientToken: string;
      },
    ) {
      const mine = state(userId);
      const seen = mine.tokens.get(input.clientToken);
      if (seen) return structuredClone(session(userId, seen));

      const current = enrolment(userId, input.enrolmentId);
      requireOpenSlot(userId, current, input.week, input.day);
      if (mine.sessions.some((entry) => entry.status === 'running')) {
        throw new InvalidWriteError('A flexibility session is already running.');
      }

      sequence += 1;
      const created: FlexSessionRecord = {
        id: `flex-session-${sequence}`,
        enrolmentId: current.id,
        week: input.week,
        day: input.day,
        localDate: input.localDate,
        status: 'running',
        startedAt: input.startedAt.toISOString(),
        endedAt: null,
        warmup: null,
        items: [],
        notes: null,
        painReported: false,
        painNote: null,
        skipReason: null,
      };
      mine.sessions.push(created);
      mine.tokens.set(input.clientToken, created.id);
      return structuredClone(created);
    },

    async updateFlexSession(
      userId: string,
      sessionId: string,
      patch: { warmup?: WarmupChoice; items?: readonly FlexItemRecord[]; notes?: string | null },
    ) {
      const current = session(userId, sessionId);
      if (current.status !== 'running')
        throw new InvalidWriteError('That session has already finished.');
      const items =
        patch.items === undefined
          ? current.items
          : patch.items.map((item) => flexItemSchema.parse(item));
      const notes = patch.notes === undefined ? current.notes : patch.notes?.trim() || null;
      if (notes !== null && notes.length > 1000)
        throw new InvalidWriteError('Notes are limited to 1000 characters.');
      return replaceSession(userId, {
        ...current,
        warmup: patch.warmup ?? current.warmup,
        items,
        notes,
      });
    },

    async finishFlexSession(
      userId: string,
      input: {
        sessionId: string;
        status: 'completed' | 'stopped';
        at: Date;
        painNote?: string | null;
        notes?: string | null;
      },
    ) {
      const current = session(userId, input.sessionId);
      if (current.status !== 'running') return structuredClone(current);
      return replaceSession(userId, {
        ...current,
        status: input.status,
        endedAt: input.at.toISOString(),
        painReported: input.status === 'stopped',
        painNote: input.painNote?.trim() || null,
        notes: input.notes === undefined ? current.notes : input.notes?.trim() || null,
      });
    },

    async skipFlexSession(
      userId: string,
      input: {
        enrolmentId: string;
        week: number;
        day: number;
        localDate: string;
        timeZone: string;
        reason: string;
        at: Date;
      },
    ) {
      const reason = input.reason.trim();
      if (reason.length === 0) throw new InvalidWriteError('A skip needs a reason.');
      const current = enrolment(userId, input.enrolmentId);
      requireOpenSlot(userId, current, input.week, input.day);
      sequence += 1;
      const created: FlexSessionRecord = {
        id: `flex-session-${sequence}`,
        enrolmentId: current.id,
        week: input.week,
        day: input.day,
        localDate: input.localDate,
        status: 'skipped',
        startedAt: input.at.toISOString(),
        endedAt: input.at.toISOString(),
        warmup: null,
        items: [],
        notes: null,
        painReported: false,
        painNote: null,
        skipReason: reason,
      };
      state(userId).sessions.push(created);
      return structuredClone(created);
    },

    async saveFlexCheckin(
      userId: string,
      input: { enrolmentId: string; localDate: string; checkin: Checkin },
    ) {
      enrolment(userId, input.enrolmentId);
      const parsed = checkinSchema.parse(input.checkin);
      const stored: StoredCheckin = { ...parsed, localDate: input.localDate };
      state(userId).checkins.set(`${input.enrolmentId}::${parsed.week}`, {
        enrolmentId: input.enrolmentId,
        checkin: stored,
      });
      return structuredClone(stored);
    },

    async listFlexCheckins(userId: string, enrolmentId: string) {
      return [...state(userId).checkins.values()]
        .filter((entry) => entry.enrolmentId === enrolmentId)
        .map((entry) => structuredClone(entry.checkin))
        .sort((a, b) => a.week - b.week);
    },

    exportFlexibility(userId: string) {
      const mine = state(userId);
      return {
        flexibility_enrolments: mine.enrolments.map(
          (entry) => structuredClone(entry) as unknown as Record<string, unknown>,
        ),
        flexibility_sessions: mine.sessions.map(
          (entry) => structuredClone(entry) as unknown as Record<string, unknown>,
        ),
        flexibility_checkins: [...mine.checkins.values()].map(
          (entry) =>
            ({ enrolmentId: entry.enrolmentId, ...structuredClone(entry.checkin) }) as Record<
              string,
              unknown
            >,
        ),
      };
    },

    deleteFlexibility(userId: string) {
      users.delete(userId);
    },
  };
}
