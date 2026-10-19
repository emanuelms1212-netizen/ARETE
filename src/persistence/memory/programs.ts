import {
  WEEKLY_PROMPTS,
  addDays,
  breakProblem,
  contrastScreeningSchema,
  resetCustomisationSchema,
  type ContrastScreening,
  type ContrastSessionRecord,
  type IsoDate,
  type ResetBreak,
  type ResetCheckin,
  type ResetComponent,
  type ResetCustomisation,
  type ResetLog,
  type WeeklyPromptKey,
} from '@/domain';
import {
  InvalidWriteError,
  RecordNotFoundError,
  type DayFraming,
  type DayReview,
  type JournalDay,
  type ResetEnrolment,
} from '../repository';

/**
 * Programmes and reflection, in memory: the reset, its breaks, logs and
 * check-ins; the weekly review; contrast-therapy screening and sessions. The
 * same rules as the SQL adapter, held to the same contract suite.
 */
interface StoredEnrolment {
  id: string;
  startedOn: IsoDate;
  timeZone: string;
  customisation: ResetCustomisation;
  status: ResetEnrolment['status'];
  breaks: ResetBreak[];
  createdSeq: number;
}

interface UserState {
  enrolments: StoredEnrolment[];
  logs: (ResetLog & { enrolmentId: string })[];
  checkins: (ResetCheckin & { enrolmentId: string })[];
  weekly: Map<IsoDate, Partial<Record<WeeklyPromptKey, string>>>;
  screening: ContrastScreening | null;
  acknowledgements: Map<string, string>;
  contrast: ContrastSessionRecord[];
  contrastTokens: Map<string, string>;
}

const isEmptyFraming = (framing: DayFraming) =>
  !framing.intention &&
  !framing.inMyControl &&
  !framing.notMyControl &&
  !framing.virtue &&
  !framing.obstacle;

const isEmptyReview = (review: DayReview | null) =>
  !review || (!review.wentWell && !review.friction && !review.tomorrowOneThing && !review.learned);

export function createMemoryPrograms(hooks: {
  readonly readDay: (
    userId: string,
    localDate: IsoDate,
  ) => Promise<{ framing: DayFraming; review: DayReview | null }>;
}) {
  let sequence = 0;
  const next = (prefix: string) => `${prefix}-${(sequence += 1)}`;
  const users = new Map<string, UserState>();

  function state(userId: string): UserState {
    let found = users.get(userId);
    if (!found) {
      found = {
        enrolments: [],
        logs: [],
        checkins: [],
        weekly: new Map(),
        screening: null,
        acknowledgements: new Map(),
        contrast: [],
        contrastTokens: new Map(),
      };
      users.set(userId, found);
    }
    return found;
  }

  const view = (enrolment: StoredEnrolment): ResetEnrolment =>
    structuredClone({
      id: enrolment.id,
      startedOn: enrolment.startedOn,
      timeZone: enrolment.timeZone,
      customisation: enrolment.customisation,
      status: enrolment.status,
      breaks: [...enrolment.breaks].sort((a, b) => a.from.localeCompare(b.from)),
    });

  function enrolmentOf(userId: string, enrolmentId: string): StoredEnrolment {
    const found = state(userId).enrolments.find((entry) => entry.id === enrolmentId);
    if (!found) throw new RecordNotFoundError('No such programme for this account');
    return found;
  }

  function activeOf(userId: string, enrolmentId: string): StoredEnrolment {
    const found = enrolmentOf(userId, enrolmentId);
    if (found.status !== 'active') throw new InvalidWriteError('That programme has ended.');
    return found;
  }

  return {
    async getActiveReset(userId: string) {
      const found = state(userId).enrolments.find((entry) => entry.status === 'active');
      return found ? view(found) : null;
    },

    async getLastReset(userId: string) {
      const ended = state(userId)
        .enrolments.filter((entry) => entry.status !== 'active')
        .sort((a, b) => b.createdSeq - a.createdSeq);
      return ended[0] ? view(ended[0]) : null;
    },

    async startReset(
      userId: string,
      input: { startedOn: IsoDate; timeZone: string; customisation: ResetCustomisation },
    ) {
      if (state(userId).enrolments.some((entry) => entry.status === 'active')) {
        throw new InvalidWriteError('A reset is already running. End it before starting another.');
      }
      const enrolment: StoredEnrolment = {
        id: next('reset'),
        startedOn: input.startedOn,
        timeZone: input.timeZone,
        customisation: resetCustomisationSchema.parse(input.customisation),
        status: 'active',
        breaks: [],
        createdSeq: sequence,
      };
      state(userId).enrolments.push(enrolment);
      return view(enrolment);
    },

    async updateResetCustomisation(
      userId: string,
      enrolmentId: string,
      customisation: ResetCustomisation,
    ) {
      const enrolment = activeOf(userId, enrolmentId);
      enrolment.customisation = resetCustomisationSchema.parse(customisation);
      return view(enrolment);
    },

    async addResetBreak(
      userId: string,
      enrolmentId: string,
      input: { kind: ResetBreak['kind']; from: IsoDate; to: IsoDate | null },
    ) {
      const enrolment = activeOf(userId, enrolmentId);
      if (input.from < enrolment.startedOn)
        throw new InvalidWriteError('A break cannot start before the programme.');
      const problem = breakProblem(enrolment.breaks, input, input.from);
      if (problem) throw new InvalidWriteError(problem);
      enrolment.breaks.push({ id: next('break'), ...input });
      return view(enrolment);
    },

    async endResetBreak(userId: string, enrolmentId: string, breakId: string, resumeOn: IsoDate) {
      const enrolment = activeOf(userId, enrolmentId);
      const found = enrolment.breaks.find((entry) => entry.id === breakId);
      if (!found) throw new RecordNotFoundError('No such break');
      if (resumeOn <= found.from) {
        enrolment.breaks = enrolment.breaks.filter((entry) => entry.id !== breakId);
      } else {
        const end = addDays(resumeOn, -1);
        enrolment.breaks = enrolment.breaks.map((entry) =>
          entry.id === breakId && (entry.to === null || entry.to > end)
            ? { ...entry, to: end }
            : entry,
        );
      }
      return view(enrolment);
    },

    async endReset(userId: string, enrolmentId: string, status: 'finished' | 'ended') {
      const enrolment = activeOf(userId, enrolmentId);
      enrolment.status = status;
      return view(enrolment);
    },

    async logResetItem(
      userId: string,
      input: {
        enrolmentId: string;
        localDate: IsoDate;
        timeZone: string;
        programDay: number;
        component: ResetComponent;
        status: ResetLog['status'];
        targetText: string;
      },
    ) {
      activeOf(userId, input.enrolmentId);
      if (input.programDay < 1 || input.programDay > 66)
        throw new InvalidWriteError('That is not a programme day.');
      const mine = state(userId);
      const log = {
        enrolmentId: input.enrolmentId,
        localDate: input.localDate,
        programDay: input.programDay,
        component: input.component,
        status: input.status,
        targetText: input.targetText,
      };
      mine.logs = mine.logs.filter(
        (entry) =>
          !(
            entry.enrolmentId === input.enrolmentId &&
            entry.localDate === input.localDate &&
            entry.component === input.component
          ),
      );
      mine.logs.push(log);
      const { enrolmentId: _id, ...value } = log;
      void _id;
      return structuredClone(value);
    },

    async clearResetItem(
      userId: string,
      input: { enrolmentId: string; localDate: IsoDate; component: ResetComponent },
    ) {
      enrolmentOf(userId, input.enrolmentId);
      const mine = state(userId);
      mine.logs = mine.logs.filter(
        (entry) =>
          !(
            entry.enrolmentId === input.enrolmentId &&
            entry.localDate === input.localDate &&
            entry.component === input.component
          ),
      );
    },

    async listResetLogs(userId: string, enrolmentId: string) {
      enrolmentOf(userId, enrolmentId);
      return state(userId)
        .logs.filter((entry) => entry.enrolmentId === enrolmentId)
        .sort(
          (a, b) =>
            a.localDate.localeCompare(b.localDate) || a.component.localeCompare(b.component),
        )
        .map(({ enrolmentId: _id, ...log }) => {
          void _id;
          return structuredClone(log);
        });
    },

    async countResetDone(userId: string, range: { from: IsoDate; to: IsoDate }) {
      return state(userId).logs.filter(
        (entry) =>
          entry.status === 'done' && entry.localDate >= range.from && entry.localDate <= range.to,
      ).length;
    },

    async saveResetCheckin(userId: string, enrolmentId: string, checkin: ResetCheckin) {
      activeOf(userId, enrolmentId);
      const mine = state(userId);
      if (
        mine.checkins.some(
          (entry) => entry.enrolmentId === enrolmentId && entry.programWeek === checkin.programWeek,
        )
      ) {
        throw new InvalidWriteError('That week already has a check-in.');
      }
      mine.checkins.push({ ...checkin, enrolmentId });
      return structuredClone(checkin);
    },

    async listResetCheckins(userId: string, enrolmentId: string) {
      return state(userId)
        .checkins.filter((entry) => entry.enrolmentId === enrolmentId)
        .sort((a, b) => a.programWeek - b.programWeek)
        .map(({ enrolmentId: _id, ...checkin }) => {
          void _id;
          return structuredClone(checkin);
        });
    },

    async listJournal(userId: string, range: { from: IsoDate; to: IsoDate }) {
      const days: JournalDay[] = [];
      for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
        const { framing, review } = await hooks.readDay(userId, day);
        if (isEmptyFraming(framing) && isEmptyReview(review)) continue;
        days.push({
          localDate: day,
          framing: isEmptyFraming(framing) ? null : framing,
          review: isEmptyReview(review) ? null : review,
        });
      }
      return days;
    },

    async getWeeklyReview(userId: string, weekStart: IsoDate) {
      return structuredClone(state(userId).weekly.get(weekStart) ?? {});
    },

    async saveWeeklyReview(
      userId: string,
      input: {
        weekStart: IsoDate;
        timeZone: string;
        answers: Partial<Record<WeeklyPromptKey, string | null>>;
      },
    ) {
      const current = { ...(state(userId).weekly.get(input.weekStart) ?? {}) };
      for (const prompt of WEEKLY_PROMPTS) {
        if (!(prompt.key in input.answers)) continue;
        const text = input.answers[prompt.key]?.trim() ?? '';
        if (text.length > 2000)
          throw new InvalidWriteError('Keep each answer under 2000 characters.');
        if (text === '') delete current[prompt.key];
        else current[prompt.key] = text;
      }
      state(userId).weekly.set(input.weekStart, current);
      return structuredClone(current);
    },

    async getContrastScreening(userId: string) {
      return structuredClone(state(userId).screening);
    },

    async saveContrastScreening(userId: string, screening: ContrastScreening) {
      state(userId).screening = contrastScreeningSchema.parse(screening);
      return structuredClone(state(userId).screening!);
    },

    async getSafetyAcknowledgement(userId: string, topic: string) {
      return state(userId).acknowledgements.get(topic) ?? null;
    },

    async acknowledgeSafety(userId: string, input: { topic: string; version: string; at: Date }) {
      state(userId).acknowledgements.set(input.topic, input.version);
    },

    async disableContrast(userId: string) {
      const mine = state(userId);
      mine.screening = null;
      mine.acknowledgements.delete('contrast_therapy');
    },

    async recordContrastSession(
      userId: string,
      input: Omit<ContrastSessionRecord, 'id'> & { timeZone: string; clientToken: string },
    ) {
      const mine = state(userId);
      const seen = mine.contrastTokens.get(input.clientToken);
      if (seen) return structuredClone(mine.contrast.find((entry) => entry.id === seen)!);
      if (input.endedAt < input.startedAt)
        throw new InvalidWriteError('A session cannot end before it starts.');
      const record: ContrastSessionRecord = {
        id: next('contrast'),
        localDate: input.localDate,
        protocol: input.protocol,
        phasesCompleted: input.phasesCompleted,
        status: input.status,
        stopReason: input.stopReason,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      };
      mine.contrast.push(record);
      mine.contrastTokens.set(input.clientToken, record.id);
      return structuredClone(record);
    },

    async listContrastSessions(userId: string, range: { from: IsoDate; to: IsoDate }) {
      return state(userId)
        .contrast.filter((entry) => entry.localDate >= range.from && entry.localDate <= range.to)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((entry) => structuredClone(entry));
    },

    async deleteContrastSessions(userId: string) {
      const mine = state(userId);
      mine.contrast = [];
      mine.contrastTokens.clear();
    },

    exportPrograms(userId: string) {
      const mine = state(userId);
      const rows = (items: readonly unknown[]) =>
        items.map((item) => structuredClone(item) as Record<string, unknown>);
      return {
        reset_enrolments: rows(mine.enrolments),
        reset_logs: rows(mine.logs),
        reset_checkins: rows(mine.checkins),
        journal_entries: rows(
          [...mine.weekly.entries()].map(([weekStart, answers]) => ({ weekStart, answers })),
        ),
        contrast_screenings: mine.screening ? rows([mine.screening]) : [],
        contrast_sessions: rows(mine.contrast),
      };
    },

    deletePrograms(userId: string) {
      users.delete(userId);
    },
  };
}
