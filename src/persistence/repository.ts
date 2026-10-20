import type {
  AuditAction,
  AuditEvent,
  DataFeature,
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
  Virtue,
  ContrastScreening,
  ContrastSessionRecord,
  ResetBreak,
  ResetBreakKind,
  ResetCheckin,
  ResetComponent,
  ResetCustomisation,
  ResetLog,
  ResetLogStatus,
  WeeklyPromptKey,
  NotificationEvent,
  NotificationPreferences,
} from '@/domain';
import type {
  Block,
  Checkin,
  Food,
  FoodEntry,
  FoodInput,
  MealSlot,
  Nutrients,
  NutritionSettings,
  OilAwareness,
  TargetOverride,
  WeightPoint,
  DrillItem,
  FlexEnrolment,
  FlexItemRecord,
  FlexProgram,
  FlexSessionRecord,
  RightsStatus,
  StoredCheckin,
  TrainingSetup,
  WarmupChoice,
  WorkoutSession,
  WorkoutSnapshot,
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
      readonly virtue?: Virtue | null;
      readonly obstacle?: string | null;
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
  /** The Stoic journal's morning half (domain/journal.ts). */
  readonly virtue: Virtue | null;
  readonly obstacle: string | null;
  readonly minimumMode: boolean;
}

export interface DayReview {
  readonly localDate: IsoDate;
  readonly wentWell: string | null;
  readonly friction: string | null;
  readonly tomorrowOneThing: string | null;
  /** What the day taught. Optional on write, so older callers do not have to know it. */
  readonly learned?: string | null;
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

// ---------------------------------------------------------------------------
// Flexibility programmes
// ---------------------------------------------------------------------------

export interface FlexProgramListing {
  readonly program: FlexProgram;
  /** From the database where there is one: the product owner clears it there. */
  readonly rightsStatus: RightsStatus;
}

export interface FlexibilityRepository {
  /**
   * Programmes this account may be offered. A programme whose rights are not
   * cleared is excluded unless the caller allows it — the enforcement point
   * for SOURCE_MAP §7, in the same spirit as the opt-in pack rule (D55).
   */
  listFlexPrograms(
    userId: string,
    options: { readonly includeRightsPending: boolean },
  ): Promise<readonly FlexProgramListing[]>;
  getActiveEnrolment(userId: string, programSlug: string): Promise<FlexEnrolment | null>;
  /** Starts a programme. Any active enrolment in the same programme is ended first. */
  enrolFlex(
    userId: string,
    input: {
      readonly programSlug: string;
      readonly startedOn: IsoDate;
      readonly weekdays: readonly number[];
      readonly at: Date;
      readonly includeRightsPending: boolean;
    },
  ): Promise<FlexEnrolment>;
  setFlexSchedule(
    userId: string,
    enrolmentId: string,
    weekdays: readonly number[],
  ): Promise<FlexEnrolment>;
  endFlexEnrolment(
    userId: string,
    enrolmentId: string,
    status: 'completed' | 'ended',
    at: Date,
  ): Promise<FlexEnrolment>;

  listFlexSessions(userId: string, enrolmentId: string): Promise<readonly FlexSessionRecord[]>;
  getRunningFlexSession(userId: string): Promise<FlexSessionRecord | null>;
  /** Refuses a slot that does not exist or is already closed, and a second running session. */
  startFlexSession(
    userId: string,
    input: {
      readonly enrolmentId: string;
      readonly week: number;
      readonly day: number;
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly startedAt: Date;
      readonly clientToken: string;
    },
  ): Promise<FlexSessionRecord>;
  updateFlexSession(
    userId: string,
    sessionId: string,
    patch: {
      readonly warmup?: WarmupChoice;
      readonly items?: readonly FlexItemRecord[];
      readonly notes?: string | null;
    },
  ): Promise<FlexSessionRecord>;
  /** `stopped` is the pain exit, and is always recorded as pain. */
  finishFlexSession(
    userId: string,
    input: {
      readonly sessionId: string;
      readonly status: 'completed' | 'stopped';
      readonly at: Date;
      readonly painNote?: string | null;
      readonly notes?: string | null;
    },
  ): Promise<FlexSessionRecord>;
  skipFlexSession(
    userId: string,
    input: {
      readonly enrolmentId: string;
      readonly week: number;
      readonly day: number;
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly reason: string;
      readonly at: Date;
    },
  ): Promise<FlexSessionRecord>;

  /** One per week per enrolment; saving again for the same week corrects it. */
  saveFlexCheckin(
    userId: string,
    input: { readonly enrolmentId: string; readonly localDate: IsoDate; readonly checkin: Checkin },
  ): Promise<StoredCheckin>;
  listFlexCheckins(userId: string, enrolmentId: string): Promise<readonly StoredCheckin[]>;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export interface WaterLog {
  readonly id: string;
  readonly localDate: IsoDate;
  readonly ml: number;
  readonly loggedAt: string;
}

export type AddFoodEntryInput = {
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly slot: MealSlot;
  readonly clientToken: string;
} & (
  | { readonly foodId: string; readonly servings: number }
  | { readonly quickAdd: { readonly description: string; readonly nutrients: Nutrients } }
);

export interface NutritionRepository {
  /** Stored settings, with onboarding's answers (numbers hidden, units) as the starting point. */
  getNutritionSettings(userId: string): Promise<NutritionSettings>;
  saveNutritionSettings(userId: string, settings: NutritionSettings): Promise<NutritionSettings>;
  getTargetOverride(userId: string): Promise<TargetOverride | null>;
  /** `null` clears it, returning to calculated targets. */
  saveTargetOverride(
    userId: string,
    override: TargetOverride | null,
    at: Date,
  ): Promise<TargetOverride | null>;

  /** The person's own foods and recipes, favourites first, then by name. Archived ones excluded. */
  listFoods(userId: string): Promise<readonly Food[]>;
  /** Creates or updates. A recipe's numbers are calculated here from its ingredients. */
  saveFood(
    userId: string,
    input: { readonly id?: string; readonly food: FoodInput },
  ): Promise<Food>;
  setFoodFavourite(userId: string, foodId: string, favourite: boolean): Promise<Food>;
  archiveFood(userId: string, foodId: string): Promise<void>;

  listFoodEntries(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly FoodEntry[]>;
  /** The food's numbers × servings are copied onto the entry, so editing the food later does not rewrite history. */
  addFoodEntry(userId: string, input: AddFoodEntryInput): Promise<FoodEntry>;
  updateFoodEntry(
    userId: string,
    entryId: string,
    patch: {
      readonly servings?: number;
      readonly slot?: MealSlot;
      readonly quickAdd?: { readonly description: string; readonly nutrients: Nutrients };
    },
  ): Promise<FoodEntry>;
  deleteFoodEntry(userId: string, entryId: string): Promise<void>;
  /** Copies one meal's entries onto another day. A repeated copy with the same token copies once. */
  copyMeal(
    userId: string,
    input: {
      readonly fromDate: IsoDate;
      readonly toDate: IsoDate;
      readonly slot: MealSlot;
      readonly timeZone: string;
      readonly clientToken: string;
    },
  ): Promise<readonly FoodEntry[]>;

  addWater(
    userId: string,
    input: {
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly ml: number;
      readonly at: Date;
      readonly clientToken: string;
    },
  ): Promise<WaterLog>;
  listWater(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly WaterLog[]>;
  deleteWater(userId: string, id: string): Promise<void>;

  /** One weigh-in per day; logging again that day corrects it. */
  logWeight(
    userId: string,
    input: {
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly weightKg: number;
      readonly at: Date;
    },
  ): Promise<WeightPoint>;
  listWeights(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly WeightPoint[]>;
  deleteWeight(userId: string, localDate: IsoDate): Promise<void>;

  /** Null means the feature is off. */
  getOilAwareness(userId: string): Promise<OilAwareness | null>;
  saveOilAwareness(userId: string, value: OilAwareness): Promise<OilAwareness>;
  /** Turns it off and deletes the list and every label note. */
  deleteOilAwareness(userId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Programmes and reflection
// ---------------------------------------------------------------------------

export interface ResetEnrolment {
  readonly id: string;
  readonly startedOn: IsoDate;
  readonly timeZone: string;
  readonly customisation: ResetCustomisation;
  readonly status: 'active' | 'finished' | 'ended';
  readonly breaks: readonly ResetBreak[];
}

export interface JournalDay {
  readonly localDate: IsoDate;
  readonly framing: DayFraming | null;
  readonly review: DayReview | null;
}

export interface ProgramsRepository {
  getActiveReset(userId: string): Promise<ResetEnrolment | null>;
  /** The most recent finished or ended programme, for the finish screen and "start again". */
  getLastReset(userId: string): Promise<ResetEnrolment | null>;
  /** Refused while another reset is active. */
  startReset(
    userId: string,
    input: {
      readonly startedOn: IsoDate;
      readonly timeZone: string;
      readonly customisation: ResetCustomisation;
    },
  ): Promise<ResetEnrolment>;
  updateResetCustomisation(
    userId: string,
    enrolmentId: string,
    customisation: ResetCustomisation,
  ): Promise<ResetEnrolment>;
  addResetBreak(
    userId: string,
    enrolmentId: string,
    input: { readonly kind: ResetBreakKind; readonly from: IsoDate; readonly to: IsoDate | null },
  ): Promise<ResetEnrolment>;
  /**
   * Ends a break so the programme resumes on `resumeOn`. A break that had not
   * started yet by then is removed, as if it had never been planned.
   */
  endResetBreak(
    userId: string,
    enrolmentId: string,
    breakId: string,
    resumeOn: IsoDate,
  ): Promise<ResetEnrolment>;
  endReset(
    userId: string,
    enrolmentId: string,
    status: 'finished' | 'ended',
    at: Date,
  ): Promise<ResetEnrolment>;
  /** One record per component per day; logging again changes it. */
  logResetItem(
    userId: string,
    input: {
      readonly enrolmentId: string;
      readonly localDate: IsoDate;
      readonly timeZone: string;
      readonly programDay: number;
      readonly component: ResetComponent;
      readonly status: ResetLogStatus;
      readonly targetText: string;
    },
  ): Promise<ResetLog>;
  clearResetItem(
    userId: string,
    input: {
      readonly enrolmentId: string;
      readonly localDate: IsoDate;
      readonly component: ResetComponent;
    },
  ): Promise<void>;
  listResetLogs(userId: string, enrolmentId: string): Promise<readonly ResetLog[]>;
  /** Across every programme, for the weekly review. */
  countResetDone(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<number>;
  /** One per programme week; a second for the same week is refused. */
  saveResetCheckin(
    userId: string,
    enrolmentId: string,
    checkin: ResetCheckin,
  ): Promise<ResetCheckin>;
  listResetCheckins(userId: string, enrolmentId: string): Promise<readonly ResetCheckin[]>;

  /** The Stoic journal, day by day: Today's framing and review, where either has words. */
  listJournal(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly JournalDay[]>;
  getWeeklyReview(
    userId: string,
    weekStart: IsoDate,
  ): Promise<Partial<Record<WeeklyPromptKey, string>>>;
  saveWeeklyReview(
    userId: string,
    input: {
      readonly weekStart: IsoDate;
      readonly timeZone: string;
      readonly answers: Partial<Record<WeeklyPromptKey, string | null>>;
    },
  ): Promise<Partial<Record<WeeklyPromptKey, string>>>;

  /** Contrast therapy. Null means the pack has never been set up, or was turned off. */
  getContrastScreening(userId: string): Promise<ContrastScreening | null>;
  saveContrastScreening(userId: string, screening: ContrastScreening): Promise<ContrastScreening>;
  /** The version of the contrast safety notice acknowledged, if any. */
  getSafetyAcknowledgement(
    userId: string,
    topic: 'contrast_therapy' | 'cold_exposure',
  ): Promise<string | null>;
  acknowledgeSafety(
    userId: string,
    input: {
      readonly topic: 'contrast_therapy' | 'cold_exposure';
      readonly version: string;
      readonly at: Date;
    },
  ): Promise<void>;
  /** Turns the pack off: deletes the screening and its acknowledgement. Sessions stay unless deleted. */
  disableContrast(userId: string): Promise<void>;
  recordContrastSession(
    userId: string,
    input: Omit<ContrastSessionRecord, 'id'> & {
      readonly timeZone: string;
      readonly clientToken: string;
    },
  ): Promise<ContrastSessionRecord>;
  listContrastSessions(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly ContrastSessionRecord[]>;
  deleteContrastSessions(userId: string): Promise<void>;
}

export interface NotificationRepository {
  /** Defaults (everything off, cap of two, quiet 22:00–07:00) until the person saves their own. */
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
  saveNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences>;
  listNotificationEvents(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly NotificationEvent[]>;
  recordNotificationEvent(
    userId: string,
    event: NotificationEvent & { readonly timeZone: string },
  ): Promise<NotificationEvent>;
}

/** Range reads for Progress, so a 90-day view is three queries rather than 180. */
export interface ProgressRepository {
  listFocusSessionsBetween(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly FocusSession[]>;
  /** Local dates the person ran at the minimum. */
  listMinimumDays(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly IsoDate[]>;
  /** Flexibility sessions across every enrolment, by local date. */
  listFlexSessionsBetween(
    userId: string,
    range: { readonly from: IsoDate; readonly to: IsoDate },
  ): Promise<readonly FlexSessionRecord[]>;
}

export interface AccountRepository {
  /** Everything the account holds, as one document. Immediate, no queue. */
  exportEverything(userId: string): Promise<AccountExport>;
  /** Irreversible. */
  deleteEverything(userId: string): Promise<void>;
  /** Irreversible: one part of the account (see domain/data-features.ts), the rest untouched. */
  deleteFeatureData(userId: string, feature: DataFeature): Promise<void>;
  /** Appends to the audit trail. Records what happened, never what was in it. */
  recordAudit(
    userId: string,
    event: { readonly action: AuditAction; readonly detail: string | null },
  ): Promise<void>;
  /** Newest first. */
  listAuditEvents(userId: string, limit: number): Promise<readonly AuditEvent[]>;
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
    FlexibilityRepository,
    NutritionRepository,
    ProgramsRepository,
    ProgressRepository,
    NotificationRepository,
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
