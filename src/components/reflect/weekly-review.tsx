'use client';

import { useState, useTransition } from 'react';
import { Button, FormField, Section, TextArea, useToast } from '@/components/ui';
import { WEEKLY_PROMPTS, type WeeklyPromptKey } from '@/domain';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export function WeeklyReviewForm({
  week,
  answers,
  onSave,
}: {
  week: string;
  answers: Partial<Record<WeeklyPromptKey, string>>;
  onSave: (input: {
    week: string;
    answers: Partial<Record<WeeklyPromptKey, string | null>>;
  }) => Promise<Result<Partial<Record<WeeklyPromptKey, string>>>>;
}) {
  const [draft, setDraft] = useState<Record<WeeklyPromptKey, string>>(
    () =>
      Object.fromEntries(
        WEEKLY_PROMPTS.map((prompt) => [prompt.key, answers[prompt.key] ?? '']),
      ) as Record<WeeklyPromptKey, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  return (
    <Section title="Your reflection" hint="Plain answers. Nobody grades this, including you.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          start(async () => {
            const result = await onSave({
              week,
              answers: Object.fromEntries(
                WEEKLY_PROMPTS.map((prompt) => [prompt.key, draft[prompt.key].trim() || null]),
              ) as Record<WeeklyPromptKey, string | null>,
            });
            if (!result.ok) setError(result.message);
            else show('Weekly review saved.', 'success');
          });
        }}
      >
        {WEEKLY_PROMPTS.map((prompt) => (
          <FormField key={prompt.key} label={prompt.text}>
            {({ id }) => (
              <TextArea
                id={id}
                maxLength={2000}
                value={draft[prompt.key]}
                onChange={(event) => setDraft({ ...draft, [prompt.key]: event.target.value })}
              />
            )}
          </FormField>
        ))}
        {error ? (
          <p role="alert" className="text-body-sm text-warn">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={pending}>
          Save the review
        </Button>
      </form>
    </Section>
  );
}
