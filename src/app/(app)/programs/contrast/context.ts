import {
  addDays,
  screeningHints,
  type ContrastEligibility,
  type ContrastQuestionId,
  type ContrastScreening,
  type ContrastSessionRecord,
  type IsoDate,
} from '@/domain';
import type { AreteRepository } from '@/persistence/repository';
import { loadEligibility } from '../../eligibility';

export interface ContrastContext {
  readonly today: IsoDate;
  readonly screening: ContrastScreening | null;
  readonly acknowledged: string | null;
  readonly eligibility: ContrastEligibility;
  readonly minor: boolean;
  /** False when age or an onboarding answer rules contrast out entirely. */
  readonly offered: boolean;
  readonly hints: Partial<Record<ContrastQuestionId, boolean>>;
  readonly sessions: readonly ContrastSessionRecord[];
}

export async function loadContrastContext(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
): Promise<ContrastContext> {
  const [decided, screening, acknowledged, onboarding, sessions] = await Promise.all([
    loadEligibility(repository, userId, today),
    repository.getContrastScreening(userId),
    repository.getSafetyAcknowledgement(userId, 'contrast_therapy'),
    repository.getOnboarding(userId),
    repository.listContrastSessions(userId, { from: addDays(today, -60), to: today }),
  ]);
  return {
    today,
    screening,
    acknowledged,
    eligibility: decided.contrast,
    minor: decided.minor,
    offered: decided.contrastOffered,
    hints: screeningHints(onboarding.profile.health),
    sessions,
  };
}
