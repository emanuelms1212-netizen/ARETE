'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FormField,
  SafetyNotice,
  Section,
  SegmentedControl,
  TextArea,
  TextInput,
  useToast,
} from '@/components/ui';
import {
  RESET_BREAK_LABEL,
  RESET_CHECKIN_CHOICES,
  RESET_CHECKIN_LABEL,
  RESET_COMPONENT_LABEL,
  addDays,
  formatLocalDate,
  phaseFor,
  type IsoDate,
  type ResetBreakKind,
  type ResetCheckin,
  type ResetCheckinChoice,
  type ResetComponent,
  type ResetCustomisation,
  type ResetDayState,
  type ResetLog,
  type ResetLogStatus,
  type ResetPersonInputs,
  type ResetSummary,
  type ResetTarget,
} from '@/domain';
import type { ResetEnrolment } from '@/persistence/repository';
import { CustomiseForm, ProgrammePreview } from './reset-customise';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface ResetActions {
  readonly start: (input: {
    startedOn: string;
    customisation: ResetCustomisation;
  }) => Promise<Result<ResetEnrolment>>;
  readonly update: (customisation: ResetCustomisation) => Promise<Result<ResetEnrolment>>;
  readonly acknowledgeCold: () => Promise<Result<null>>;
  readonly log: (input: {
    component: ResetComponent;
    status: ResetLogStatus | null;
  }) => Promise<Result<ResetLog | null>>;
  readonly addBreak: (input: {
    kind: ResetBreakKind;
    from: string;
    to: string | null;
  }) => Promise<Result<ResetEnrolment>>;
  readonly endBreak: (breakId: string) => Promise<Result<ResetEnrolment>>;
  readonly checkin: (input: {
    choice: ResetCheckinChoice;
    note: string | null;
  }) => Promise<Result<ResetCheckin>>;
  readonly finish: (
    choice: 'extend' | 'finish' | 'again' | 'end',
  ) => Promise<Result<ResetEnrolment>>;
}

export interface ResetBoardProps {
  readonly today: IsoDate;
  readonly person: ResetPersonInputs;
  readonly defaults: ResetCustomisation;
  readonly enrolment: ResetEnrolment | null;
  readonly last: ResetEnrolment | null;
  readonly state: ResetDayState | null;
  readonly length: number;
  readonly minimumDay: boolean;
  readonly targets: readonly ResetTarget[];
  readonly todaysLogs: readonly ResetLog[];
  readonly checkinDue: number | null;
  readonly summary: ResetSummary | null;
  readonly lastSummary: ResetSummary | null;
  readonly contrastAvailable: boolean;
  readonly coldAcknowledged: boolean;
  readonly actions: ResetActions;
}

function dateLabel(iso: string, today: string): string {
  if (iso === today) return 'today';
  if (iso === addDays(today, 1)) return 'tomorrow';
  return formatLocalDate(iso, 'short');
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  function run<T>(work: () => Promise<Result<T>>, success?: string) {
    setError(null);
    start(async () => {
      const result = await work();
      if (!result.ok) setError(result.message);
      else if (success) show(success, 'success');
    });
  }
  const alert = error ? (
    <p role="alert" className="text-body-sm text-warn">
      {error}
    </p>
  ) : null;
  return { pending, run, alert, setError };
}

function Summary({ summary, title }: { summary: ResetSummary; title: string }) {
  return (
    <Section title={title} hint="What was done. Days without a tick are not counted against you.">
      <p className="text-body text-ink" data-testid="reset-summary">
        Something done on {summary.daysWithSomething} of {summary.days} days.
      </p>
      {summary.byComponent.length > 0 ? (
        <ul className="mt-2 space-y-1 text-body-sm">
          {summary.byComponent.map((entry) => (
            <li key={entry.component} className="flex justify-between">
              <span className="text-ink-muted">{RESET_COMPONENT_LABEL[entry.component]}</span>
              <span className="text-ink">{entry.done}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function Setup(props: ResetBoardProps) {
  const { pending, run, alert } = useAction();
  const dates = Array.from({ length: 29 }, (_, offset) => {
    const value = addDays(props.today, offset);
    return { value, label: offset === 0 ? 'Today' : dateLabel(value, props.today) };
  });
  return (
    <div className="space-y-4">
      {props.last && props.lastSummary ? (
        <Summary
          summary={props.lastSummary}
          title={
            props.last.status === 'finished'
              ? 'Your last programme'
              : 'Your last programme (ended early)'
          }
        />
      ) : null}
      <Section
        title="Before you start"
        hint="Every number below is a suggestion worked out from what you told ARETE. Change anything, now or later."
      >
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink-muted">
          <li>Sixty days. Missing one does not reset anything; the next day simply comes next.</li>
          <li>
            Pause, travel and sick days are built in. A minimum day on Today shrinks the list.
          </li>
          <li>Cold water and a social media cap are off unless you choose them.</li>
        </ul>
      </Section>
      <Section title="Your programme">
        <CustomiseForm
          initial={props.defaults}
          person={props.person}
          coldAcknowledged={props.coldAcknowledged}
          submitLabel="Start the programme"
          pending={pending}
          startDates={dates}
          onAcknowledgeCold={async () => (await props.actions.acknowledgeCold()).ok}
          onSubmit={(customisation, startedOn) =>
            run(
              () => props.actions.start({ startedOn: startedOn ?? props.today, customisation }),
              'The reset has started.',
            )
          }
        />
        <div className="mt-2">{alert}</div>
      </Section>
    </div>
  );
}

function TodayItems({
  targets,
  logs,
  actions,
}: {
  targets: readonly ResetTarget[];
  logs: readonly ResetLog[];
  actions: ResetActions;
}) {
  const { pending, run, alert } = useAction();
  const statusOf = (component: ResetComponent) =>
    logs.find((log) => log.component === component)?.status ?? null;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {targets.map((target) => {
          const status = statusOf(target.component);
          return (
            <li
              key={target.component}
              className="p-3"
              data-testid={`reset-item-${target.component}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">
                    {target.label}
                    {target.text ? (
                      <span className="font-normal text-ink-muted"> · {target.text}</span>
                    ) : null}
                  </p>
                  <p className="text-body-sm text-ink-muted">{target.why}</p>
                  {target.component === 'weekly' ? (
                    <p className="text-body-sm">
                      <Link href="/reflect" className="text-accent hover:underline">
                        Open the weekly review
                      </Link>
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-body-sm text-ink-muted" aria-live="polite">
                  {status === 'done' ? 'Done' : status === 'skipped' ? 'Not today' : ''}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={status === 'done' ? 'primary' : 'quiet'}
                  aria-pressed={status === 'done'}
                  loading={pending}
                  onClick={() =>
                    run(() =>
                      actions.log({
                        component: target.component,
                        status: status === 'done' ? null : 'done',
                      }),
                    )
                  }
                >
                  {status === 'done'
                    ? `Undo ${target.label.toLowerCase()}`
                    : `Done: ${target.label.toLowerCase()}`}
                </Button>
                {status !== 'done' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-pressed={status === 'skipped'}
                    onClick={() =>
                      run(() =>
                        actions.log({
                          component: target.component,
                          status: status === 'skipped' ? null : 'skipped',
                        }),
                      )
                    }
                  >
                    {status === 'skipped' ? 'Undo not today' : 'Not today'}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {alert}
    </div>
  );
}

function Checkin({ week, actions }: { week: number; actions: ResetActions }) {
  const [choice, setChoice] = useState<ResetCheckinChoice>('same');
  const [note, setNote] = useState('');
  const { pending, run, alert } = useAction();
  return (
    <Section
      title={`Week ${week} check-in`}
      hint="How did the week sit? Your answer moves next week’s ranges by about ten per cent, or not at all."
    >
      <div className="space-y-3">
        <SegmentedControl<ResetCheckinChoice>
          legend="Next week"
          hideLegend
          value={choice}
          onChange={setChoice}
          options={RESET_CHECKIN_CHOICES.map((value) => ({
            value,
            label: value === 'easier' ? 'Ease off' : value === 'same' ? 'Keep it' : 'A little more',
          }))}
        />
        <FormField label="A note for yourself (optional)">
          {({ id }) => (
            <TextArea
              id={id}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>
        <Button
          loading={pending}
          onClick={() =>
            run(
              () => actions.checkin({ choice, note: note.trim() || null }),
              `${RESET_CHECKIN_LABEL[choice]}.`,
            )
          }
        >
          Save the check-in
        </Button>
        {alert}
      </div>
    </Section>
  );
}

function Breaks({
  enrolment,
  today,
  state,
  actions,
}: {
  enrolment: ResetEnrolment;
  today: IsoDate;
  state: ResetDayState;
  actions: ResetActions;
}) {
  const { pending, run, alert } = useAction();
  const [planning, setPlanning] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 3));
  const upcoming = enrolment.breaks.filter((entry) => entry.to === null || entry.to >= today);
  const inBreak = state.kind === 'paused' || state.kind === 'sick';

  return (
    <Section
      title="Breaks"
      hint="Pause and sick days stop the programme clock and it carries on where you left off. Travel keeps it running with lighter versions."
    >
      <div className="space-y-3">
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 text-body-sm"
              >
                <span className="text-ink">
                  {RESET_BREAK_LABEL[entry.kind]} from {dateLabel(entry.from, today)}
                  {entry.to ? ` to ${dateLabel(entry.to, today)}` : ', until you resume'}
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  loading={pending}
                  onClick={() =>
                    run(
                      () => actions.endBreak(entry.id),
                      entry.from > today
                        ? 'Cancelled.'
                        : 'Welcome back. The programme carries on today.',
                    )
                  }
                >
                  {entry.from > today
                    ? 'Cancel'
                    : entry.kind === 'travel'
                      ? 'Back home'
                      : 'Resume today'}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {!inBreak ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="quiet"
              loading={pending}
              onClick={() =>
                run(() => actions.addBreak({ kind: 'pause', from: today, to: null }), 'Paused.')
              }
            >
              Pause from today
            </Button>
            <Button
              size="sm"
              variant="quiet"
              loading={pending}
              onClick={() =>
                run(
                  () => actions.addBreak({ kind: 'sick', from: today, to: null }),
                  'Rest first. The programme waits.',
                )
              }
            >
              I’m sick or injured
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setPlanning(!planning)}
              aria-expanded={planning}
            >
              Plan travel
            </Button>
          </div>
        ) : null}
        {planning ? (
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => actions.addBreak({ kind: 'travel', from, to }), 'Travel planned.');
              setPlanning(false);
            }}
          >
            <FormField label="Leaving">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  min={today}
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="Back">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  min={from}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              )}
            </FormField>
            <Button
              type="submit"
              size="sm"
              className="col-span-2 justify-self-start"
              loading={pending}
            >
              Save the trip
            </Button>
          </form>
        ) : null}
        {alert}
      </div>
    </Section>
  );
}

function Finish({
  enrolment,
  summary,
  actions,
}: {
  enrolment: ResetEnrolment;
  summary: ResetSummary;
  actions: ResetActions;
}) {
  const { pending, run, alert } = useAction();
  return (
    <div className="space-y-4">
      <Summary summary={summary} title="You reached the end" />
      <Section title="What next" hint="Nothing here is a verdict. Pick what is useful.">
        <div className="flex flex-col items-start gap-2">
          {!enrolment.customisation.includeExtension ? (
            <Button
              loading={pending}
              onClick={() => run(() => actions.finish('extend'), 'Extension week added.')}
            >
              Add the extension week (days 61–66)
            </Button>
          ) : null}
          <Button
            variant="quiet"
            loading={pending}
            onClick={() => run(() => actions.finish('again'), 'A new programme starts today.')}
          >
            Start again with these settings
          </Button>
          <Button
            variant="quiet"
            loading={pending}
            onClick={() => run(() => actions.finish('finish'), 'Finished.')}
          >
            Finish here
          </Button>
        </div>
        <div className="mt-2">{alert}</div>
      </Section>
    </div>
  );
}

function Running(props: ResetBoardProps & { enrolment: ResetEnrolment; state: ResetDayState }) {
  const { enrolment, state, actions } = props;
  const [ending, setEnding] = useState(false);
  const [editing, setEditing] = useState(false);
  const { pending, run, alert } = useAction();

  let heading: string;
  if (state.kind === 'not_started')
    heading = `Starts ${dateLabel(enrolment.startedOn, props.today)}`;
  else if (state.kind === 'complete') heading = `All ${props.length} days done`;
  else if (state.kind === 'paused')
    heading = `Paused on day ${Math.max(1, state.programDay)} of ${props.length}`;
  else if (state.kind === 'sick')
    heading = `Resting on day ${Math.max(1, state.programDay)} of ${props.length}`;
  else
    heading = `Day ${Math.max(1, state.programDay)} of ${props.length} · ${phaseFor(Math.max(1, state.programDay)).name}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-display-3 font-semibold text-ink" data-testid="reset-day">
          {heading}
        </h2>
        {state.kind === 'active' && state.mode === 'travel' ? (
          <p className="text-body-sm text-ink-muted">
            Travelling: lighter versions, and the days still count.
          </p>
        ) : null}
        {state.kind === 'active' && props.minimumDay ? (
          <p className="text-body-sm text-ink-muted">
            A minimum day (set on Today): the essentials only. It counts.
          </p>
        ) : null}
      </div>

      {state.kind === 'complete' && props.summary ? (
        <Finish enrolment={enrolment} summary={props.summary} actions={actions} />
      ) : null}

      {state.kind === 'paused' ? (
        <EmptyState
          title="Paused"
          body="The programme clock is stopped. Resume when you are ready; it carries on from the same day."
        />
      ) : null}
      {state.kind === 'sick' ? (
        <SafetyNotice title="Rest comes first">
          <p>
            The programme clock is stopped and nothing is asked of you except water and sleep, if
            you can. If you are injured, follow your clinician’s advice before training again.
          </p>
        </SafetyNotice>
      ) : null}
      {state.kind === 'not_started' ? (
        <EmptyState
          title="Not started yet"
          body="The first day appears here on the start date. The whole programme is below."
        />
      ) : null}

      {props.targets.length > 0 ? (
        <TodayItems targets={props.targets} logs={props.todaysLogs} actions={actions} />
      ) : null}

      {props.checkinDue !== null && state.kind !== 'complete' ? (
        <Checkin week={props.checkinDue} actions={actions} />
      ) : null}

      {props.contrastAvailable && state.kind === 'active' ? (
        <p className="text-body-sm text-ink-muted">
          Optional, and not part of the reset:{' '}
          <Link href="/programs/contrast" className="text-accent hover:underline">
            a contrast session
          </Link>{' '}
          on a recovery day.
        </p>
      ) : null}

      {state.kind !== 'complete' ? (
        <Breaks enrolment={enrolment} today={props.today} state={state} actions={actions} />
      ) : null}

      <Section title="The programme">
        {editing ? (
          <CustomiseForm
            initial={enrolment.customisation}
            person={props.person}
            coldAcknowledged={props.coldAcknowledged}
            submitLabel="Save changes"
            pending={pending}
            lockExtension={
              state.kind !== 'not_started' && 'programDay' in state && state.programDay > 60
            }
            onAcknowledgeCold={async () => (await actions.acknowledgeCold()).ok}
            onSubmit={(customisation) => {
              run(
                () => actions.update(customisation),
                'Saved. Every day from today follows the new settings.',
              );
              setEditing(false);
            }}
          />
        ) : (
          <>
            <details>
              <summary className="min-h-11 cursor-pointer content-center text-body font-medium text-accent">
                See the whole programme
              </summary>
              <div className="mt-3">
                <ProgrammePreview person={props.person} customisation={enrolment.customisation} />
              </div>
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
                Change the programme
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEnding(true)}>
                End the programme
              </Button>
            </div>
          </>
        )}
        <div className="mt-2">{alert}</div>
      </Section>

      <ConfirmDialog
        open={ending}
        title="End the programme?"
        description="Everything you logged is kept. You can start a new one whenever you like."
        confirmLabel="End the programme"
        onCancel={() => setEnding(false)}
        onConfirm={() => {
          setEnding(false);
          run(() => actions.finish('end'), 'The programme has ended. Your logs are kept.');
        }}
      />
    </div>
  );
}

export function ResetBoard(props: ResetBoardProps) {
  if (!props.enrolment || !props.state) return <Setup {...props} />;
  return <Running {...props} enrolment={props.enrolment} state={props.state} />;
}
