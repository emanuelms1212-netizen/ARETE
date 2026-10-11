'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import {
  Button,
  FormField,
  SegmentedControl,
  Section,
  TextInput,
  TimerRing,
  useToast,
} from '@/components/ui';
import {
  FOCUS_PRESETS,
  countsAsFocus,
  describeLink,
  formatDuration,
  presetBySlug,
  timerView,
  type FocusSession as Session,
} from '@/domain';

/**
 * The Pomodoro, with its state on the server.
 *
 * The acceptance criterion for this stage is that a refresh does not lose the
 * timer, and the way to fail it is to keep a countdown in component state and
 * decrement it on an interval. This keeps no countdown at all: the server
 * holds when the current segment started and how many seconds earlier
 * segments banked, and `timerView` derives the rest from those and the current
 * instant.
 *
 * The interval below therefore does not count anything. It exists only to
 * re-render, once a second, so the derived number on screen stays fresh. Two
 * tabs, a reload, or a phone that slept for an hour all compute the same
 * answer from the same three facts.
 */
export interface FocusSessionPanelProps {
  readonly initialSession: Session | null;
  readonly tasks: readonly { readonly id: string; readonly title: string }[];
  readonly onStart: (input: {
    plannedMinutes: number;
    kind: 'work' | 'break';
    preset?: string | null;
    taskId?: string | null;
    /** Identifies this start attempt, so a retry of it is not a second start. */
    attemptToken: string;
  }) => Promise<Session>;
  readonly onPause: () => Promise<Session>;
  readonly onResume: () => Promise<Session>;
  readonly onFinish: (input: {
    status: 'completed' | 'abandoned';
    reflection?: string | null;
  }) => Promise<Session | null>;
}

export function FocusSessionPanel({
  initialSession,
  tasks,
  onStart,
  onPause,
  onResume,
  onFinish,
}: FocusSessionPanelProps) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [now, setNow] = useState(() => new Date());
  const [preset, setPreset] = useState<string>('classic');
  const [taskId, setTaskId] = useState<string>('');
  const [reflection, setReflection] = useState('');
  const [justFinished, setJustFinished] = useState<Session | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();
  const announced = useRef(false);

  // A re-render clock, not a countdown. Stopping it would freeze the display,
  // not the session.
  useEffect(() => {
    if (session === null || session.pausedAt !== null) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  const view = session === null ? null : timerView(session, now);

  // Announced through a live region rather than a sound alone: a chime is
  // useless to anyone who has the tab muted, and invisible to a screen reader.
  useEffect(() => {
    if (view === null || !view.isOvertime) {
      announced.current = false;
      return;
    }
    if (!announced.current) announced.current = true;
  }, [view]);

  function run<T>(work: () => Promise<T>, onDone: (value: T) => void, refusal: string) {
    start(async () => {
      try {
        onDone(await work());
      } catch {
        show(refusal, 'warn');
      }
    });
  }

  if (session === null) {
    const chosen = presetBySlug(preset) ?? FOCUS_PRESETS[0];

    return (
      <Section
        title="Focus"
        hint="One task, one block. The clock is kept on the server, so a reload does not lose it."
      >
        {justFinished === null ? null : (
          <div className="mb-4 rounded-md border border-line bg-sunken p-3">
            <p className="text-body-sm text-ink">
              {countsAsFocus(justFinished, now)
                ? `${formatDuration(justFinished.accumulatedSeconds)} on ${describeLink(justFinished)}.`
                : 'Too short to record as a session. No harm done.'}
            </p>
            {countsAsFocus(justFinished, now) ? (
              <form
                className="mt-2 flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setJustFinished(null);
                  setReflection('');
                }}
              >
                <div className="flex-1">
                  <FormField label="One line about it" hint="Optional.">
                    {({ id, describedBy }) => (
                      <TextInput
                        id={id}
                        aria-describedby={describedBy}
                        value={reflection}
                        onChange={(event) => setReflection(event.target.value)}
                      />
                    )}
                  </FormField>
                </div>
                <Button type="submit" variant="quiet">
                  Done
                </Button>
              </form>
            ) : null}
          </div>
        )}

        <div className="space-y-4">
          <SegmentedControl
            legend="How long"
            options={FOCUS_PRESETS.map((item) => ({
              value: item.slug,
              label: `${item.label} · ${item.workMinutes}m`,
            }))}
            value={preset}
            onChange={setPreset}
          />

          {tasks.length === 0 ? null : (
            <FormField label="On what?" hint="Optional, but it is what makes the history readable.">
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  value={taskId}
                  onChange={(event) => setTaskId(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink"
                >
                  <option value="">Nothing in particular</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}

          <Button
            loading={pending}
            onClick={() =>
              run(
                () =>
                  onStart({
                    plannedMinutes: chosen.workMinutes,
                    kind: 'work',
                    preset: chosen.slug,
                    taskId: taskId === '' ? null : taskId,
                    attemptToken: crypto.randomUUID(),
                  }),
                (started) => {
                  setSession(started);
                  setNow(new Date());
                },
                'Could not start the timer. Nothing is running.',
              )
            }
          >
            <PlayIcon size={16} /> Start {chosen.workMinutes} minutes
          </Button>
        </div>
      </Section>
    );
  }

  if (view === null) return null;

  return (
    <Section title={session.kind === 'break' ? 'Break' : 'Focus'} hint={describeLink(session)}>
      <div className="flex flex-col items-center py-2">
        <TimerRing
          progress={view.ratio}
          label={`${view.label}, ${formatDuration(view.remainingSeconds)} remaining`}
        >
          <span className="font-display text-display-1 font-semibold text-ink tabular-nums">
            {view.isOvertime
              ? `+${formatDuration(view.overtimeSeconds)}`
              : formatDuration(view.remainingSeconds)}
          </span>
          <span className="text-label tracking-[0.12em] text-ink-muted uppercase">
            {view.label}
          </span>
        </TimerRing>

        {/* The announcement, not a sound. */}
        <p role="status" aria-live="polite" className="sr-only">
          {view.isOvertime
            ? `Focus session complete. ${formatDuration(view.overtimeSeconds)} over.`
            : `${formatDuration(view.remainingSeconds)} remaining.`}
        </p>

        {view.isOvertime ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            The planned time is up. It keeps counting rather than stopping you mid-sentence.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {view.isPaused ? (
            <Button
              loading={pending}
              onClick={() => run(onResume, setSession, 'Could not resume. The timer is unchanged.')}
            >
              <PlayIcon size={16} /> Resume
            </Button>
          ) : (
            <Button
              variant="quiet"
              loading={pending}
              onClick={() => run(onPause, setSession, 'Could not pause. The timer is unchanged.')}
            >
              <PauseIcon size={16} /> Pause
            </Button>
          )}

          <Button
            loading={pending}
            onClick={() =>
              run(
                () => onFinish({ status: 'completed', reflection: null }),
                (finished) => {
                  setSession(null);
                  setJustFinished(finished);
                },
                'Could not finish the session. It is still running.',
              )
            }
          >
            Finish
          </Button>

          <Button
            variant="quiet"
            loading={pending}
            onClick={() =>
              run(
                () => onFinish({ status: 'abandoned', reflection: null }),
                (finished) => {
                  setSession(null);
                  setJustFinished(finished);
                },
                'Could not stop the session.',
              )
            }
          >
            Stop
          </Button>
        </div>

        <p className="mt-3 text-body-sm text-ink-muted">
          {formatDuration(view.elapsedSeconds)} of focus
          {session.interruptions === 0
            ? ''
            : ` · ${session.interruptions} ${session.interruptions === 1 ? 'pause' : 'pauses'}`}
        </p>
      </div>
    </Section>
  );
}
