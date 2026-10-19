'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  ChoiceChips,
  ConfirmDialog,
  Dialog,
  EmptyState,
  FormField,
  SafetyNotice,
  Section,
  TextInput,
  useToast,
} from '@/components/ui';
import { flexMovement } from '@/content/flexibility/hamstring';
import {
  FLEX_DISCLAIMER,
  PAIN_RULE,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  formatLocalDate,
  checkinNeedsGuidance,
  compareCheckins,
  mondayFirst,
  sessionKey,
  type Checkin,
  type FlexEligibility,
  type FlexEnrolment,
  type FlexItemRecord,
  type FlexProgram,
  type FlexProgramState,
  type FlexSessionRecord,
  type RightsStatus,
  type StoredCheckin,
  type WarmupChoice,
} from '@/domain';
import { CheckinForm } from './checkin-form';
import { FlexPlayer } from './flex-player';

/**
 * The Flexibility screen.
 *
 * What it shows follows from what exists: no programme on offer, a reason not
 * to start, the start itself, a running session, or the programme in
 * progress. Each state is a real one the server computed; none is a mode the
 * client invents.
 */
type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface FlexBoardProps {
  readonly program: FlexProgram | null;
  readonly rightsStatus: RightsStatus | null;
  readonly eligibility: FlexEligibility;
  readonly enrolment: FlexEnrolment | null;
  readonly sessions: readonly FlexSessionRecord[];
  readonly checkins: readonly StoredCheckin[];
  readonly running: FlexSessionRecord | null;
  readonly state: FlexProgramState | null;
  readonly checkinDue: number | null;
  readonly afterPain: boolean;
  readonly today: string;
  readonly onEnrol: (input: {
    weekdays: number[];
    baseline: Checkin | null;
  }) => Promise<Result<FlexEnrolment>>;
  readonly onSchedule: (weekdays: number[]) => Promise<Result<FlexEnrolment>>;
  readonly onStart: (input: {
    week: number;
    day: number;
    attemptToken: string;
  }) => Promise<Result<FlexSessionRecord>>;
  readonly onUpdate: (input: {
    sessionId: string;
    warmup?: WarmupChoice;
    items?: FlexItemRecord[];
    notes?: string | null;
  }) => Promise<Result<FlexSessionRecord>>;
  readonly onFinish: (input: {
    sessionId: string;
    status: 'completed' | 'stopped';
    painNote?: string | null;
    notes?: string | null;
  }) => Promise<Result<FlexSessionRecord>>;
  readonly onSkip: (input: {
    week: number;
    day: number;
    reason: string;
  }) => Promise<Result<FlexSessionRecord>>;
  readonly onCheckin: (checkin: Checkin) => Promise<Result<StoredCheckin>>;
  readonly onEnd: () => Promise<Result<FlexEnrolment>>;
}

const WEEK = mondayFirst([0, 1, 2, 3, 4, 5, 6]);
const dayChoices = WEEK.map((day) => ({ value: String(day), label: WEEKDAY_SHORT[day]! }));

function formatDate(iso: string, today: string): string {
  if (iso === today) return 'today';
  const date = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAY_NAMES[date.getUTCDay()]} ${formatLocalDate(iso, 'short').split(' ').slice(1).join(' ')}`;
}

function Provenance({
  program,
  rightsStatus,
}: {
  program: FlexProgram;
  rightsStatus: RightsStatus | null;
}) {
  return (
    <p className="text-body-sm text-ink-muted">
      <span className="font-medium text-ink">Source:</span> {program.provenance.note} (
      {program.provenance.filename})
      {rightsStatus === 'pending' ? (
        <span className="mt-1 block text-warn">
          Shown in demo mode only: permission to use this structure has not been confirmed yet.
        </span>
      ) : null}
    </p>
  );
}

function Enrol({
  program,
  eligibility,
  onEnrol,
}: Pick<FlexBoardProps, 'onEnrol' | 'eligibility'> & { program: FlexProgram }) {
  const [days, setDays] = useState<string[]>(['1', '3', '5']);
  const [step, setStep] = useState<'days' | 'baseline'>('days');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  async function enrol(baseline: Checkin | null): Promise<string | null> {
    const result = await onEnrol({ weekdays: days.map(Number), baseline });
    if (!result.ok) return result.message;
    show(baseline ? 'Programme started, baseline saved.' : 'Programme started.', 'success');
    return null;
  }

  return (
    <Section
      title={program.title}
      hint={`${program.weeks} weeks · ${program.sessionsPerWeek} sessions a week · about ${program.minutes} min each`}
    >
      <div className="space-y-4">
        <p className="text-body text-ink">{program.summary}</p>
        {eligibility.kind === 'gentle' ? (
          <SafetyNotice title="Starting gently">
            <p>{eligibility.message}</p>
          </SafetyNotice>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink">
          <li>{PAIN_RULE.expected}</li>
          <li>{PAIN_RULE.stop}</li>
          <li>{PAIN_RULE.injury}</li>
        </ul>
        <p className="text-body-sm text-ink-muted">{FLEX_DISCLAIMER}</p>

        {step === 'days' ? (
          <div className="space-y-3">
            <ChoiceChips
              legend="Which three days suit you?"
              choices={dayChoices}
              selected={days}
              onChange={setDays}
            />
            <p className="text-body-sm text-ink-muted">
              These are suggestions. Any three days in a week count, in any order, and a missed day
              just moves to the next one.
            </p>
            {error ? (
              <p role="alert" className="text-body-sm text-warn">
                {error}
              </p>
            ) : null}
            <Button
              onClick={() => {
                if (days.length !== 3) {
                  setError('Pick three days.');
                  return;
                }
                setError(null);
                setStep('baseline');
              }}
            >
              Next: a quick baseline
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-body font-semibold text-ink">Baseline check-in</h3>
            <p className="text-body-sm text-ink-muted">
              Two minutes now gives you something to compare against in a week. You can also do it
              later.
            </p>
            <CheckinForm
              week={0}
              submitLabel="Save and start the programme"
              successMessage={null}
              onSave={(checkin) => enrol(checkin)}
              onSkip={() =>
                start(async () => {
                  try {
                    const message = await enrol(null);
                    if (message) show(message, 'warn');
                  } catch {
                    show('Could not start the programme. Nothing was saved.', 'warn');
                  }
                })
              }
            />
            {pending ? <p className="text-body-sm text-ink-muted">Starting…</p> : null}
          </div>
        )}
      </div>
    </Section>
  );
}

function Comparison({ checkins }: { checkins: readonly StoredCheckin[] }) {
  const baseline = checkins.find((entry) => entry.week === 0) ?? checkins[0];
  const latest = checkins.at(-1);
  if (!baseline || !latest || baseline === latest) {
    return (
      <p className="text-body-sm text-ink-muted">
        After your next check-in, this shows what has moved since the{' '}
        {baseline ? 'baseline' : 'first one'}.
      </p>
    );
  }
  const changes = compareCheckins(baseline, latest);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <caption className="sr-only">
          {baseline.week === 0 ? 'Baseline' : `Week ${baseline.week}`} compared with week{' '}
          {latest.week}
        </caption>
        <thead className="text-ink-muted">
          <tr>
            <th scope="col" className="py-1.5 pr-2 font-medium">
              Measure
            </th>
            <th scope="col" className="py-1.5 pr-2 font-medium">
              {baseline.week === 0 ? 'Baseline' : `Week ${baseline.week}`}
            </th>
            <th scope="col" className="py-1.5 pr-2 font-medium">
              Week {latest.week}
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {changes.map((change) => (
            <tr key={change.measure}>
              <th scope="row" className="py-1.5 pr-2 font-normal text-ink">
                {change.measure}
              </th>
              <td className="py-1.5 pr-2 text-ink">{change.from}</td>
              <td className="py-1.5 pr-2 text-ink">{change.to}</td>
              <td className="py-1.5 text-ink-muted">{change.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlexBoard(props: FlexBoardProps) {
  const { program, enrolment, state, eligibility, today } = props;
  const [running, setRunning] = useState<FlexSessionRecord | null>(props.running);
  const [finished, setFinished] = useState<FlexSessionRecord | null>(null);
  const [skipping, setSkipping] = useState<{ week: number; day: number } | null>(null);
  const [reason, setReason] = useState('');
  const [editingDays, setEditingDays] = useState(false);
  const [days, setDays] = useState<string[]>((enrolment?.weekdays ?? [1, 3, 5]).map(String));
  const [ending, setEnding] = useState(false);
  const [pending, start] = useTransition();
  const { show } = useToast();

  function act<T>(action: () => Promise<Result<T>>, success?: string, after?: (value: T) => void) {
    start(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (success) show(success, 'success');
          after?.(result.value);
        } else show(result.message, 'warn');
      } catch {
        show('Could not save that. Nothing was changed.', 'warn');
      }
    });
  }

  if (!program) {
    return (
      <EmptyState
        title="No flexibility programme is available yet."
        body="The hamstring programme is waiting on a content-rights decision before it can be offered outside demo mode."
      />
    );
  }

  if (eligibility.kind === 'professional') {
    return (
      <SafetyNotice title="Please get this looked at first">
        <p>{eligibility.message}</p>
        <p className="mt-2">If your flags have changed, update them under Train → Edit setup.</p>
      </SafetyNotice>
    );
  }

  if (running) {
    const easierReason = props.afterPain
      ? 'Last time stopped for pain, so every movement starts in its easier version.'
      : state?.easeBackIn
        ? 'It has been a while, so every movement starts in its easier version.'
        : eligibility.kind === 'gentle'
          ? eligibility.message
          : null;
    return (
      <div className="space-y-4">
        <FlexPlayer
          program={program}
          session={running}
          easierByDefault={easierReason !== null}
          easierReason={easierReason}
          onUpdate={props.onUpdate}
          onFinish={props.onFinish}
          onFinished={(record) => {
            setRunning(null);
            setFinished(record);
          }}
        />
        <Provenance program={program} rightsStatus={props.rightsStatus} />
      </div>
    );
  }

  if (!enrolment || !state) {
    return (
      <div className="space-y-4">
        <Enrol program={program} eligibility={eligibility} onEnrol={props.onEnrol} />
        <Provenance program={program} rightsStatus={props.rightsStatus} />
      </div>
    );
  }

  const weekSessions = program.sessions.filter((session) => session.week === state.currentWeek);
  const recordFor = (week: number, day: number) =>
    [...props.sessions]
      .reverse()
      .find((entry) => entry.week === week && entry.day === day && entry.status !== 'running');

  return (
    <div className="space-y-4">
      {finished ? (
        <Section title={finished.status === 'stopped' ? 'Session stopped' : 'Session saved'}>
          <p className="text-body text-ink" data-testid="flex-summary">
            {finished.status === 'stopped'
              ? 'Stopped for pain, and recorded as such. The session stays open to try again, and next time starts with the easier versions. If the pain does not settle, see a physiotherapist.'
              : `Week ${finished.week}, session ${finished.day} done.`}
          </p>
          <Button variant="quiet" size="sm" className="mt-3" onClick={() => setFinished(null)}>
            Close
          </Button>
        </Section>
      ) : null}

      <Section
        title={
          state.finished ? 'Programme complete' : `Week ${state.currentWeek} of ${program.weeks}`
        }
        hint={`${state.completed} of ${state.total} sessions done${state.skipped > 0 ? ` · ${state.skipped} skipped` : ''}`}
      >
        <div className="space-y-4">
          <div
            className="h-2 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-label="Sessions done"
            aria-valuemin={0}
            aria-valuemax={state.total}
            aria-valuenow={state.completed + state.skipped}
          >
            <div
              className="h-full bg-accent"
              style={{ width: `${((state.completed + state.skipped) / state.total) * 100}%` }}
            />
          </div>
          {state.message ? <p className="text-body text-ink">{state.message}</p> : null}

          {state.finished ? (
            <div className="space-y-3">
              <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink">
                {program.maintenance.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Button variant="quiet" onClick={() => setEnding(true)}>
                Finish and start again
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {weekSessions.map((session) => {
                const key = sessionKey(session.week, session.day);
                const closed = state.closedKeys.includes(key);
                const record = recordFor(session.week, session.day);
                const planned = state.open.find((entry) => entry.template.day === session.day);
                return (
                  <li
                    key={key}
                    className="rounded-lg border border-line p-3"
                    data-testid={`flex-session-${key}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-body font-semibold text-ink">Session {session.day}</h3>
                        <p className="mt-0.5 text-body-sm text-ink-muted">
                          {session.items
                            .map((item) => flexMovement(item.movementSlug)?.name)
                            .join(' · ')}
                        </p>
                        <p className="mt-1 text-body-sm text-ink">
                          {closed
                            ? record?.status === 'skipped'
                              ? `Skipped — ${record.skipReason}`
                              : `Done${record ? ` ${formatDate(record.localDate, today)}` : ''}`
                            : record?.status === 'stopped'
                              ? 'Stopped for pain last time — open to try again, gently'
                              : planned
                                ? `Suggested for ${formatDate(planned.suggestedDate, today)}`
                                : null}
                        </p>
                      </div>
                    </div>
                    {!closed ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          loading={pending}
                          onClick={() =>
                            act(
                              () =>
                                props.onStart({
                                  week: session.week,
                                  day: session.day,
                                  attemptToken: crypto.randomUUID(),
                                }),
                              undefined,
                              (value) => setRunning(value),
                            )
                          }
                        >
                          Start session {session.day}
                        </Button>
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => {
                            setReason('');
                            setSkipping({ week: session.week, day: session.day });
                          }}
                        >
                          Skip
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {props.checkinDue !== null ? (
        <Section
          title={props.checkinDue === 0 ? 'Baseline check-in' : `Week ${props.checkinDue} check-in`}
          hint="Six quick questions about range and everyday movement."
        >
          <CheckinForm
            week={props.checkinDue}
            onSave={async (checkin) => {
              const result = await props.onCheckin(checkin);
              if (!result.ok) return result.message;
              if (checkinNeedsGuidance(checkin)) {
                show(
                  'Saved. With more than mild pain, please see a physiotherapist before carrying on.',
                  'warn',
                );
              }
              return null;
            }}
          />
        </Section>
      ) : null}

      <Section
        title="How it is going"
        hint="Your own reports, compared measure by measure. No score."
      >
        <Comparison checkins={props.checkins} />
        {props.checkins.length > 0 ? (
          <p className="mt-3 text-body-sm text-ink-muted">
            Check-ins so far:{' '}
            {props.checkins
              .map((entry) => (entry.week === 0 ? 'baseline' : `week ${entry.week}`))
              .join(', ')}
            .
          </p>
        ) : null}
      </Section>

      <Section
        title="Your days"
        hint={enrolment.weekdays.map((day) => WEEKDAY_NAMES[day]).join(', ')}
        action={
          editingDays ? null : (
            <Button size="sm" variant="ghost" onClick={() => setEditingDays(true)}>
              Change days
            </Button>
          )
        }
      >
        {editingDays ? (
          <div className="space-y-3">
            <ChoiceChips
              legend="Which three days suit you?"
              choices={dayChoices}
              selected={days}
              onChange={setDays}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                loading={pending}
                onClick={() => {
                  if (days.length !== 3) {
                    show('Pick three days.', 'warn');
                    return;
                  }
                  act(
                    () => props.onSchedule(days.map(Number)),
                    'Days updated.',
                    () => setEditingDays(false),
                  );
                }}
              >
                Save days
              </Button>
              <Button variant="quiet" onClick={() => setEditingDays(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Suggestions only. Any three days in a week count.
          </p>
        )}
        {!state.finished ? (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setEnding(true)}>
            End the programme
          </Button>
        ) : null}
      </Section>

      <Provenance program={program} rightsStatus={props.rightsStatus} />

      <Dialog
        open={skipping !== null}
        onClose={() => setSkipping(null)}
        title={skipping ? `Skip session ${skipping.day}?` : ''}
        description="A skip closes the session so the programme can move on. It is not counted against you."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const target = skipping;
            if (!target || reason.trim().length === 0) return;
            setSkipping(null);
            act(() => props.onSkip({ ...target, reason }), 'Skipped. The programme moves on.');
          }}
        >
          <FormField label="What got in the way?">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Away for the weekend"
              />
            )}
          </FormField>
          <div className="flex gap-2">
            <Button type="submit">Skip it</Button>
            <Button type="button" variant="quiet" onClick={() => setSkipping(null)}>
              Keep it
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={ending}
        title={state.finished ? 'Finish this programme?' : 'End the programme?'}
        description={
          state.finished
            ? 'Your sessions and check-ins are kept. You can start the four weeks again straight away.'
            : 'Your sessions and check-ins are kept. You can start again from week one whenever you like.'
        }
        confirmLabel={state.finished ? 'Finish' : 'End the programme'}
        onCancel={() => setEnding(false)}
        onConfirm={() => {
          setEnding(false);
          act(() => props.onEnd(), state.finished ? 'Programme finished.' : 'Programme ended.');
        }}
      />
    </div>
  );
}
