import { FLEX_MOVEMENTS } from '@/content/flexibility/hamstring';
import {
  checkinDue,
  flexEligibility,
  programState,
  type FlexEligibility,
  type FlexEnrolment,
  type FlexProgram,
  type FlexProgramState,
  type FlexSessionRecord,
  type RightsStatus,
  type StoredCheckin,
} from '@/domain';
import { isDemoMode } from '@/lib/env';
import type { AreteRepository } from '@/persistence/repository';

/**
 * Everything the Flexibility screen and its actions need, from one place.
 *
 * As with Train (`../context.ts`), the page and every action derive the same
 * state on the server: which programme may be offered, whether this person
 * should start it at all, where they are in it and what is due.
 */
export interface FlexContext {
  readonly program: FlexProgram | null;
  readonly rightsStatus: RightsStatus | null;
  readonly eligibility: FlexEligibility;
  readonly enrolment: FlexEnrolment | null;
  readonly sessions: readonly FlexSessionRecord[];
  readonly checkins: readonly StoredCheckin[];
  readonly running: FlexSessionRecord | null;
  readonly state: FlexProgramState | null;
  readonly checkinDue: number | null;
  /** True after a session was stopped for pain: the next starts with the easier versions. */
  readonly afterPain: boolean;
}

export async function loadFlexContext(
  repository: AreteRepository,
  userId: string,
  localDate: string,
): Promise<FlexContext> {
  // Pending rights are offered in demo mode only (ledger D78). In live mode
  // the programme appears once its rights are cleared in the database.
  const listings = await repository.listFlexPrograms(userId, { includeRightsPending: isDemoMode });
  const listing = listings[0] ?? null;
  const program = listing?.program ?? null;

  const [onboarding, setup, running] = await Promise.all([
    repository.getOnboarding(userId),
    repository.getTrainingSetup(userId),
    repository.getRunningFlexSession(userId),
  ]);
  const flags = [...onboarding.profile.health.injuries, ...(setup?.painFlags ?? [])];
  const eligibility = program
    ? flexEligibility(program, flags, FLEX_MOVEMENTS)
    : ({ kind: 'ok' } as const);

  const enrolment = program ? await repository.getActiveEnrolment(userId, program.slug) : null;
  const [sessions, checkins] = enrolment
    ? await Promise.all([
        repository.listFlexSessions(userId, enrolment.id),
        repository.listFlexCheckins(userId, enrolment.id),
      ])
    : [[], []];
  const state = program && enrolment ? programState(program, enrolment, sessions, localDate) : null;
  const lastFinished = [...sessions].filter((entry) => entry.status !== 'running').at(-1);

  return {
    program,
    rightsStatus: listing?.rightsStatus ?? null,
    eligibility,
    enrolment,
    sessions,
    checkins,
    running,
    state,
    checkinDue: state ? checkinDue(state, checkins) : null,
    afterPain: lastFinished?.status === 'stopped',
  };
}
