import { EXERCISES } from '@/content/train/exercises';
import {
  availabilityFor,
  decisionFor,
  generateTrainingPlan,
  recentSessionCount,
  suggestedSetup,
  weekdayOf,
  type Availability,
  type OnboardingProfile,
  type PlanContext,
  type TrainingPlan,
  type TrainingSetup,
  type WorkoutSession,
} from '@/domain';
import { loadEligibility } from '../eligibility';
import type { AreteRepository } from '@/persistence/repository';

/**
 * Everything the Train screen and its actions need, computed in one place.
 *
 * The page and every action call this, so the plan the person sees is the
 * plan the server acts on: the same setup, the same safety rules, the same
 * history. Nothing about the plan is ever taken from the client.
 */
export interface TrainContext {
  readonly setup: TrainingSetup | null;
  readonly suggested: TrainingSetup;
  readonly plan: TrainingPlan | null;
  readonly planContext: PlanContext;
  readonly availability: Availability | null;
  readonly history: readonly WorkoutSession[];
  readonly weekday: number;
  readonly profile: OnboardingProfile;
}

export async function loadTrainContext(
  repository: AreteRepository,
  userId: string,
  localDate: string,
): Promise<TrainContext> {
  const [setup, onboarding, history, decided] = await Promise.all([
    repository.getTrainingSetup(userId),
    repository.getOnboarding(userId),
    repository.listWorkouts(userId, { limit: 40 }),
    loadEligibility(repository, userId, localDate),
  ]);
  const { profile } = onboarding;
  const safety = decided.report;

  const planContext: PlanContext = {
    excludedRegions: safety.excludedRegions,
    regressedRegions: safety.regressedRegions,
    highIntensityAllowed: decisionFor(safety, 'high_intensity').outcome === 'allowed',
    recentSessions: recentSessionCount(history, localDate),
  };

  return {
    setup,
    suggested: suggestedSetup({
      experience: profile.training.experience,
      equipment: profile.training.equipment,
      sessionMinutes: profile.training.sessionMinutes,
      preferredWeekdays: profile.training.preferredWeekdays,
      availableWeekdays: profile.schedule.availableWeekdays,
      injuries: profile.health.injuries,
    }),
    plan: setup ? generateTrainingPlan(setup, EXERCISES, planContext) : null,
    planContext,
    availability: setup ? availabilityFor(setup, planContext) : null,
    history,
    weekday: weekdayOf(localDate),
    profile,
  };
}
