import { Card, CardHeader, EmptyState } from '@/components/ui';

interface ModulePlaceholderProps {
  readonly title: string;
  readonly question: string;
  readonly arrivesIn: string;
  readonly contains: readonly string[];
}

/**
 * An honest placeholder.
 *
 * The foundation stage ships the shell, not the modules. Rather than render
 * buttons that do nothing, each destination states what it will hold and which
 * stage builds it. There are no controls here to press, so there is nothing to
 * mistake for a working feature.
 */
export function ModulePlaceholder({
  title,
  question,
  arrivesIn,
  contains,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{question}</p>
      </div>

      <Card>
        <CardHeader title="Planned contents" />
        <ul className="space-y-2">
          {contains.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-[var(--ink)]">
              <span aria-hidden="true" className="text-[var(--ink-muted)]">
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <EmptyState
        title="Not built yet."
        body={`This module is scheduled for ${arrivesIn}. The foundation stage ships the shell, the layers and the checks — not working modules dressed up as finished ones.`}
      />
    </div>
  );
}
