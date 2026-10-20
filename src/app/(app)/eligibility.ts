import { eligibility, type Eligibility, type IsoDate } from '@/domain';
import type { AreteRepository } from '@/persistence/repository';

/**
 * Loads everything the central eligibility rules read, and runs them once.
 *
 * Every server context that needs a safety answer — Train, Flexibility,
 * Food, the Reset, contrast therapy, the Settings overview — comes through
 * here, so two screens can never reach different conclusions from the same
 * answers. Components receive the result; they never re-derive it.
 */
export async function loadEligibility(
  repository: AreteRepository,
  userId: string,
  today: IsoDate,
): Promise<Eligibility> {
  const [onboarding, setup, settings, screening, coldAck, contrastAck] = await Promise.all([
    repository.getOnboarding(userId),
    repository.getTrainingSetup(userId),
    repository.getNutritionSettings(userId),
    repository.getContrastScreening(userId),
    repository.getSafetyAcknowledgement(userId, 'cold_exposure'),
    repository.getSafetyAcknowledgement(userId, 'contrast_therapy'),
  ]);
  return eligibility({
    today,
    profile: onboarding.profile,
    painFlags: setup?.painFlags ?? [],
    nutrition: {
      birthYear: settings.birthYear,
      eatingDisorderCaution: settings.eatingDisorderCaution,
      prescribedDiet: settings.prescribedDiet,
    },
    contrastScreening: screening,
    acknowledgements: { cold_exposure: coldAck, contrast_therapy: contrastAck },
  });
}
