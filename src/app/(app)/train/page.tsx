import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/auth';
import { TrainBoard } from '@/components/train/train-board';
import { EmptyState, PageHeader } from '@/components/ui';
import { EXERCISES } from '@/content/train/exercises';
import { buildWorkout, sessionForWeekday } from '@/domain';
import { withUser } from '@/persistence';
import { resolveCurrentDay } from '../current-day';
import {
  finishWorkoutAction,
  logSetAction,
  saveTrainingSetupAction,
  startWorkoutAction,
  substituteAction,
} from './actions';
import { loadTrainContext } from './context';

export const metadata: Metadata = { title: 'Train' };

/** Per-user, and the plan depends on today's date and history. */
export const dynamic = 'force-dynamic';

export default async function TrainPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        title="You are signed out."
        body="Demo mode is the way in until the Supabase project exists."
      />
    );
  }

  const data = await withUser(user.id, async (repository) => {
    const { localDate } = await resolveCurrentDay(repository, user);
    const context = await loadTrainContext(repository, user.id, localDate);
    const today = context.plan ? sessionForWeekday(context.plan, context.weekday) : null;
    const preview =
      today && context.availability
        ? buildWorkout({
            session: today,
            readiness: 'normal',
            minimumMode: false,
            history: context.history,
            library: EXERCISES,
            availability: context.availability,
          })
        : null;
    return {
      ...context,
      preview,
      running: context.history.find((workout) => workout.status === 'running') ?? null,
      recent: context.history.filter((workout) => workout.status !== 'running').slice(0, 5),
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Train"
        lede="A plan that fits your week, gets harder only when your sets say so, and always has a smaller version."
      />
      <nav aria-label="More in Train" className="grid grid-cols-2 gap-3">
        <Link
          href="/train/flexibility"
          className="rounded-xl border border-line bg-surface p-3 hover:border-line-strong"
        >
          <span className="block text-body font-semibold text-ink">Flexibility</span>
          <span className="block text-body-sm text-ink-muted">Hamstrings, four weeks</span>
        </Link>
        <Link
          href="/train/exercises"
          className="rounded-xl border border-line bg-surface p-3 hover:border-line-strong"
        >
          <span className="block text-body font-semibold text-ink">Exercise library</span>
          <span className="block text-body-sm text-ink-muted">How to do each movement</span>
        </Link>
      </nav>
      <TrainBoard
        setup={data.setup}
        suggested={data.suggested}
        plan={data.plan}
        todayWeekday={data.weekday}
        preview={data.preview}
        running={data.running}
        recent={data.recent}
        onSaveSetup={saveTrainingSetupAction}
        onStart={startWorkoutAction}
        onLog={logSetAction}
        onSubstitute={substituteAction}
        onFinish={finishWorkoutAction}
      />
    </div>
  );
}
