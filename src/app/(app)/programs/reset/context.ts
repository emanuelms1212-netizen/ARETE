import {
  COLD_NOTICE_VERSION,
  CONTRAST_NOTICE_VERSION,
  addDays,
  isMinor,
  programLength,
  resetCustomisationSchema,
  resetDayState,
  resetSummary,
  resetTargets,
  type ContrastScreening,
  type IsoDate,
  type ResetCheckin,
  type ResetCustomisation,
  type ResetDayState,
  type ResetLog,
  type ResetPersonInputs,
  type ResetSummary,
  type ResetTarget,
} from '@/domain';
import type { AreteRepository, ResetEnrolment } from '@/persistence/repository';

/**
 * Everything the Reset screen and its actions need, from one place.
 *
 * The person's inputs come from what they already told ARETE — onboarding,
 * Train's setup, the latest weigh-in — so the suggested ranges are theirs
 * from the first preview. The day's targets are computed here, on the
 * server, from the enrolment, its breaks and Today's minimum-day switch.
 */
export interface ResetContext {
  readonly today: IsoDate;
  readonly person: ResetPersonInputs;
  /** The starting point for a new programme: onboarding's wake and sleep times. */
  readonly defaults: ResetCustomisation;
  readonly enrolment: ResetEnrolment | null;
  readonly last: ResetEnrolment | null;
  readonly state: ResetDayState | null;
  readonly length: number;
  readonly minimumDay: boolean;
  readonly targets: readonly ResetTarget[];
  readonly logs: readonly ResetLog[];
  readonly todaysLogs: readonly ResetLog[];
  readonly checkins: readonly ResetCheckin[];
  /** The programme week whose check-in is due, if any. */
  readonly checkinDue: number | null;
  readonly summary: ResetSummary | null;
  readonly lastSummary: ResetSummary | null;
  readonly contrastAvailable: boolean;
  readonly coldAcknowledged: boolean;
}

export async function personInputs(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
): Promise<{ person: ResetPersonInputs; defaults: ResetCustomisation; minor: boolean }> {
  const [onboarding, setup, weights] = await Promise.all([
    repository.getOnboarding(userId),
    repository.getTrainingSetup(userId),
    repository.listWeights(userId, { from: addDays(today, -365), to: today }),
  ]);
  const profile = onboarding.profile;
  const flags = [...profile.health.injuries, ...(setup?.painFlags ?? [])];
  return {
    person: {
      weightKg: weights.at(-1)?.weightKg ?? null,
      environment: 'temperate',
      experience: setup?.experience ?? profile.training.experience,
      sessionMinutes: setup?.sessionMinutes ?? profile.training.sessionMinutes,
      mindExperience: profile.mind.meditationExperience,
      busyWeekdays: profile.schedule.weekdayConstraint !== 'none',
      recoveryFlag: flags.some((flag) => flag.severity !== 'mild'),
    },
    defaults: resetCustomisationSchema.parse({
      wakeTime: profile.schedule.wakeTime ?? null,
      bedTime: profile.schedule.sleepTime ?? null,
    }),
    minor: isMinor(profile.age.birthYear, today),
  };
}

export async function contrastReady(
  repository: AreteRepository,
  userId: string,
): Promise<{ screening: ContrastScreening | null; acknowledged: string | null }> {
  const [screening, acknowledged] = await Promise.all([
    repository.getContrastScreening(userId),
    repository.getSafetyAcknowledgement(userId, 'contrast_therapy'),
  ]);
  return { screening, acknowledged };
}

export async function loadResetContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
): Promise<ResetContext> {
  const [{ person, defaults }, enrolment, last, framing, contrast, coldAck] = await Promise.all([
    personInputs(repository, userId, today),
    repository.getActiveReset(userId),
    repository.getLastReset(userId),
    repository.getFraming(userId, today),
    contrastReady(repository, userId),
    repository.getSafetyAcknowledgement(userId, 'cold_exposure'),
  ]);
  const contrastAvailable =
    contrast.screening !== null && contrast.acknowledged === CONTRAST_NOTICE_VERSION;

  const personFor = (customisation: ResetCustomisation): ResetPersonInputs => ({
    ...person,
    environment: customisation.environment,
  });

  if (!enrolment) {
    const lastLogs = last ? await repository.listResetLogs(userId, last.id) : [];
    return {
      today,
      person,
      // A new programme starts from the last one's settings, but the extension
      // week is always a fresh, explicit choice.
      defaults: last ? { ...last.customisation, includeExtension: false } : defaults,
      enrolment: null,
      last,
      state: null,
      length: programLength(defaults),
      minimumDay: framing.minimumMode,
      targets: [],
      logs: [],
      todaysLogs: [],
      checkins: [],
      checkinDue: null,
      summary: null,
      lastSummary: last ? resetSummary(lastLogs, programLength(last.customisation)) : null,
      contrastAvailable,
      coldAcknowledged: coldAck === COLD_NOTICE_VERSION,
    };
  }

  const length = programLength(enrolment.customisation);
  const state = resetDayState(enrolment.startedOn, length, enrolment.breaks, today);
  const [logs, checkins] = await Promise.all([
    repository.listResetLogs(userId, enrolment.id),
    repository.listResetCheckins(userId, enrolment.id),
  ]);

  let targets: ResetTarget[] = [];
  if (state.kind === 'active') {
    targets = resetTargets(
      state.programDay,
      personFor(enrolment.customisation),
      enrolment.customisation,
      framing.minimumMode ? 'minimum' : state.mode,
    );
  } else if (state.kind === 'sick') {
    // Rest: water and sleep only, and the clock is stopped.
    targets = resetTargets(
      Math.max(1, state.programDay),
      personFor(enrolment.customisation),
      enrolment.customisation,
      'minimum',
    ).filter((target) => target.component === 'hydration' || target.component === 'sleep');
  }

  // A check-in is due once a programme week is complete and has none yet.
  const completedWeeks =
    state.kind === 'active' || state.kind === 'complete'
      ? Math.floor((state.kind === 'complete' ? length : state.programDay) / 7)
      : 0;
  const done = new Set(checkins.map((checkin) => checkin.programWeek));
  const checkinDue =
    completedWeeks > 0 && !done.has(completedWeeks) && completedWeeks <= 9 ? completedWeeks : null;

  return {
    today,
    person: personFor(enrolment.customisation),
    defaults,
    enrolment,
    last,
    state,
    length,
    minimumDay: framing.minimumMode,
    targets,
    logs,
    todaysLogs: logs.filter((log) => log.localDate === today),
    checkins,
    checkinDue,
    summary: resetSummary(logs, length),
    lastSummary: null,
    contrastAvailable,
    coldAcknowledged: coldAck !== null,
  };
}
