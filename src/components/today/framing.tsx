'use client';

import { useState, useTransition } from 'react';
import { Button, FormField, Section, Switch, TextArea, TextInput, useToast } from '@/components/ui';
import { MORNING_PROMPTS, VIRTUES, type Virtue } from '@/domain';

/**
 * The morning half of the day: an intention, and the dichotomy of control.
 *
 * The Stoic idea is load-bearing here and easy to get wrong. The failure mode
 * is a lecture — a quote, an explanation of Epictetus, a tone of instruction.
 * What is actually useful is two boxes and a plain question, answered in the
 * user's own words. The philosophy is in the shape of the prompt, not in the
 * copy around it.
 *
 * Both boxes are optional. A screen that cannot be left unanswered is a screen
 * people start lying to.
 */
export interface FramingProps {
  readonly intention: string | null;
  readonly inMyControl: string | null;
  readonly notMyControl: string | null;
  readonly virtue: Virtue | null;
  readonly obstacle: string | null;
  readonly minimumMode: boolean;
  readonly onSave: (input: {
    intention?: string | null;
    inMyControl?: string | null;
    notMyControl?: string | null;
    virtue?: Virtue | null;
    obstacle?: string | null;
  }) => Promise<void>;
  readonly onMinimumMode: (on: boolean) => Promise<void>;
}

export function Framing({
  intention,
  inMyControl,
  notMyControl,
  virtue,
  obstacle,
  minimumMode,
  onSave,
  onMinimumMode,
}: FramingProps) {
  // Collapsed by default, even when nothing has been written. A screen that
  // opens with three empty boxes reads as a chore; one line and a link reads
  // as an offer, and the offer is one tap from the form.
  const [editing, setEditing] = useState(false);
  const [draftIntention, setDraftIntention] = useState(intention ?? '');
  const [draftControl, setDraftControl] = useState(inMyControl ?? '');
  const [draftRelease, setDraftRelease] = useState(notMyControl ?? '');
  const [draftVirtue, setDraftVirtue] = useState<Virtue | ''>(virtue ?? '');
  const [draftObstacle, setDraftObstacle] = useState(obstacle ?? '');
  const [pending, start] = useTransition();
  const { show } = useToast();

  function save() {
    start(async () => {
      try {
        await onSave({
          intention: draftIntention.trim() || null,
          inMyControl: draftControl.trim() || null,
          notMyControl: draftRelease.trim() || null,
          virtue: draftVirtue === '' ? null : draftVirtue,
          obstacle: draftObstacle.trim() || null,
        });
        setEditing(false);
      } catch {
        show('Could not save that. Nothing was changed.', 'warn');
      }
    });
  }

  return (
    <Section
      title="This morning"
      hint="One sentence for the day, and the line between what is yours to do and what is not."
    >
      {editing ? (
        <div className="space-y-4">
          <FormField label="What is today for?" hint="One sentence. Not a to-do list.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={draftIntention}
                onChange={(event) => setDraftIntention(event.target.value)}
                placeholder="Finish the first draft"
              />
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Mine to do"
              hint={`${MORNING_PROMPTS.inMyControl} The part that depends on you.`}
            >
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  rows={2}
                  value={draftControl}
                  onChange={(event) => setDraftControl(event.target.value)}
                  placeholder="Sitting down at nine and starting badly"
                />
              )}
            </FormField>

            <FormField
              label="Not mine"
              hint={`${MORNING_PROMPTS.notMyControl} The part you can stop arguing with.`}
            >
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  rows={2}
                  value={draftRelease}
                  onChange={(event) => setDraftRelease(event.target.value)}
                  placeholder="Whether they like it"
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={MORNING_PROMPTS.virtue} hint="Optional. One is plenty.">
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  value={draftVirtue}
                  onChange={(event) => setDraftVirtue(event.target.value as Virtue | '')}
                  className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink"
                >
                  <option value="">None today</option>
                  {VIRTUES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} — {option.hint}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={MORNING_PROMPTS.obstacle}>
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  rows={2}
                  value={draftObstacle}
                  onChange={(event) => setDraftObstacle(event.target.value)}
                  placeholder="The 3 pm slump — a walk before the next block"
                />
              )}
            </FormField>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} loading={pending}>
              Save
            </Button>
            {intention !== null || inMyControl !== null ? (
              <Button variant="quiet" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {intention === null ? (
            <p className="text-body text-ink-muted">No intention set for today.</p>
          ) : (
            <p className="font-display text-display-3 text-balance text-ink">{intention}</p>
          )}

          {inMyControl !== null || notMyControl !== null ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {inMyControl === null ? null : (
                <div className="rounded-md border border-line bg-sunken p-3">
                  <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">
                    Mine to do
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink">{inMyControl}</dd>
                </div>
              )}
              {notMyControl === null ? null : (
                <div className="rounded-md border border-line bg-sunken p-3">
                  <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">
                    Not mine
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink">{notMyControl}</dd>
                </div>
              )}
            </dl>
          ) : null}

          {virtue !== null || obstacle !== null ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {virtue === null ? null : (
                <div className="rounded-md border border-line bg-sunken p-3">
                  <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">
                    Practising
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink">
                    {VIRTUES.find((option) => option.value === virtue)?.label}
                  </dd>
                </div>
              )}
              {obstacle === null ? null : (
                <div className="rounded-md border border-line bg-sunken p-3">
                  <dt className="text-label tracking-[0.08em] text-ink-muted uppercase">
                    Likely obstacle
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink">{obstacle}</dd>
                </div>
              )}
            </dl>
          ) : null}

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 text-body-sm text-accent hover:underline"
          >
            {intention === null ? 'Set an intention' : 'Change'}
          </button>
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <Switch
          label="Run today at its minimum"
          hint="Swaps what is asked of the day down to what still counts. The day is not a failure — this is what a real one looks like sometimes."
          checked={minimumMode}
          onChange={(next) =>
            start(async () => {
              try {
                await onMinimumMode(next);
              } catch {
                show('Could not change the day. Nothing was altered.', 'warn');
              }
            })
          }
        />
      </div>
    </Section>
  );
}
