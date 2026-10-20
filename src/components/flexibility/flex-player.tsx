'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import {
  Button,
  Dialog,
  FormField,
  SafetyNotice,
  SegmentedControl,
  Switch,
  TextArea,
  useToast,
  StopGuidance,
} from '@/components/ui';
import { MannequinPlayer } from '@/components/train/mannequin-player';
import { flexMovement } from '@/content/flexibility/hamstring';
import { animationFor } from '@/content/train/animations';
import {
  PAIN_RULE,
  templateFor,
  type FlexItemRecord,
  type FlexMovement,
  type FlexPrescription,
  type FlexProgram,
  type FlexSessionRecord,
  type WarmupChoice,
} from '@/domain';

/**
 * A flexibility session.
 *
 * Three parts, in order: the warm-up gate, the movements one at a time, and
 * the finish. The gate is a gate — the movements do not appear until the
 * warm-up is done or the person says they are already warm (straight after a
 * workout, which the source itself suggests). The pain exit is on screen the
 * whole time, because the moment it is needed is not the moment to look for it.
 *
 * Progress is saved after each movement, so a reload or a locked phone picks
 * up at the next one. Hold timers are local: losing the last twenty seconds
 * of a hold to a reload costs nothing worth persisting.
 */
type Result = { ok: true; value: FlexSessionRecord } | { ok: false; message: string };

export interface FlexPlayerProps {
  readonly program: FlexProgram;
  readonly session: FlexSessionRecord;
  /** Start every movement in its easier version (a flag, a long gap, or a stop last time). */
  readonly easierByDefault: boolean;
  readonly easierReason: string | null;
  readonly onUpdate: (patch: {
    sessionId: string;
    warmup?: WarmupChoice;
    items?: FlexItemRecord[];
    notes?: string | null;
  }) => Promise<Result>;
  readonly onFinish: (input: {
    sessionId: string;
    status: 'completed' | 'stopped';
    painNote?: string | null;
    notes?: string | null;
  }) => Promise<Result>;
  readonly onFinished: (record: FlexSessionRecord) => void;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function dose(item: FlexPrescription, movement: FlexMovement): string {
  const side = movement.perSide ? ' each side' : '';
  const amount = item.reps !== null ? `${item.reps} reps` : `${item.seconds} s`;
  return item.sets === 1 ? `${amount}${side}` : `${item.sets} × ${amount}${side}`;
}

function sidesFor(movement: FlexMovement): ('left' | 'right' | 'both')[] {
  return movement.perSide ? ['left', 'right'] : ['both'];
}

/** A countdown for one hold. Starts on request, can pause, says when it is done. */
function HoldTimer({
  seconds,
  onDone,
  label,
}: {
  seconds: number;
  onDone: () => void;
  label: string;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endsAt = useRef<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        if (!fired.current) {
          fired.current = true;
          onDone();
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, onDone]);

  return (
    <div className="flex items-center gap-3">
      <p
        role="timer"
        aria-label={label}
        className="font-display text-display-2 font-semibold tabular-nums text-ink"
      >
        {clock(remaining)}
      </p>
      <Button
        size="sm"
        variant={running ? 'quiet' : 'primary'}
        icon={running ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        onClick={() => {
          if (running) {
            setRunning(false);
          } else {
            endsAt.current = Date.now() + remaining * 1000;
            setRunning(true);
          }
        }}
      >
        {running ? 'Pause hold' : remaining === seconds ? 'Start hold' : 'Resume hold'}
      </Button>
    </div>
  );
}

function MovementStep({
  item,
  movement,
  index,
  total,
  recorded,
  easierByDefault,
  pending,
  onRecord,
}: {
  item: FlexPrescription;
  movement: FlexMovement;
  index: number;
  total: number;
  recorded: readonly FlexItemRecord[];
  easierByDefault: boolean;
  pending: boolean;
  onRecord: (record: FlexItemRecord) => void;
}) {
  const sides = sidesFor(movement);
  const isSaved = (candidate: string) =>
    recorded.some((entry) => entry.movementSlug === movement.slug && entry.side === candidate);
  const [side, setSide] = useState(
    () => sides.find((candidate) => !isSaved(candidate)) ?? sides[0]!,
  );
  const [setsDone, setSetsDone] = useState(0);
  const [intensity, setIntensity] = useState(4);
  const [easier, setEasier] = useState(easierByDefault);
  const sideSaved = isSaved(side);
  const animation = animationFor(movement.animation);
  const finished = setsDone >= item.sets;

  return (
    <section aria-labelledby="movement-title" className="space-y-4" data-testid="flex-movement">
      <div>
        <p className="text-label uppercase text-ink-muted">
          Movement {index + 1} of {total}
        </p>
        <h2 id="movement-title" className="font-display mt-1 text-display-3 font-semibold text-ink">
          {easier ? movement.easier.name : movement.name}
        </h2>
        <p className="mt-0.5 text-body-sm text-ink-muted">
          {dose(item, movement)}
          {easier ? ` · easier version of ${movement.name.toLowerCase()}` : ''}
        </p>
      </div>

      <Switch
        label={`Use the easier version: ${movement.easier.name}`}
        hint={movement.easier.how}
        checked={easier}
        onChange={setEasier}
      />

      {movement.endRange && !easier ? (
        <p className="rounded-md bg-sunken px-3 py-2 text-body-sm text-ink">
          A wide or deep end-range position. Go to where you feel mild tension and no further; the
          easier version is just as useful.
        </p>
      ) : null}

      {animation && !easier ? <MannequinPlayer animation={animation} /> : null}

      <details className="rounded-md border border-line p-3" open={!animation || easier}>
        <summary className="min-h-11 cursor-pointer text-body-sm font-medium text-ink">
          How to do it
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-body text-ink">
          {movement.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {easier ? (
          <p className="mt-2 text-body-sm text-ink">
            <span className="font-medium">Easier version:</span> {movement.easier.how}
          </p>
        ) : null}
        <p className="mt-2 text-body-sm text-ink-muted">{movement.cues.join(' ')}</p>
        <p className="mt-2 text-body-sm text-ink">
          <span className="font-medium">Common mistakes:</span> {movement.mistakes.join(' ')}
        </p>
        <p className="mt-2 text-body-sm text-warn">
          <span className="font-medium">Stop if:</span> {movement.stopIf.join(' ')}
        </p>
      </details>

      {sides.length > 1 ? (
        <SegmentedControl
          legend="Side"
          value={side}
          onChange={(next) => {
            setSide(next);
            setSetsDone(0);
          }}
          options={sides.map((value) => ({
            value,
            label: `${value === 'left' ? 'Left' : 'Right'}${isSaved(value) ? ' ✓' : ''}`,
          }))}
        />
      ) : null}

      <div className="rounded-lg border border-line bg-surface p-3">
        <p className="text-body-sm font-medium text-ink">
          {sides.length > 1 ? `${side === 'left' ? 'Left' : 'Right'} side · ` : ''}Set{' '}
          {Math.min(setsDone + 1, item.sets)} of {item.sets}
        </p>
        <div className="mt-2">
          {sideSaved ? (
            <p className="text-body-sm text-success">
              This side is saved. Switch to the other side.
            </p>
          ) : finished ? (
            <p className="text-body-sm text-success">All sets done.</p>
          ) : item.seconds !== null ? (
            <HoldTimer
              key={`${movement.slug}-${side}-${setsDone}`}
              seconds={item.seconds}
              label={`${movement.name} hold`}
              onDone={() => setSetsDone((count) => count + 1)}
            />
          ) : (
            <Button size="sm" disabled={pending} onClick={() => setSetsDone((count) => count + 1)}>
              Done {item.reps} reps
            </Button>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="intensity" className="block text-body-sm font-medium text-ink">
          How strong is the stretch? <span className="tabular-nums">{intensity}</span>/10
        </label>
        <input
          id="intensity"
          type="range"
          min={1}
          max={10}
          value={intensity}
          onChange={(event) => setIntensity(Number(event.target.value))}
          aria-describedby="intensity-hint"
          className="mt-1 w-full accent-[var(--color-accent)]"
        />
        <p
          id="intensity-hint"
          className={`text-body-sm ${intensity >= 8 ? 'text-warn' : 'text-ink-muted'}`}
        >
          {intensity >= 8
            ? 'That is more than this should feel. Ease off to mild tension, around 3 to 5.'
            : 'Mild tension, around 3 to 5, is the aim.'}
        </p>
      </div>

      <Button
        disabled={!finished || sideSaved}
        loading={pending}
        // The step remounts once the server has the record (its key includes
        // the record count), which is what moves on to the next side or
        // movement. Moving on locally first would let sets be counted against
        // a step that is about to be replaced.
        onClick={() => onRecord({ movementSlug: movement.slug, side, setsDone, easier, intensity })}
      >
        {sides.some((candidate) => candidate !== side && !isSaved(candidate))
          ? `Save the ${side} side, then the other`
          : 'Save and continue'}
      </Button>
    </section>
  );
}

export function FlexPlayer({
  program,
  session,
  easierByDefault,
  easierReason,
  onUpdate,
  onFinish,
  onFinished,
}: FlexPlayerProps) {
  const [record, setRecord] = useState(session);
  const [choice, setChoice] = useState<WarmupChoice>('standard');
  const [ticked, setTicked] = useState<string[]>([]);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [painOpen, setPainOpen] = useState(false);
  const [painNote, setPainNote] = useState('');
  const [pending, start] = useTransition();
  const { show } = useToast();

  const template = templateFor(program, record.week, record.day);
  if (!template) return null;

  function apply(result: Result, after?: (value: FlexSessionRecord) => void) {
    if (result.ok) {
      setRecord(result.value);
      after?.(result.value);
    } else show(result.message, 'warn');
  }

  function run(action: () => Promise<Result>, after?: (value: FlexSessionRecord) => void) {
    start(async () => {
      try {
        apply(await action(), after);
      } catch {
        show('Could not save that. Nothing was changed.', 'warn');
      }
    });
  }

  const nextIndex = template.items.findIndex((item) => {
    const movement = flexMovement(item.movementSlug)!;
    return sidesFor(movement).some(
      (side) =>
        !record.items.some(
          (entry) => entry.movementSlug === item.movementSlug && entry.side === side,
        ),
    );
  });

  const warmupItems = choice === 'no_impact' ? program.noImpactWarmup : program.warmup;

  return (
    <div className="space-y-4" data-testid="flex-player">
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-label uppercase text-ink-muted">In progress</p>
        <p className="font-display mt-1 text-display-3 font-semibold text-ink">
          Week {record.week}, session {record.day}
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">{PAIN_RULE.expected}</p>
        {easierReason ? <p className="mt-2 text-body-sm text-ink">{easierReason}</p> : null}
      </div>

      <Button
        variant="quiet"
        className="w-full border-warn text-warn"
        onClick={() => setPainOpen(true)}
      >
        Stop — sharp, radiating or worsening pain
      </Button>
      <StopGuidance module="flexibility" />

      {record.warmup === null ? (
        <section
          aria-labelledby="warmup-title"
          className="space-y-4 rounded-xl border border-line bg-surface p-4"
        >
          <h2 id="warmup-title" className="font-display text-display-3 font-semibold text-ink">
            Warm up first
          </h2>
          <p className="text-body-sm text-ink-muted">
            A few minutes of easy movement makes the stretches more comfortable. Two sets of each.
          </p>
          <SegmentedControl
            legend="Warm-up"
            hideLegend
            value={choice}
            onChange={(next) => {
              setChoice(next);
              setTicked([]);
            }}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'no_impact', label: 'No jumping' },
              { value: 'already_warm', label: 'Already warm' },
            ]}
          />
          {choice === 'already_warm' ? (
            <p className="text-body text-ink">
              Straight after a workout or a brisk walk, you are already warm. Go gently into the
              first movement.
            </p>
          ) : (
            <ul className="space-y-2">
              {warmupItems.map((item) => {
                const movement = flexMovement(item.movementSlug)!;
                const done = ticked.includes(item.movementSlug);
                return (
                  <li key={item.movementSlug}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line-strong px-3 py-2">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() =>
                          setTicked((current) =>
                            current.includes(item.movementSlug)
                              ? current.filter((slug) => slug !== item.movementSlug)
                              : [...current, item.movementSlug],
                          )
                        }
                        className="h-5 w-5 accent-[var(--color-accent)]"
                      />
                      <span className="text-body text-ink">
                        {movement.name}
                        <span className="block text-body-sm text-ink-muted">
                          {dose(item, movement)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <Button
            disabled={choice !== 'already_warm' && ticked.length < warmupItems.length}
            loading={pending}
            onClick={() => run(() => onUpdate({ sessionId: record.id, warmup: choice }))}
          >
            Warm-up done — start the session
          </Button>
        </section>
      ) : nextIndex >= 0 ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <MovementStep
            key={`${template.items[nextIndex]!.movementSlug}-${record.items.length}`}
            item={template.items[nextIndex]!}
            movement={flexMovement(template.items[nextIndex]!.movementSlug)!}
            index={nextIndex}
            total={template.items.length}
            recorded={record.items}
            easierByDefault={easierByDefault}
            pending={pending}
            onRecord={(entry) =>
              run(() => onUpdate({ sessionId: record.id, items: [...record.items, entry] }))
            }
          />
        </div>
      ) : (
        <section
          aria-labelledby="finish-title"
          className="space-y-4 rounded-xl border border-line bg-surface p-4"
        >
          <h2 id="finish-title" className="font-display text-display-3 font-semibold text-ink">
            That is the session
          </h2>
          <FormField label="Notes" hint="Optional. Which side felt tighter, what helped.">
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </FormField>
          <Button
            loading={pending}
            onClick={() =>
              run(
                () => onFinish({ sessionId: record.id, status: 'completed', notes }),
                (value) => onFinished(value),
              )
            }
          >
            Finish the session
          </Button>
        </section>
      )}

      <Dialog open={painOpen} onClose={() => setPainOpen(false)} title="Stop here">
        <div className="space-y-4">
          <SafetyNotice title="Pain ends the session">
            <p>{PAIN_RULE.stop}</p>
            <p className="mt-2">
              If it does not settle within a day, or it keeps coming back, see a physiotherapist or
              doctor. Next time, every movement starts in its easier version.
            </p>
          </SafetyNotice>
          <FormField label="Where and what kind of pain?" hint="Optional, for your own record.">
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                value={painNote}
                onChange={(event) => setPainNote(event.target.value)}
              />
            )}
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () => onFinish({ sessionId: record.id, status: 'stopped', painNote, notes }),
                  (value) => {
                    setPainOpen(false);
                    onFinished(value);
                  },
                )
              }
            >
              Stop the session
            </Button>
            <Button variant="quiet" onClick={() => setPainOpen(false)}>
              It was only mild tension
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
