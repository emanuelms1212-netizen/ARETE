'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, FormField, TextInput } from '@/components/ui';
import {
  TRANSFER_NOTE,
  generateArithmetic,
  generateSequence,
  scoreItems,
  type Drill,
  type DrillItem,
} from '@/domain';

/**
 * The two drills that actually run.
 *
 * Mental arithmetic and working memory are implemented; the other four the
 * brief names are not, and so they are not offered. A list of six buttons
 * where two do something is the thing the operating rules call a mock button,
 * and the remaining four are recorded as outstanding rather than drawn.
 *
 * Nothing here produces a score. The result is "how many you got right, at
 * this drill, today", and `TRANSFER_NOTE` sits underneath it every time.
 */
export interface DrillRunnerProps {
  readonly drill: Drill;
  readonly seed: number;
  readonly itemCount: number;
  readonly onComplete: (items: readonly DrillItem[]) => void;
  readonly onCancel: () => void;
}

type Phase = 'showing' | 'answering' | 'done';

export function DrillRunner({ drill, seed, itemCount, onComplete, onCancel }: DrillRunnerProps) {
  const prompts = useMemo(() => {
    if (drill === 'mental-arithmetic') return generateArithmetic(seed, itemCount, 2);
    // Working memory: sequences that lengthen as you go.
    return Array.from({ length: itemCount }, (_, index) =>
      generateSequence(seed + index, 3 + Math.floor(index / 3)),
    );
  }, [drill, seed, itemCount]);

  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState('');
  const [items, setItems] = useState<DrillItem[]>([]);
  const [phase, setPhase] = useState<Phase>(drill === 'working-memory' ? 'showing' : 'answering');
  // Stamped when the question is actually put in front of the user, not when
  // the component renders — reading the clock during render is impure, and
  // the two moments differ by however long the sequence was shown for.
  const askedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = prompts[index];

  // Working memory shows the sequence, then hides it. The delay scales with
  // length so a six-digit run is not flashed for the same time as a three.
  useEffect(() => {
    if (drill !== 'working-memory' || phase !== 'showing' || current === undefined) return;
    const visibleMs = 800 + current.answer.length * 400;
    const id = window.setTimeout(() => setPhase('answering'), visibleMs);
    return () => window.clearTimeout(id);
  }, [drill, phase, current, index]);

  useEffect(() => {
    if (phase !== 'answering') return;
    askedAt.current = Date.now();
    inputRef.current?.focus();
  }, [phase, index]);

  if (current === undefined || phase === 'done') {
    const result = scoreItems(drill, items);
    return (
      <Card className="p-5">
        <h3 className="font-display text-display-2 font-semibold text-ink">Done</h3>
        <p className="mt-2 text-body text-ink">
          {result.itemsCorrect} of {result.itemsAttempted} right
          {result.medianResponseMs === null
            ? ''
            : `, around ${(result.medianResponseMs / 1000).toFixed(1)}s each`}
          .
        </p>
        <p className="mt-3 rounded-md border border-line bg-sunken p-3 text-body-sm text-ink-muted">
          {TRANSFER_NOTE}
        </p>
        <div className="mt-4">
          <Button onClick={() => onComplete(items)}>Save this session</Button>
        </div>
      </Card>
    );
  }

  function submit() {
    const answer = given.trim();
    if (answer.length === 0) return;

    const recorded: DrillItem = {
      prompt: current!.prompt,
      answer: current!.answer,
      given: answer,
      correct: answer.replace(/\s/g, '') === current!.answer.replace(/\s/g, ''),
      responseMs: Date.now() - askedAt.current,
    };

    const next = [...items, recorded];
    setItems(next);
    setGiven('');

    if (index + 1 >= prompts.length) {
      setPhase('done');
      return;
    }

    setIndex(index + 1);
    if (drill === 'working-memory') setPhase('showing');
  }

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-label tracking-[0.12em] text-ink-muted uppercase">
          {index + 1} of {prompts.length}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 text-body-sm text-ink-muted hover:text-ink"
        >
          Stop
        </button>
      </div>

      <div className="flex min-h-40 flex-col items-center justify-center">
        {drill === 'working-memory' && phase === 'showing' ? (
          <>
            <p className="font-display text-display-1 font-semibold text-ink tabular-nums">
              {current.prompt}
            </p>
            <p className="mt-2 text-body-sm text-ink-muted">Hold this.</p>
          </>
        ) : drill === 'working-memory' ? (
          <p className="text-body text-ink-muted">Type it back.</p>
        ) : (
          <p className="font-display text-display-1 font-semibold text-ink tabular-nums">
            {current.prompt}
          </p>
        )}
      </div>

      {phase === 'answering' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <FormField label="Your answer">
              {({ id, describedBy }) => (
                <TextInput
                  ref={inputRef}
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="numeric"
                  autoComplete="off"
                  value={given}
                  onChange={(event) => setGiven(event.target.value)}
                />
              )}
            </FormField>
          </div>
          <Button type="submit">Next</Button>
        </form>
      ) : null}
    </Card>
  );
}
