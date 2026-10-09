import type { ReactNode } from 'react';
import { EmptyState, PageHeader, Section } from '@/components/ui';

interface ModulePlaceholderProps {
  readonly title: string;
  readonly question: string;
  readonly arrivesIn: string;
  readonly contains: readonly string[];
  /** Something that genuinely works today, shown above the "not built yet" note. */
  readonly preview?: ReactNode;
}

/**
 * An honest placeholder.
 *
 * The shell exists; the modules do not. Rather than render controls that do
 * nothing, each destination states what it will hold and which stage builds it.
 * There is nothing here to press, so there is nothing to mistake for a working
 * feature — and where something does work, it is shown working and labelled.
 */
export function ModulePlaceholder({
  title,
  question,
  arrivesIn,
  contains,
  preview,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} lede={question} />

      {preview}

      <Section title="Planned contents">
        <ul className="space-y-2">
          {contains.map((item) => (
            <li key={item} className="flex gap-2 text-body text-ink">
              <span aria-hidden="true" className="text-ink-muted">
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <EmptyState
        title="Not built yet."
        body={`This module is scheduled for ${arrivesIn}. The foundation ships the shell, the layers and the checks — not working modules dressed up as finished ones.`}
      />
    </div>
  );
}
