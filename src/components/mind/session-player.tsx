'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import {
  Button,
  Card,
  FormField,
  SafetyNotice,
  SegmentedControl,
  TextInput,
  TimerRing,
  useToast,
} from '@/components/ui';
import {
  BREATHWORK_SAFETY,
  RATING_LABELS,
  breathPracticeBySlug,
  describeOutcome,
  formatDuration,
  playerView,
  type Drill,
  type DrillItem,
  type MindKind,
  type MindSession,
} from '@/domain';
import type { MindPractice } from '@/persistence/repository';
import { BreathOrb } from './breath-orb';
import { DrillRunner } from './drill-runner';

/**
 * One player, three modes.
 *
 * The brief asks for a consistent session player: preparation, instruction,
 * timer and progress, pause and exit, completion rating, notes, history. This
 * is that, and the mode-specific parts are three small branches rather than
 * three screens — which is what stops meditation and breathwork drifting into
 * different ideas of what "pause" means.
 *
 * Like the focus timer, the clock is derived. The interval below re-renders;
 * it does not count. That is what makes the session survive backgrounding,
 * which is one of this stage's acceptance criteria.
 */
export interface SessionPlayerProps {
  readonly kind: MindKind;
  readonly practice: MindPractice;
  readonly session: MindSession | null;
  readonly onStart: (input: {
    plannedMinutes?: number | null;
    plannedRounds?: number | null;
  }) => Promise<void>;
  readonly onPause: () => Promise<void>;
  readonly onResume: () => Promise<void>;
  readonly onFinish: (input: {
    status: 'completed' | 'abandoned';
    rating?: number | null;
    reflection?: string | null;
    rounds?: number | null;
    items?: readonly DrillItem[];
  }) => Promise<void>;
  readonly onBack: () => void;
}

/**
 * Tracks the OS reduced-motion preference, live.
 *
 * `matchMedia` is an external store, so this subscribes to it rather than
 * mirroring it into state from an effect — which would cascade a render on
 * mount and is what the lint rule is objecting to. The server snapshot is
 * `false` because the server cannot know, and motion-on is the safe default
 * to hydrate from: the first client render corrects it before anything moves.
 */
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToMotion(onChange: () => void): () => void {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

export function SessionPlayer({
  kind,
  practice,
  session,
  onStart,
  onPause,
  onResume,
  onFinish,
  onBack,
}: SessionPlayerProps) {
  const [now, setNow] = useState(() => new Date());
  const [minutes, setMinutes] = useState(practice.defaultMinutes ?? 10);
  const [rounds, setRounds] = useState(
    () => breathPracticeBySlug(practice.slug)?.defaultRounds ?? 8,
  );
  const [rating, setRating] = useState<number | null>(null);
  const [reflection, setReflection] = useState('');
  const [finished, setFinished] = useState<MindSession | null>(null);
  const [pending, start] = useTransition();
  const reducedMotion = useReducedMotion();
  const { show } = useToast();
  const liveRegion = useRef<HTMLParagraphElement>(null);

  const view = playerView(session, now);
  const isRunning = session !== null && session.status === 'running';

  // Derived from the session's own id, so the same session always generates
  // the same items — a reload must not reshuffle the questions mid-drill.
  const drillSeed = useMemo(() => {
    const id = session?.id ?? practice.slug;
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return hash;
  }, [session?.id, practice.slug]);

  useEffect(() => {
    if (!isRunning || (session?.pausedAt ?? null) !== null) return;
    const id = window.setInterval(() => setNow(new Date()), 500);
    return () => window.clearInterval(id);
  }, [isRunning, session?.pausedAt]);

  function run(work: () => Promise<void>, refusal: string) {
    start(async () => {
      try {
        await work();
      } catch {
        show(refusal, 'warn');
      }
    });
  }

  // ---- Finished: rating and a note ----------------------------------------
  if (finished !== null) {
    return (
      <Card className="p-5">
        <h2 className="font-display text-display-2 font-semibold text-ink">{practice.title}</h2>
        <p className="mt-1 text-body text-ink-muted">{describeOutcome(finished, now)}</p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFinished(null);
            setRating(null);
            setReflection('');
            onBack();
          }}
        >
          {/* How it went, not how well it was done. */}
          <SegmentedControl
            legend="How was it?"
            options={[1, 2, 3, 4, 5].map((value) => ({
              value: String(value),
              label: RATING_LABELS[value as 1 | 2 | 3 | 4 | 5],
            }))}
            value={rating === null ? '' : String(rating)}
            onChange={(value) => setRating(Number(value))}
          />

          <FormField label="A line about it" hint="Optional, and only for you.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={reflection}
                onChange={(event) => setReflection(event.target.value)}
              />
            )}
          </FormField>

          <div className="flex gap-2">
            <Button
              type="button"
              loading={pending}
              onClick={() =>
                run(async () => {
                  await onFinish({
                    status: 'completed',
                    rating,
                    reflection: reflection.trim() || null,
                  });
                  setFinished(null);
                  setRating(null);
                  setReflection('');
                  onBack();
                }, 'Could not save that. The session was still recorded.')
              }
            >
              Save
            </Button>
            <Button type="submit" variant="quiet">
              Skip
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  // ---- Preparation ---------------------------------------------------------
  if (session === null) {
    return (
      <Card className="p-5">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 text-body-sm text-ink-muted hover:text-ink"
        >
          ← All practices
        </button>

        <h2 className="font-display mt-2 text-display-2 font-semibold text-ink">
          {practice.title}
        </h2>
        <p className="mt-1 text-body text-ink-muted">{practice.summary}</p>

        {practice.steps.length === 0 ? null : (
          <ol className="mt-4 space-y-2 border-t border-line pt-4">
            {practice.steps.map((step, index) => (
              <li key={step.label} className="flex gap-3">
                <span className="text-body-sm text-ink-muted tabular-nums">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-body text-ink">{step.label}</span>
                  {step.say === undefined ? null : (
                    <span className="block text-body-sm text-ink-muted">{step.say}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}

        {practice.provenanceNote === null ? null : (
          <p className="mt-4 rounded-md border border-line bg-sunken p-3 text-body-sm text-ink-muted">
            {practice.provenanceNote}
          </p>
        )}

        {kind === 'breathwork' ? (
          <div className="mt-4">
            {/* On the screen where the decision is made, not behind a link. */}
            <SafetyNotice title="Before you start">
              <ul className="space-y-1">
                {BREATHWORK_SAFETY.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </SafetyNotice>
          </div>
        ) : null}

        <div className="mt-5 space-y-4 border-t border-line pt-4">
          {kind === 'meditation' ? (
            <FormField label="How long?" hint="Change it whenever. Five minutes is a real session.">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="range"
                  min={practice.minMinutes ?? 5}
                  max={practice.maxMinutes ?? 25}
                  step={1}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                  className="h-11 w-full accent-[var(--c-accent)]"
                />
              )}
            </FormField>
          ) : null}

          {kind === 'breathwork' ? (
            <FormField label="How many rounds?">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="range"
                  min={3}
                  max={20}
                  step={1}
                  value={rounds}
                  onChange={(event) => setRounds(Number(event.target.value))}
                  className="h-11 w-full accent-[var(--c-accent)]"
                />
              )}
            </FormField>
          ) : null}

          <Button
            loading={pending}
            onClick={() =>
              run(
                () =>
                  onStart({
                    plannedMinutes: kind === 'meditation' ? minutes : null,
                    plannedRounds: kind === 'breathwork' ? rounds : null,
                  }),
                'Could not start the session.',
              )
            }
          >
            <PlayIcon size={16} />
            {kind === 'meditation'
              ? `Begin ${minutes} minutes`
              : kind === 'breathwork'
                ? `Begin ${rounds} rounds`
                : 'Begin'}
          </Button>
        </div>
      </Card>
    );
  }

  // ---- Running a drill -----------------------------------------------------
  //
  // A drill is not a timer: it ends when the items run out, and what it
  // records is the per-item detail. So the runner replaces the ring rather
  // than sitting beside it.
  if (kind === 'cognitive' && practice.drill !== null) {
    return (
      <DrillRunner
        drill={practice.drill as Drill}
        // Stable for the day and the practice, so a reload resumes the same
        // items rather than silently swapping the questions.
        seed={drillSeed}
        itemCount={12}
        onComplete={(items) =>
          run(async () => {
            await onFinish({ status: 'completed', items });
            onBack();
          }, 'Could not save that session.')
        }
        onCancel={() =>
          run(async () => {
            await onFinish({ status: 'abandoned' });
            onBack();
          }, 'Could not end that session.')
        }
      />
    );
  }

  // ---- Running -------------------------------------------------------------
  const breathPattern = practice.pattern;
  const plannedRounds = rounds;

  return (
    <Card className="p-5">
      <div className="flex flex-col items-center">
        <p className="text-label tracking-[0.12em] text-ink-muted uppercase">{practice.title}</p>

        {kind === 'breathwork' && breathPattern !== null ? (
          <div className="mt-4">
            <BreathOrb
              pattern={{
                inhale: breathPattern['inhale'] ?? 4,
                holdIn: breathPattern['holdIn'] ?? 0,
                exhale: breathPattern['exhale'] ?? 6,
                holdOut: breathPattern['holdOut'] ?? 0,
              }}
              elapsedSeconds={view.elapsedSeconds}
              rounds={plannedRounds}
              reducedMotion={reducedMotion}
            />
          </div>
        ) : (
          <div className="mt-4">
            <TimerRing
              progress={view.ratio}
              label={`${view.label}, ${formatDuration(view.remainingSeconds ?? view.elapsedSeconds)}`}
            >
              <span className="font-display text-display-1 font-semibold text-ink tabular-nums">
                {formatDuration(view.remainingSeconds ?? view.elapsedSeconds)}
              </span>
              <span className="text-label tracking-[0.12em] text-ink-muted uppercase">
                {view.label}
              </span>
            </TimerRing>
          </div>
        )}

        <p ref={liveRegion} role="status" aria-live="polite" className="sr-only">
          {view.stage === 'paused' ? 'Paused.' : null}
        </p>

        {view.isOverrun ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            Past the time you set. It keeps going until you stop it.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {view.stage === 'paused' ? (
            <Button loading={pending} onClick={() => run(onResume, 'Could not resume.')}>
              <PlayIcon size={16} /> Resume
            </Button>
          ) : (
            <Button
              variant="quiet"
              loading={pending}
              onClick={() => run(onPause, 'Could not pause.')}
            >
              <PauseIcon size={16} /> Pause
            </Button>
          )}

          <Button
            loading={pending}
            onClick={() =>
              run(async () => {
                setFinished(session);
                await onFinish({
                  status: 'completed',
                  rounds: kind === 'breathwork' ? plannedRounds : null,
                });
              }, 'Could not finish the session.')
            }
          >
            Finish
          </Button>

          {/* Leaving early is a first-class exit, labelled as one. */}
          <Button
            variant="quiet"
            loading={pending}
            onClick={() =>
              run(async () => {
                setFinished(session);
                await onFinish({ status: 'abandoned' });
              }, 'Could not end the session.')
            }
          >
            Stop here
          </Button>
        </div>

        <p className="mt-3 text-body-sm text-ink-muted">
          {formatDuration(view.elapsedSeconds)} so far
        </p>
      </div>
    </Card>
  );
}
