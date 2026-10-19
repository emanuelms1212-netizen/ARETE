'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  Button,
  ChoiceList,
  ConfirmDialog,
  EmptyState,
  FormField,
  SafetyNotice,
  Section,
  SegmentedControl,
  Switch,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  CONTRAST_SCREENING_QUESTIONS,
  CONTRAST_STOP_LABEL,
  CONTRAST_STOP_REASONS,
  CONTRAST_TEMPERATURE_GUIDANCE,
  GENTLE_PROTOCOL,
  SOURCE_PROTOCOLS,
  afterStop,
  contrastPhases,
  contrastTotalSeconds,
  type ContrastEligibility,
  type ContrastProtocol,
  type ContrastQuestionId,
  type ContrastScreening,
  type ContrastSessionRecord,
  type ContrastStopReason,
} from '@/domain';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface ContrastActions {
  readonly saveScreening: (input: {
    screening: ContrastScreening;
    acknowledged: boolean;
  }) => Promise<Result<ContrastScreening>>;
  readonly record: (input: {
    protocol: ContrastProtocol;
    phasesCompleted: number;
    status: 'completed' | 'stopped';
    stopReason: ContrastStopReason | null;
    startedAt: string;
    attemptToken: string;
  }) => Promise<Result<ContrastSessionRecord>>;
  readonly disable: (input: { deleteSessions: boolean }) => Promise<Result<null>>;
}

export interface ContrastBoardProps {
  readonly screening: ContrastScreening | null;
  readonly eligibility: ContrastEligibility;
  readonly minor: boolean;
  readonly hints: Partial<Record<ContrastQuestionId, boolean>>;
  readonly sessions: readonly ContrastSessionRecord[];
  readonly actions: ContrastActions;
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const QUESTION_TEXT = Object.fromEntries(
  CONTRAST_SCREENING_QUESTIONS.map((question) => [question.id, question.text]),
) as Record<ContrastQuestionId, string>;

function Notice() {
  return (
    <SafetyNotice title="Before contrast therapy">
      <p>
        Moving between heat and cold puts real strain on the heart and blood pressure. It can cause
        fainting, an irregular heartbeat or a cold-shock gasp. This is an educational self-care
        tool, not medical advice or treatment.
      </p>
      <p>
        If any question below applies to you — heart or blood-pressure conditions, pregnancy,
        fainting, neuropathy, relevant medicines or temperature sensitivity — talk to a doctor
        before trying it.
      </p>
      <p>
        Never use cold water alone, never after alcohol, and stop at the first sign of dizziness,
        chest pain or breathlessness.
      </p>
    </SafetyNotice>
  );
}

function Screening({
  screening,
  hints,
  actions,
  onSaved,
}: Pick<ContrastBoardProps, 'screening' | 'hints' | 'actions'> & { onSaved: () => void }) {
  const [answers, setAnswers] = useState<Partial<Record<ContrastQuestionId, boolean>>>(
    () => screening?.answers ?? hints,
  );
  const [cleared, setCleared] = useState(screening?.clinicianCleared ?? false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();
  const anyYes = Object.values(answers).some(Boolean);

  return (
    <div className="space-y-4">
      <Notice />
      <Section
        title="Screening"
        hint="Every question needs an answer. Nothing is guessed from silence."
      >
        <div className="space-y-4">
          {CONTRAST_SCREENING_QUESTIONS.map((question) => (
            <div key={question.id}>
              {/* The visible question in sentence case; the group is named by the same words. */}
              <p aria-hidden="true" className="mb-1.5 text-body-sm text-ink">
                {question.text}
              </p>
              <SegmentedControl<'yes' | 'no' | ''>
                legend={question.text}
                hideLegend
                value={
                  answers[question.id] === undefined ? '' : answers[question.id] ? 'yes' : 'no'
                }
                onChange={(value) => setAnswers({ ...answers, [question.id]: value === 'yes' })}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
              />
            </div>
          ))}
          {anyYes ? (
            <Switch
              label="A doctor has cleared me for heat and cold exposure"
              hint="Only if that is true. Without it, the timer stays off."
              checked={cleared}
              onChange={setCleared}
            />
          ) : null}
          <Switch
            label="I have read the safety notice above"
            checked={acknowledged}
            onChange={setAcknowledged}
          />
          {error ? (
            <p role="alert" className="text-body-sm text-warn">
              {error}
            </p>
          ) : null}
          <Button
            loading={pending}
            onClick={() => {
              const missing = CONTRAST_SCREENING_QUESTIONS.some(
                (question) => answers[question.id] === undefined,
              );
              if (missing) {
                setError('Answer every question.');
                return;
              }
              setError(null);
              start(async () => {
                const result = await actions.saveScreening({
                  screening: {
                    answers: answers as Record<ContrastQuestionId, boolean>,
                    clinicianCleared: anyYes && cleared,
                  },
                  acknowledged,
                });
                if (!result.ok) setError(result.message);
                else {
                  show('Screening saved.', 'success');
                  onSaved();
                }
              });
            }}
          >
            Save my answers
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Runner({
  protocol,
  onFinish,
}: {
  protocol: ContrastProtocol;
  onFinish: (input: {
    phasesCompleted: number;
    status: 'completed' | 'stopped';
    stopReason: ContrastStopReason | null;
    startedAt: string;
  }) => void;
}) {
  const phases = contrastPhases(protocol);
  const total = phases.reduce((sum, entry) => sum + entry.seconds, 0);
  const [startMs] = useState(() => Date.now());
  const startedAt = useRef(new Date(startMs).toISOString());
  const [now, setNow] = useState(startMs);
  const [stopped, setStopped] = useState(false);
  const finished = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  // The clock is wall time since the start, so a slow tab or a backgrounded
  // phone never stretches a phase: the position is recomputed, not counted.
  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (!finished.current && (at - startMs) / 1000 >= total) {
        finished.current = true;
        clearInterval(timer);
        onFinishRef.current({
          phasesCompleted: phases.length,
          status: 'completed',
          stopReason: null,
          startedAt: startedAt.current,
        });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [stopped, startMs, total, phases.length]);

  let elapsed = (now - startMs) / 1000;
  let index = 0;
  while (index < phases.length - 1 && elapsed >= phases[index]!.seconds) {
    elapsed -= phases[index]!.seconds;
    index += 1;
  }
  const phase = phases[index];
  const remaining = phase ? phase.seconds - elapsed : 0;

  if (stopped) {
    return (
      <Section
        title="Stopped"
        hint="Stopping early is always the right call when something feels off."
      >
        <ChoiceList<ContrastStopReason>
          legend="What happened?"
          value={'other'}
          onChange={(reason) => {
            if (finished.current) return;
            finished.current = true;
            onFinish({
              phasesCompleted: index,
              status: 'stopped',
              stopReason: reason,
              startedAt: startedAt.current,
            });
          }}
          choices={CONTRAST_STOP_REASONS.filter((reason) => reason !== 'other').map((reason) => ({
            value: reason,
            label: CONTRAST_STOP_LABEL[reason],
          }))}
        />
        <Button
          className="mt-3"
          variant="quiet"
          onClick={() => {
            if (finished.current) return;
            finished.current = true;
            onFinish({
              phasesCompleted: index,
              status: 'stopped',
              stopReason: 'other',
              startedAt: startedAt.current,
            });
          }}
        >
          Something else
        </Button>
      </Section>
    );
  }

  if (!phase) return null;
  return (
    <section
      aria-labelledby="contrast-phase"
      className={`rounded-xl border-2 p-6 text-center ${phase.kind === 'heat' ? 'border-warn' : 'border-accent'}`}
      data-testid="contrast-runner"
    >
      <p className="text-label tracking-[0.08em] text-ink-muted uppercase">
        Round {phase.cycle} of {protocol.cycles}
      </p>
      <h2
        id="contrast-phase"
        className="font-display text-display-2 font-semibold text-ink"
        aria-live="polite"
      >
        {phase.kind === 'heat' ? 'Heat' : 'Cold'}
      </h2>
      <p
        className="font-display mt-2 text-display-1 font-semibold text-ink"
        role="timer"
        aria-label="Time left in this phase"
      >
        {clock(Math.max(0, remaining))}
      </p>
      <p className="mt-2 text-body-sm text-ink-muted">
        {phase.kind === 'heat'
          ? 'Leave the heat at once if you feel dizzy.'
          : 'Breathe slowly. Get out at once if you gasp, shake hard or feel faint.'}
      </p>
      <Button className="mt-6 w-full" onClick={() => setStopped(true)}>
        Stop now
      </Button>
    </section>
  );
}

function Session({ actions }: { actions: ContrastActions }) {
  const [protocol, setProtocol] = useState<ContrastProtocol>(GENTLE_PROTOCOL);
  const [noAlcohol, setNoAlcohol] = useState(false);
  const [notAlone, setNotAlone] = useState(false);
  const [running, setRunning] = useState(false);
  const [after, setAfter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const [, start] = useTransition();
  const { show } = useToast();

  const set = (key: keyof ContrastProtocol, value: number) =>
    setProtocol({ ...protocol, [key]: value });

  if (running) {
    return (
      <Runner
        protocol={protocol}
        onFinish={(outcome) => {
          setRunning(false);
          // Asked again before every session: they are about today, not about you.
          setNoAlcohol(false);
          setNotAlone(false);
          start(async () => {
            const result = await actions.record({ protocol, ...outcome, attemptToken: attempt });
            setAttempt(crypto.randomUUID());
            if (!result.ok) {
              setError(result.message);
              return;
            }
            if (outcome.status === 'completed') show('Session recorded.', 'success');
            setAfter(outcome.status === 'stopped' ? afterStop(outcome.stopReason) : null);
          });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {after ? (
        <SafetyNotice title="After stopping">
          <p data-testid="after-stop">{after}</p>
        </SafetyNotice>
      ) : null}
      <Section
        title="Your session"
        hint={`Starts gentle: about ${Math.round(contrastTotalSeconds(protocol) / 60)} minutes in all. Change it only within what feels comfortable.`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Heat (minutes)" hint="1–10">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  min={1}
                  max={10}
                  value={protocol.heatSeconds / 60}
                  onChange={(event) =>
                    set(
                      'heatSeconds',
                      Math.round(Math.min(10, Math.max(1, Number(event.target.value) || 1)) * 60),
                    )
                  }
                />
              )}
            </FormField>
            <FormField label="Cold (seconds)" hint="10–120">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  min={10}
                  max={120}
                  value={protocol.coldSeconds}
                  onChange={(event) =>
                    set(
                      'coldSeconds',
                      Math.round(Math.min(120, Math.max(10, Number(event.target.value) || 10))),
                    )
                  }
                />
              )}
            </FormField>
          </div>
          <SegmentedControl<string>
            legend="Rounds"
            value={String(protocol.cycles)}
            onChange={(value) => set('cycles', Number(value))}
            options={['1', '2', '3', '4'].map((value) => ({ value, label: value }))}
          />
          <SegmentedControl<'heat' | 'cold'>
            legend="Finish on"
            value={protocol.finishOn}
            onChange={(finishOn) => setProtocol({ ...protocol, finishOn })}
            options={[
              { value: 'heat', label: 'Heat (gentler)' },
              { value: 'cold', label: 'Cold' },
            ]}
          />
          <p className="text-body-sm text-ink-muted">{CONTRAST_TEMPERATURE_GUIDANCE}</p>
          <fieldset className="space-y-2">
            <legend className="text-body-sm font-medium text-ink">Before you start</legend>
            <Switch
              label="No alcohol in the last few hours"
              checked={noAlcohol}
              onChange={setNoAlcohol}
            />
            <Switch
              label="Someone else is nearby if I use cold water"
              checked={notAlone}
              onChange={setNotAlone}
            />
          </fieldset>
          {error ? (
            <p role="alert" className="text-body-sm text-warn">
              {error}
            </p>
          ) : null}
          <Button
            disabled={!noAlcohol || !notAlone}
            onClick={() => {
              setAfter(null);
              setError(null);
              setRunning(true);
            }}
          >
            Start the timer
          </Button>
        </div>
      </Section>
      <Section
        title="The source’s protocols, for reference"
        hint="Hotter, colder and longer than ARETE’s default. Not recommended as a starting point."
      >
        <div className="space-y-3">
          {SOURCE_PROTOCOLS.map((source) => (
            <div key={source.name} className="text-body-sm">
              <p className="font-medium text-ink">{source.name}</p>
              <p className="text-ink-muted">
                Heat {source.heat}; cold {source.cold}; rounds {source.cycles}.
              </p>
              <p className="text-ink-muted">{source.rationale}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function History({ sessions }: { sessions: readonly ContrastSessionRecord[] }) {
  if (sessions.length === 0) return null;
  return (
    <Section title="Recent sessions" hint="Never part of a streak or a programme day.">
      <ul className="space-y-1 text-body-sm">
        {sessions.slice(0, 10).map((session) => (
          <li key={session.id} className="flex justify-between gap-2">
            <span className="text-ink">{session.localDate}</span>
            <span className="text-ink-muted">
              {session.status === 'completed'
                ? `${session.protocol.cycles} rounds`
                : `Stopped: ${CONTRAST_STOP_LABEL[session.stopReason ?? 'other'].toLowerCase()}`}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ContrastBoard(props: ContrastBoardProps) {
  const [turningOff, setTurningOff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteSessions, setDeleteSessions] = useState(false);
  const [, start] = useTransition();
  const { show } = useToast();

  if (props.minor) {
    return (
      <EmptyState
        title="Not offered under 18"
        body="Contrast therapy carries real risk and is not offered to anyone under 18."
      />
    );
  }

  const needsScreening = props.eligibility.kind === 'refused' || editing;

  return (
    <div className="space-y-4">
      {needsScreening ? (
        <Screening
          screening={props.screening}
          hints={props.hints}
          actions={props.actions}
          onSaved={() => setEditing(false)}
        />
      ) : null}

      {!needsScreening && props.eligibility.kind === 'needs_clearance' ? (
        <SafetyNotice title="Talk to a doctor first">
          <p>You answered yes to:</p>
          <ul className="list-disc pl-5">
            {props.eligibility.flagged.map((id) => (
              <li key={id}>{QUESTION_TEXT[id]}</li>
            ))}
          </ul>
          <p>
            With any of these, heat and cold exposure needs a professional’s advice first. The timer
            stays off unless you tell ARETE a doctor has cleared you.
          </p>
          <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
            Update my answers
          </Button>
        </SafetyNotice>
      ) : null}

      {!needsScreening && props.eligibility.kind === 'ok' ? (
        <Session actions={props.actions} />
      ) : null}

      <History sessions={props.sessions} />

      {props.screening ? (
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
              Review my screening
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setTurningOff(true)}>
            Turn contrast therapy off
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={turningOff}
        title="Turn contrast therapy off?"
        description={
          <>
            <span className="block">
              Your screening answers are deleted and the timer disappears.
            </span>
            <label className="mt-3 flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={deleteSessions}
                onChange={(event) => setDeleteSessions(event.target.checked)}
              />
              Delete my session history too
            </label>
          </>
        }
        confirmLabel="Turn it off"
        onCancel={() => setTurningOff(false)}
        onConfirm={() =>
          start(async () => {
            const result = await props.actions.disable({ deleteSessions });
            setTurningOff(false);
            setEditing(false);
            if (result.ok) show('Contrast therapy is off.', 'success');
          })
        }
      />
    </div>
  );
}
