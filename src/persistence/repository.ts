import type {
  AnswerableStep,
  Day,
  DayMark,
  DraftWeek,
  IsoDate,
  OnboardingProfile,
  OnboardingProgress,
  OnboardingStep,
} from '@/domain';

/**
 * The persistence contract.
 *
 * Everything above this line talks to these interfaces and never to a database
 * client. Two implementations exist and both pass the same contract suite in
 * `repository-contract.ts`:
 *
 *   * `createMemoryRepository()` — demo mode, deterministic, no credentials.
 *   * `createSqlRepository(executor)` — real SQL, exercised in the tests against
 *     an in-process Postgres and in production against Supabase's.
 *
 * Reads and writes both go through here. A repository is always given the
 * `userId` explicitly rather than reading an ambient session: the database's
 * row-level security is the real boundary, and passing the id makes the
 * authorization tests able to try being the wrong person.
 */

export interface DayCommitmentInput {
  readonly kind: Day['commitments'][number]['kind'];
  readonly title: string;
  readonly isMinimum?: boolean;
  readonly refId?: string;
}

export interface UpsertDayInput {
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly commitments: readonly DayCommitmentInput[];
}

export interface SetCommitmentStatusInput {
  readonly localDate: IsoDate;
  readonly commitmentId: string;
  readonly status: 'pending' | 'done' | 'skipped';
  readonly skipReason?: string;
  /** Supplied so the caller controls the clock; nothing here reads `Date.now()`. */
  readonly at: Date;
}

export interface RecordFocusSessionInput {
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly plannedMinutes: number;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly actualSeconds: number;
  readonly interruptions?: number;
  readonly status: 'completed' | 'abandoned';
  readonly taskId?: string;
  /** Idempotency key. Re-recording the same session returns the first one. */
  readonly clientToken: string;
}

export interface FocusSession {
  readonly id: string;
  readonly localDate: IsoDate;
  readonly plannedMinutes: number;
  readonly actualSeconds: number;
  readonly interruptions: number;
  readonly status: 'completed' | 'abandoned';
  readonly clientToken: string;
}

export interface AccountExport {
  readonly exportedAt: string;
  readonly schemaVersion: number;
  readonly profile: Record<string, unknown> | null;
  readonly tables: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}

export interface ProfileRepository {
  /**
   * The zone the user's days are measured in. Every date this app shows is a
   * local date, so the zone has to come from the account rather than from the
   * server's own clock.
   */
  getTimeZone(userId: string): Promise<string>;
}

export interface OnboardingState {
  readonly progress: OnboardingProgress;
  /** Answers given so far, with the conservative defaults filling the rest. */
  readonly profile: OnboardingProfile;
}

export interface OnboardingRepository {
  getOnboarding(userId: string): Promise<OnboardingState>;
  /** Saves one step's answers. Resumable: the flow can be left at any point. */
  saveStep(userId: string, step: AnswerableStep, answers: unknown): Promise<OnboardingState>;
  /** Skipping is a real answer — it means "use the conservative default". */
  skipStep(userId: string, step: OnboardingStep): Promise<OnboardingState>;
  /** Stores the generated week for review. Returns its id. */
  saveDraftWeek(userId: string, draft: DraftWeek): Promise<string>;
  getLatestDraft(userId: string): Promise<{ id: string; draft: DraftWeek } | null>;
  /**
   * Turns the reviewed draft into real days and finishes onboarding.
   * Nothing the user saw is written before this is called.
   */
  acceptDraft(userId: string, draftId: string, at: Date): Promise<void>;
}

export interface DayRepository {
  getDay(userId: string, localDate: IsoDate): Promise<Day | null>;
  listDays(userId: string, range: { from: IsoDate; to: IsoDate }): Promise<readonly Day[]>;
  upsertDay(userId: string, input: UpsertDayInput): Promise<Day>;
  commitDay(userId: string, localDate: IsoDate, at: Date): Promise<Day>;
  markDay(userId: string, localDate: IsoDate, mark: DayMark, reason?: string): Promise<Day>;
  setCommitmentStatus(userId: string, input: SetCommitmentStatusInput): Promise<Day>;
}

export interface FocusSessionRepository {
  recordFocusSession(userId: string, input: RecordFocusSessionInput): Promise<FocusSession>;
  listFocusSessions(userId: string, localDate: IsoDate): Promise<readonly FocusSession[]>;
}

export interface AccountRepository {
  /** Everything the account holds, as one document. Immediate, no queue. */
  exportEverything(userId: string): Promise<AccountExport>;
  /** Irreversible. */
  deleteEverything(userId: string): Promise<void>;
}

export interface AreteRepository
  extends
    ProfileRepository,
    OnboardingRepository,
    DayRepository,
    FocusSessionRepository,
    AccountRepository {
  readonly kind: 'memory' | 'sql';
}

export class PersistenceNotConfiguredError extends Error {
  override readonly name = 'PersistenceNotConfiguredError';
}

export class RecordNotFoundError extends Error {
  override readonly name = 'RecordNotFoundError';
}
