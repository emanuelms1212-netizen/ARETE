'use client';

import { useState, useTransition } from 'react';
import { Button, Section, useToast } from '@/components/ui';
import { formatLocalDate, type ProposedDay } from '@/domain';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Next week, proposed. Everything starts unticked: the person chooses what
 * goes in, and nothing is written until they confirm.
 */
export function WeekProposalForm({
  days,
  unplaced,
  onConfirm,
}: {
  days: readonly ProposedDay[];
  unplaced: readonly string[];
  onConfirm: (ids: string[]) => Promise<Result<{ added: number }>>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();
  const total = days.reduce((sum, day) => sum + day.items.length, 0);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div data-testid="week-proposal">
      <Section
        title="A proposal for next week"
        hint="From your open tasks, habits, training plan and recovery. Tick what you want; nothing is added until you confirm."
      >
        {total === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Nothing to propose yet: no open tasks, habits or training plan to build from.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setSelected(new Set(days.flatMap((d) => d.items.map((i) => i.id))))}
              >
                Tick all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
            {days.map((day) => (
              <fieldset key={day.localDate}>
                <legend className="text-body font-semibold text-ink">
                  {formatLocalDate(day.localDate, 'long')}
                </legend>
                {day.note ? <p className="text-body-sm text-ink-muted">{day.note}</p> : null}
                <ul className="mt-1 space-y-1">
                  {day.items.map((item) => (
                    <li key={item.id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                        <input
                          type="checkbox"
                          className="mt-1.5 h-4 w-4 accent-[var(--color-accent)]"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <span>
                          <span className="block text-body text-ink">{item.title}</span>
                          <span className="block text-body-sm text-ink-muted">{item.reason}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
            {unplaced.length > 0 ? (
              <p className="text-body-sm text-ink-muted">
                No room this week for: {unplaced.join(', ')}. Worth a look — or dropping.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-body-sm text-warn">
                {error}
              </p>
            ) : null}
            <Button
              loading={pending}
              disabled={selected.size === 0}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const result = await onConfirm([...selected]);
                  if (!result.ok) setError(result.message);
                  else {
                    show(`${result.value.added} added to next week.`, 'success');
                    setSelected(new Set());
                  }
                })
              }
            >
              Add {selected.size === 0 ? '' : `${selected.size} `}to next week
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
