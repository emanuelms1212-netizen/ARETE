import { stopGuidanceFor, type StopModule } from '@/domain';

/**
 * The way out, in words, for a module that asks for effort.
 *
 * A disclosure rather than a wall of text: the summary is always visible and
 * reachable by keyboard, and opening it shows the same guidance every module
 * uses (see `STOP_GUIDANCE`). It never replaces a stop button; it sits beside one.
 */
export function StopGuidance({
  module,
  summary = 'If something feels wrong',
  open = false,
}: {
  readonly module: StopModule;
  readonly summary?: string;
  readonly open?: boolean;
}) {
  return (
    <details className="rounded-md border border-line p-3 text-body-sm" open={open}>
      <summary className="min-h-11 cursor-pointer content-center font-medium text-ink">
        {summary}
      </summary>
      <ul className="mt-1 space-y-2">
        {stopGuidanceFor(module).map((guidance) => (
          <li key={guidance.title}>
            <span className="block font-medium text-ink">{guidance.title}</span>
            <span className="block text-ink-muted">{guidance.body}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
