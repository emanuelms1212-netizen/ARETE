import type { Metadata } from 'next';
import { getCurrentUser } from '@/auth';
import { MindBoard } from '@/components/mind/mind-board';
import { EmptyState, PageHeader } from '@/components/ui';
import type { MindKind } from '@/domain';
import { withUser } from '@/persistence';
import {
  finishMindAction,
  pauseMindAction,
  resumeMindAction,
  setPackChosenAction,
  startMindAction,
} from './actions';

export const metadata: Metadata = { title: 'Mind' };

/** Per-user: which packs are chosen changes what this page may even list. */
export const dynamic = 'force-dynamic';

const KINDS: readonly MindKind[] = ['meditation', 'breathwork', 'cognitive'];

export default async function MindPage() {
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
    const practices = {} as Record<
      MindKind,
      Awaited<ReturnType<typeof repository.listMindPractices>>
    >;
    const running = {} as Record<
      MindKind,
      Awaited<ReturnType<typeof repository.getRunningMindSession>>
    >;

    for (const kind of KINDS) {
      // The repository does the pack filtering, so this page cannot
      // accidentally list a practice the account has not opted into.
      practices[kind] = await repository.listMindPractices(user.id, kind);
      running[kind] = await repository.getRunningMindSession(user.id, kind);
    }

    return {
      practices,
      running,
      packs: await repository.listMindPacks(user.id),
      history: await repository.listMindHistory(user.id, { limit: 20 }),
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mind"
        lede="Sit, breathe, or practise. Each one records what you actually did and nothing more."
      />

      <MindBoard
        practices={data.practices}
        packs={data.packs}
        running={data.running}
        history={data.history}
        onStart={startMindAction}
        onPause={pauseMindAction}
        onResume={resumeMindAction}
        onFinish={finishMindAction}
        onSetPack={setPackChosenAction}
      />
    </div>
  );
}
