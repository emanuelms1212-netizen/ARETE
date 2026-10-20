'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  ChoiceList,
  FormField,
  Section,
  StopGuidance,
  TextArea,
  useToast,
} from '@/components/ui';
import { EVENING_PROMPTS, type DayProgress } from '@/domain';

/**
 * The evening half of the day.
 *
 * Four short questions (the Stoic journal's evening page), in the order a tired person can answer them: what worked,
 * what got in the way, and the one thing tomorrow is for. A review with ten
 * questions is a review that does not happen.
 *
 * `metMinimum` is recorded rather than recomputed later, because the answer
 * must not change when the plan is edited afterwards. The default comes from
 * the day's own arithmetic, and the user can disagree with it — they were
 * there and the counter was not.
 */
export interface EveningReviewProps {
  readonly progress: DayProgress;
  readonly existing: {
    readonly wentWell: string | null;
    readonly friction: string | null;
    readonly tomorrowOneThing: string | null;
    readonly learned?: string | null;
    readonly energy: 'low' | 'steady' | 'high' | null;
    readonly metMinimum: boolean | null;
  } | null;
  readonly onSave: (input: {
    wentWell: string | null;
    friction: string | null;
    tomorrowOneThing: string | null;
    learned: string | null;
    energy: 'low' | 'steady' | 'high' | null;
    metMinimum: boolean | null;
  }) => Promise<void>;
}

export function EveningReview({ progress, existing, onSave }: EveningReviewProps) {
  const [open, setOpen] = useState(existing !== null);
  const [wentWell, setWentWell] = useState(existing?.wentWell ?? '');
  const [friction, setFriction] = useState(existing?.friction ?? '');
  const [tomorrow, setTomorrow] = useState(existing?.tomorrowOneThing ?? '');
  const [learned, setLearned] = useState(existing?.learned ?? '');
  const [energy, setEnergy] = useState<'low' | 'steady' | 'high' | null>(existing?.energy ?? null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  const saved = existing !== null;

  if (!open) {
    return (
      <Section title="This evening" hint="Two minutes, when the day is done.">
        <Button variant="quiet" onClick={() => setOpen(true)}>
          Write the review
        </Button>
      </Section>
    );
  }

  return (
    <Section
      title="This evening"
      hint={
        progress.minimumDayMet
          ? 'Your minimum was met today. The rest was a choice.'
          : 'However the day went, it is worth writing down.'
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            try {
              await onSave({
                wentWell: wentWell.trim() || null,
                friction: friction.trim() || null,
                tomorrowOneThing: tomorrow.trim() || null,
                learned: learned.trim() || null,
                energy,
                metMinimum: progress.minimumDayMet,
              });
              show('Review saved.', 'success');
            } catch {
              show('Could not save the review. Nothing was changed.', 'warn');
            }
          });
        }}
      >
        <FormField
          label={EVENING_PROMPTS.wentWell}
          hint="However small. This is the one people skip."
        >
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={wentWell}
              onChange={(event) => setWentWell(event.target.value)}
              placeholder="Started before checking anything"
            />
          )}
        </FormField>

        {/* Deliberately not "What got in the way?" — the skip dialog already
            asks that about a single item, and two identical labels on one
            screen are ambiguous to anyone navigating by label. This one is
            the Stoic journal's question about the day. */}
        <FormField
          label={EVENING_PROMPTS.friction}
          hint="Not a confession. Just where it happened."
        >
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={friction}
              onChange={(event) => setFriction(event.target.value)}
              placeholder="Answered email in the first hour instead of writing"
            />
          )}
        </FormField>

        <FormField label={EVENING_PROMPTS.learned}>
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={learned}
              onChange={(event) => setLearned(event.target.value)}
              placeholder="I write better before I read anything"
            />
          )}
        </FormField>

        <FormField label={EVENING_PROMPTS.tomorrowOneThing} hint="One. Not a list.">
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={tomorrow}
              onChange={(event) => setTomorrow(event.target.value)}
              placeholder="Finish the section I started"
            />
          )}
        </FormField>

        <ChoiceList
          legend="How was the energy?"
          value={energy ?? ''}
          onChange={(next) => setEnergy(next === '' ? null : next)}
          choices={[
            { value: 'low' as const, label: 'Low' },
            { value: 'steady' as const, label: 'Steady' },
            { value: 'high' as const, label: 'High' },
          ]}
        />

        <Button type="submit" loading={pending}>
          {saved ? 'Update the review' : 'Save the review'}
        </Button>
      </form>
      <div className="mt-4">
        <StopGuidance module="journal" summary="If writing brings up something heavy" />
      </div>
    </Section>
  );
}
