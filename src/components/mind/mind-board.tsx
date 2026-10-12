'use client';

import { useState, useTransition } from 'react';
import { Card, EmptyState, SegmentedControl, Section, Switch, useToast } from '@/components/ui';
import { TRANSFER_NOTE, type DrillItem, type MindKind, type MindSession } from '@/domain';
import type { MindHistoryEntry, MindPack, MindPractice } from '@/persistence/repository';
import { SessionPlayer } from './session-player';

/**
 * The Mind screen.
 *
 * Three modes, one player, and a packs list that is the visible half of the
 * rule in SOURCE_MAP §5. The packs list is deliberately neutral: it offers
 * what exists, says where each pack came from, and makes no suggestion about
 * which one anybody should want. Nothing about the user's name, language or
 * location influences what appears here, and a pack that has not been chosen
 * contributes no practices at all — not greyed-out ones.
 */
export interface MindBoardProps {
  readonly practices: Readonly<Record<MindKind, readonly MindPractice[]>>;
  readonly packs: readonly MindPack[];
  readonly running: Readonly<Record<MindKind, MindSession | null>>;
  readonly history: readonly MindHistoryEntry[];
  readonly onStart: (input: {
    kind: MindKind;
    practiceSlug: string;
    plannedMinutes?: number | null;
    plannedRounds?: number | null;
    attemptToken: string;
  }) => Promise<MindSession>;
  readonly onPause: (kind: MindKind) => Promise<MindSession>;
  readonly onResume: (kind: MindKind) => Promise<MindSession>;
  readonly onFinish: (input: {
    kind: MindKind;
    status: 'completed' | 'abandoned';
    rating?: number | null;
    reflection?: string | null;
    rounds?: number | null;
    items?: readonly DrillItem[];
  }) => Promise<MindSession | null>;
  readonly onSetPack: (input: { packSlug: string; chosen: boolean }) => Promise<void>;
}

const MODES: readonly { value: MindKind; label: string }[] = [
  { value: 'meditation', label: 'Meditate' },
  { value: 'breathwork', label: 'Breathe' },
  { value: 'cognitive', label: 'Practise' },
];

export function MindBoard({
  practices,
  packs,
  running,
  history,
  onStart,
  onPause,
  onResume,
  onFinish,
  onSetPack,
}: MindBoardProps) {
  // A reload should land back inside whatever was running, not on the default
  // tab. The running sessions come from the server, so this is the first
  // render's answer rather than something an effect corrects afterwards.
  const [mode, setMode] = useState<MindKind>(
    () => MODES.find((option) => running[option.value] !== null)?.value ?? 'meditation',
  );
  const [chosen, setChosen] = useState<MindPractice | null>(null);
  const [session, setSession] = useState<MindSession | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  // A session already running for this mode takes precedence: a reload should
  // land the user back inside it, not on the list.
  const active = session ?? running[mode];
  const activePractice =
    chosen ??
    (active === null
      ? null
      : (practices[mode].find((practice) => practice.slug === active.practiceSlug) ?? null));

  if (activePractice !== null) {
    return (
      <SessionPlayer
        kind={mode}
        practice={activePractice}
        session={active}
        onStart={async (input) => {
          const started = await onStart({
            kind: mode,
            practiceSlug: activePractice.slug,
            plannedMinutes: input.plannedMinutes ?? null,
            plannedRounds: input.plannedRounds ?? null,
            attemptToken: crypto.randomUUID(),
          });
          setSession(started);
        }}
        onPause={async () => setSession(await onPause(mode))}
        onResume={async () => setSession(await onResume(mode))}
        onFinish={async (input) => {
          await onFinish({ kind: mode, ...input });
          setSession(null);
        }}
        onBack={() => {
          setChosen(null);
          setSession(null);
        }}
      />
    );
  }

  const list = practices[mode];

  // History stores the slug, because a practice can be renamed and the record
  // of what someone did should not change with it. The title is looked up for
  // display, and the slug is the fallback when a practice has since gone.
  const titleFor = (slug: string): string => {
    for (const kind of MODES) {
      const match = practices[kind.value].find((practice) => practice.slug === slug);
      if (match !== undefined) return match.title;
    }
    return slug;
  };

  return (
    <div className="space-y-4">
      <SegmentedControl
        legend="Which kind of practice"
        hideLegend
        options={MODES}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setChosen(null);
          setSession(null);
        }}
      />

      {mode === 'cognitive' ? (
        <Card className="p-4">
          {/* Stated before any drill is offered, not after a result. */}
          <p className="text-body-sm text-ink-muted">{TRANSFER_NOTE}</p>
        </Card>
      ) : null}

      <Section
        title={mode === 'meditation' ? 'Practices' : mode === 'breathwork' ? 'Patterns' : 'Drills'}
        hint={
          mode === 'breathwork'
            ? 'All slow. Nothing here asks you to over-breathe.'
            : mode === 'cognitive'
              ? 'Rotating, so no single number comes to stand for the whole thing.'
              : undefined
        }
      >
        {list.length === 0 ? (
          <EmptyState title="Nothing here yet." body="Choose a pack below to add practices." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((practice) => (
              <li key={practice.slug}>
                <button
                  type="button"
                  onClick={() => setChosen(practice)}
                  className="flex w-full min-h-11 items-start justify-between gap-3 py-3 text-left hover:bg-sunken"
                >
                  <span className="min-w-0">
                    <span className="block text-body text-ink">{practice.title}</span>
                    <span className="block text-body-sm text-ink-muted">{practice.summary}</span>
                  </span>
                  <span className="shrink-0 text-body-sm text-ink-muted">
                    {practice.defaultMinutes === null ? '' : `${practice.defaultMinutes} min`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {mode === 'meditation' ? (
        <Section
          title="Packs"
          hint="Optional sets of practices. Nothing here is chosen for you, or suggested by anything about you."
        >
          <div className="space-y-3">
            {packs.map((pack) => (
              <div key={pack.slug}>
                <Switch
                  label={pack.title}
                  checked={pack.chosen}
                  onChange={(next) =>
                    start(async () => {
                      try {
                        await onSetPack({ packSlug: pack.slug, chosen: next });
                      } catch {
                        show('Could not change that pack.', 'warn');
                      }
                    })
                  }
                />
                {pack.provenanceNote === null ? null : (
                  <p className="mt-1 px-3 text-body-sm text-ink-muted">{pack.provenanceNote}</p>
                )}
              </div>
            ))}
            {pending ? <p className="sr-only">Saving…</p> : null}
          </div>
        </Section>
      ) : null}

      <Section title="Recently" hint="What you actually did.">
        {history.length === 0 ? (
          <EmptyState title="No sessions yet." body="They appear here once you have done one." />
        ) : (
          <ul className="divide-y divide-line">
            {history.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-body text-ink">{titleFor(entry.practiceSlug)}</span>
                  <span className="block text-body-sm text-ink-muted">
                    {entry.localDate}
                    {entry.status === 'abandoned' ? ' · stopped early' : ''}
                    {entry.itemsAttempted === null
                      ? ''
                      : ` · ${entry.itemsCorrect} of ${entry.itemsAttempted} at this drill`}
                  </span>
                </span>
                <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">
                  {entry.minutes} min
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
