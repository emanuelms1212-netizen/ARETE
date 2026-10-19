import type {
  AnswerableStep,
  Day,
  DayMark,
  DraftWeek,
  FocusSession as FocusTimerSession,
  Goal,
  GoalVerdict,
  Habit,
  HabitLog,
  HabitStatus,
  IsoDate,
  Measurement,
  MindKind,
  MindSession,
  Milestone,
  OnboardingProfile,
  OnboardingProgress,
  OnboardingStep,
  Recurrence,
} from '@/domain';
import type { Block, DrillItem, TrainingSetup, WorkoutSession, WorkoutSnapshot } from '@/domain';

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

  /** The morning half: an intention and the dichotomy-of-control prompt. */
  getFraming(userId: string, localDate: IsoDate): Promise<DayFraming>;
  setFraming(
    userId: string,
    input: {
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly intention?: string | null;
      readonly inMyControl?: string | null;
      readonly notMyControl?: string | null;
    },
  ): Promise<DayFraming>;

  /**
   * Minimum mode. Turning it on is a success state: it swaps eligible items to
   * their minimum and marks nothing as failed.
   */
  setMinimumMode(
    userId: string,
    input: {
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly on: boolean;
      readonly at: Date;
    },
  ): Promise<Day>;

  /** Quick add, straight onto the day. */
  addCommitment(
    userId: string,
    input: {
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly commitment: DayCommitmentInput;
    },
  ): Promise<Day>;

  /** Reorder by listing the ids in their new order. Ids not listed keep their place. */
  reorderCommitments(
    userId: string,
    input: { readonly localDate: IsoDate; readonly orderedIds: readonly string[] },
  ): Promise<Day>;

  /** Moving an item to another day. A decision, recorded as one. */
  snoozeCommitment(
    userId: string,
    input: {
      readonly localDate: IsoDate;
      readonly commitmentId: string;
      readonly to: IsoDate;
      readonly timeZone: string;
      readonly at: Date;
    },
  ): Promise<Day>;

  /** The evening half. */
  getDayReview(userId: string, localDate: IsoDate): Promise<DayReview | null>;
  saveDayReview(
    userId: string,
    input: DayReview & { readonly timeZone: string },
  ): Promise<DayReview>;
}

export interface FocusSessionRepository {
  recordFocusSession(userId: string, input: RecordFocusSessionInput): Promise<FocusSession>;
  listFocusSessions(userId: string, localDate: IsoDate): Promise<readonly FocusSession[]>;

  /**
   * The live timer.
   *
   * Elapsed time is never stored as a countdown — the session holds when the
   * current segment started and how many seconds earlier segments banked, and
   * the domain derives the rest. That is what makes a refresh lossless, and
   * `getRunningFocusSession` is what a reloaded page calls to find out that
   * there was a timer at all.
   */
  startFocusSession(userId: string, input: StartFocusInput): Promise<FocusTimerSession>;
  getRunningFocusSession(userId: string): Promise<FocusTimerSession | null>;
  pauseFocusSession(userId: string, at: Date): Promise<FocusTimerSession>;
  resumeFocusSession(userId: string, at: Date): Promise<FocusTimerSession>;
  finishFocusSession(
    userId: string,
    input: {
      readonly at: Date;
      readonly status: 'completed' | 'abandoned';
      readonly reflection?: string | null;
    },
  ): Promise<FocusTimerSession | null>;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface GoalInput {
  readonly title: string;
  readonly why?: string | null;
  readonly successMeasure?: string | null;
  readonly measureUnit?: string | null;
  readonly startValue?: number | null;
  readonly targetValue?: number | null;
  readonly targetDate?: IsoDate | null;
  readonly maintenanceDate?: IsoDate | null;
  readonly reviewDay?: number | null;
}

export interface GoalReview {
  readonly goalId: string;
  readonly weekStart: IsoDate;
  readonly progressNote: string | null;
  readonly frictionNote: string | null;
  readonly nextCommitment: string | null;
  readonly verdict: GoalVerdict;
}

export interface GoalDetail {
  readonly goal: Goal;
  readonly measurements: readonly Measurement[];
  readonly milestones: readonly Milestone[];
  /** The most recent review, so the UI can say whether this week is done. */
  readonly latestReview: GoalReview | null;
}

export interface GoalRepository {
  listGoals(userId: string, options?: { includeArchived?: boolean }): Promise<readonly Goal[]>;
  getGoal(userId: string, goalId: string): Promise<GoalDetail | null>;
  createGoal(userId: string, input: GoalInput): Promise<Goal>;
  updateGoal(userId: string, goalId: string, input: Partial<GoalInput>): Promise<Goal>;
  setGoalStatus(userId: string, goalId: string, status: Goal['status']): Promise<Goal>;
  /** Soft delete. History attached to the goal survives it. */
  archiveGoal(userId: string, goalId: string, at: Date): Promise<void>;
  /**
   * One reading per goal per local day, replacing any earlier one for that day.
   * `clientToken` makes a retried write a no-op rather than a second reading.
   */
  recordMeasurement(
    userId: string,
    input: {
      readonly goalId: string;
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly value: number;
      readonly note?: string | null;
      readonly clientToken: string;
    },
  ): Promise<readonly Measurement[]>;
  addMilestone(
    userId: string,
    input: { readonly goalId: string; readonly title: string; readonly dueDate?: IsoDate | null },
  ): Promise<Milestone>;
  setMilestoneDone(
    userId: string,
    milestoneId: string,
    at: Date | null,
  ): Promise<readonly Milestone[]>;
  saveGoalReview(
    userId: string,
    input: GoalReview & { readonly timeZone: string },
  ): Promise<GoalReview>;
  listGoalReviews(userId: string, goalId: string): Promise<readonly GoalReview[]>;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'someday' | 'all';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly status: 'open' | 'done' | 'dropped';
  readonly scheduledDate: IsoDate | null;
  readonly dueDate: IsoDate | null;
  readonly estimateMinutes: number | null;
  readonly priority: number;
  readonly energy: 'low' | 'medium' | 'high' | null;
  readonly context: string | null;
  readonly projectId: string | null;
  readonly goalId: string | null;
  readonly parentTaskId: string | null;
  readonly recurrence: Recurrence | null;
  /**
   * The date the series is counted from, fixed at creation.
   *
   * Without it, completing an every-other-Tuesday task would re-anchor the
   * rule to the day it was ticked and the series would drift.
   */
  readonly recurrenceAnchor: IsoDate | null;
  readonly completedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly subtasks: readonly Task[];
}

export interface TaskInput {
  readonly title: string;
  readonly notes?: string | null;
  readonly scheduledDate?: IsoDate | null;
  readonly dueDate?: IsoDate | null;
  readonly estimateMinutes?: number | null;
  readonly priority?: number;
  readonly energy?: 'low' | 'medium' | 'high' | null;
  readonly context?: string | null;
  readonly projectId?: string | null;
  readonly goalId?: string | null;
  readonly parentTaskId?: string | null;
  readonly recurrence?: Recurrence | null;
}

export interface TaskRepository {
  listTasks(
    userId: string,
    options: { readonly view: TaskView; readonly today: IsoDate; readonly horizonDays?: number },
  ): Promise<readonly Task[]>;
  getTask(userId: string, taskId: string): Promise<Task | null>;
  createTask(userId: string, input: TaskInput): Promise<Task>;
  updateTask(userId: string, taskId: string, input: Partial<TaskInput>): Promise<Task>;
  /**
   * Completing a recurring task closes today's occurrence and schedules the
   * next one, rather than ending the series.
   */
  setTaskStatus(
    userId: string,
    input: {
      readonly taskId: string;
      readonly status: Task['status'];
      readonly at: Date;
      readonly today: IsoDate;
    },
  ): Promise<Task>;
  archiveTask(userId: string, taskId: string, at: Date): Promise<void>;
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export interface HabitInput {
  readonly title: string;
  readonly kind: Habit['kind'];
  readonly unit?: string | null;
  readonly targetValue?: number | null;
  readonly minimumTarget?: number | null;
  readonly goalId?: string | null;
  readonly schedule?: Recurrence | null;
}

export interface HabitWithSchedule {
  readonly habit: Habit;
  /** The rule in force today. Past days expand with the rule that applied then. */
  readonly schedule: Recurrence | null;
}

export interface HabitRepository {
  listHabits(
    userId: string,
    options?: { readonly includeArchived?: boolean },
  ): Promise<readonly HabitWithSchedule[]>;
  createHabit(userId: string, input: HabitInput): Promise<Habit>;
  updateHabit(userId: string, habitId: string, input: Partial<HabitInput>): Promise<Habit>;
  setHabitPaused(userId: string, habitId: string, at: Date | null): Promise<Habit>;
  archiveHabit(userId: string, habitId: string, at: Date): Promise<void>;
  /** One log per habit per local day. Logging twice replaces, never duplicates. */
  logHabit(
    userId: string,
    input: {
      readonly habitId: string;
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly status: HabitStatus;
      readonly value?: number | null;
      readonly skipReason?: string | null;
      readonly clientToken: string;
    },
  ): Promise<HabitLog>;
  listHabitLogs(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly HabitLog[]>;
}

// ---------------------------------------------------------------------------
// The day: its beginning, its end, and the edits in between
// ---------------------------------------------------------------------------

export interface DayFraming {
  readonly intention: string | null;
  readonly inMyControl: string | null;
  readonly notMyControl: string | null;
  readonly minimumMode: boolean;
}

export interface DayReview {
  readonly localDate: IsoDate;
  readonly wentWell: string | null;
  readonly friction: string | null;
  readonly tomorrowOneThing: string | null;
  readonly energy: 'low' | 'steady' | 'high' | null;
  readonly metMinimum: boolean | null;
}

// ---------------------------------------------------------------------------
// Focus, as a live timer rather than only a record
// ---------------------------------------------------------------------------

export interface StartFocusInput {
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly plannedMinutes: number;
  readonly kind: FocusTimerSession['kind'];
  readonly preset?: string | null;
  readonly taskId?: string | null;
  readonly goalId?: string | null;
  readonly startedAt: Date;
  readonly clientToken: string;
}

// ---------------------------------------------------------------------------
// Mind: meditation, breathwork and cognitive practice
// ---------------------------------------------------------------------------

export interface MindPractice {
  readonly slug: string;
  readonly kind: MindKind;
  readonly title: string;
  readonly summary: string;
  readonly defaultMinutes: number | null;
  readonly minMinutes: number | null;
  readonly maxMinutes: number | null;
  readonly pattern: Record<string, number> | null;
  readonly drill: string | null;
  /** Null for the practices that ship with the app; a slug ties it to a pack. */
  readonly contentPackSlug: string | null;
  readonly provenanceNote: string | null;
  readonly steps: readonly { label: string; seconds?: number; say?: string }[];
}

export interface MindPack {
  readonly slug: string;
  readonly title: string;
  /**
   * True for anything that must never be inferred from identity, language or
   * location. The Jewish meditation pack above all — SOURCE_MAP §5.
   */
  readonly requiresExplicitChoice: boolean;
  readonly provenanceNote: string | null;
  readonly chosen: boolean;
}

export interface StartMindInput {
  readonly kind: MindKind;
  readonly practiceSlug: string;
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly startedAt: Date;
  readonly plannedMinutes?: number | null;
  /** Breathwork only. */
  readonly plannedRounds?: number | null;
  /** Identifies this start attempt, so a retry of it is not a second start. */
  readonly clientToken: string;
}

export interface FinishMindInput {
  readonly kind: MindKind;
  readonly at: Date;
  readonly status: 'completed' | 'abandoned';
  readonly rating?: number | null;
  readonly reflection?: string | null;
  /** Breathwork only: rounds actually completed. */
  readonly rounds?: number | null;
  /** Cognitive only. */
  readonly items?: readonly DrillItem[];
}

export interface MindHistoryEntry {
  readonly id: string;
  readonly kind: MindKind;
  readonly practiceSlug: string;
  readonly localDate: IsoDate;
  readonly minutes: number;
  readonly status: 'completed' | 'abandoned';
  readonly rating: number | null;
  readonly reflection: string | null;
  /** Cognitive only, and never presented as a score. */
  readonly drill: string | null;
  readonly itemsAttempted: number | null;
  readonly itemsCorrect: number | null;
  readonly medianResponseMs: number | null;
}

export interface MindRepository {
  /**
   * The practices this user may be offered.
   *
   * A practice belonging to a pack is excluded unless the user has chosen that
   * pack. This is the enforcement point for the rule in SOURCE_MAP §5: it is
   * one query, not a thing each screen has to remember.
   */
  listMindPractices(userId: string, kind?: MindKind): Promise<readonly MindPractice[]>;
  listMindPacks(userId: string): Promise<readonly MindPack[]>;
  setPackChosen(userId: string, packSlug: string, chosen: boolean): Promise<readonly MindPack[]>;

  startMindSession(userId: string, input: StartMindInput): Promise<MindSession>;
  getRunningMindSession(userId: string, kind: MindKind): Promise<MindSession | null>;
  pauseMindSession(userId: string, kind: MindKind, at: Date): Promise<MindSession>;
  resumeMindSession(userId: string, kind: MindKind, at: Date): Promise<MindSession>;
  finishMindSession(userId: string, input: FinishMindInput): Promise<MindSession | null>;

  listMindHistory(
    userId: string,
    options?: { readonly kind?: MindKind; readonly limit?: number },
  ): Promise<readonly MindHistoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Train: the plan's inputs, and workouts as they are done
// ---------------------------------------------------------------------------

export interface StartWorkoutInput {
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly snapshot: WorkoutSnapshot;
  readonly startedAt: Date;
  /** Identifies this start attempt, so a retry of it is not a second workout. */
  readonly clientToken: string;
}

export interface LogWorkoutSetInput {
  readonly workoutId: string;
  readonly exerciseSlug: string;
  readonly block: Block;
  readonly setIndex: number;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly seconds: number | null;
  readonly distanceM: number | null;
  readonly rpe: number | null;
  readonly pain: number | null;
  readonly completed: boolean;
  readonly formOk: boolean | null;
  readonly notes: string | null;
  readonly substitutedFrom: string | null;
  readonly at: Date;
}

export interface FinishWorkoutInput {
  readonly workoutId: string;
  readonly status: 'completed' | 'abandoned';
  readonly at: Date;
  readonly notes: string | null;
}

export interface TrainRepository {
  /** Null until the person has saved a Train setup. */
  getTrainingSetup(userId: string): Promise<TrainingSetup | null>;
  saveTrainingSetup(userId: string, setup: TrainingSetup, at: Date): Promise<TrainingSetup>;

  /**
   * Starts a workout. One may run at a time: starting a second is refused,
   * except that repeating the same start (same client token) returns the
   * workout it already created.
   */
  startWorkout(userId: string, input: StartWorkoutInput): Promise<WorkoutSession>;
  getRunningWorkout(userId: string): Promise<WorkoutSession | null>;
  /** Replaces the prescription of a running workout — how a substitution is saved. */
  updateWorkoutSnapshot(
    userId: string,
    workoutId: string,
    snapshot: WorkoutSnapshot,
  ): Promise<WorkoutSession>;
  /** Logs one set. Logging the same set again corrects it. Running workouts only. */
  logWorkoutSet(userId: string, input: LogWorkoutSetInput): Promise<WorkoutSession>;
  finishWorkout(userId: string, input: FinishWorkoutInput): Promise<WorkoutSession>;
  /** Most recent first, sets included. */
  listWorkouts(
    userId: string,
    options?: { readonly limit?: number },
  ): Promise<readonly WorkoutSession[]>;
  getWorkout(userId: string, workoutId: string): Promise<WorkoutSession | null>;
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
    GoalRepository,
    TaskRepository,
    HabitRepository,
    MindRepository,
    TrainRepository,
    FocusSessionRepository,
    AccountRepository {
  readonly kind: 'memory' | 'sql';
}

/** Raised when a write is refused because it would contradict the rules. */
export class InvalidWriteError extends Error {
  override readonly name = 'InvalidWriteError';
}

export class PersistenceNotConfiguredError extends Error {
  override readonly name = 'PersistenceNotConfiguredError';
}

export class RecordNotFoundError extends Error {
  override readonly name = 'RecordNotFoundError';
}
