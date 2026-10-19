import {
  addDays,
  contrastEligibility,
  screeningHints,
  type ContrastEligibility,
  type ContrastQuestionId,
  type ContrastScreening,
  type ContrastSessionRecord,
  type IsoDate,
} from '@/domain';
import type { AreteRepository } from '@/persistence/repository';
import { contrastReady, personInputs } from '../reset/context';

export interface ContrastContext {
  readonly today: IsoDate;
  readonly screening: ContrastScreening | null;
  readonly acknowledged: string | null;
  readonly eligibility: ContrastEligibility;
  readonly minor: boolean;
  readonly hints: Partial<Record<ContrastQuestionId, boolean>>;
  readonly sessions: readonly ContrastSessionRecord[];
}

export async function loadContrastContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
): Promise<ContrastContext> {
  const [{ minor }, ready, onboarding, sessions] = await Promise.all([
    personInputs(repository, userId, today),
    contrastReady(repository, userId),
    repository.getOnboarding(userId),
    repository.listContrastSessions(userId, { from: addDays(today, -60), to: today }),
  ]);
  return {
    today,
    screening: ready.screening,
    acknowledged: ready.acknowledged,
    eligibility: contrastEligibility({
      screening: ready.screening,
      isMinor: minor,
      acknowledgedVersion: ready.acknowledged,
    }),
    minor,
    hints: screeningHints(onboarding.profile.health),
    sessions,
  };
}
