import { useId } from 'react';

export interface Bar {
  readonly label: string;
  /** The full span in words, for the tooltip, the table and screen readers. */
  readonly span: string;
  readonly value: number;
}

const WIDTH = 320;
const HEIGHT = 120;
const BASELINE = HEIGHT - 18;

const format = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);

/**
 * One series, one hue, one axis. Every chart comes with a sentence that says
 * what it shows, an accessible description, a tooltip per bar and a table
 * view — so nothing is carried by the picture alone. With nothing recorded,
 * it says so instead of drawing an empty frame.
 */
export function BarChart({
  title,
  unit,
  bars,
  summary,
}: {
  title: string;
  unit: string;
  bars: readonly Bar[];
  summary: string;
}) {
  const id = useId();
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  if (max === 0) {
    return (
      <p className="text-body-sm text-ink-muted" data-testid={`chart-empty-${title}`}>
        Nothing recorded in this range.
      </p>
    );
  }
  const slot = WIDTH / bars.length;
  const barWidth = Math.max(4, Math.min(28, slot - 4));
  const labelEvery = Math.ceil(bars.length / 7);
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className="h-auto w-full max-w-lg"
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{summary}</desc>
        <line
          x1={0}
          x2={WIDTH}
          y1={BASELINE}
          y2={BASELINE}
          className="stroke-line"
          strokeWidth={1}
        />
        {bars.map((bar, index) => {
          const height = bar.value === 0 ? 0 : Math.max(2, (bar.value / max) * (BASELINE - 14));
          const x = index * slot + (slot - barWidth) / 2;
          return (
            <g key={`${bar.span}-${index}`}>
              {height > 0 ? (
                <rect
                  x={x}
                  y={BASELINE - height}
                  width={barWidth}
                  height={height}
                  rx={Math.min(4, barWidth / 2)}
                  className="fill-accent"
                >
                  <title>{`${bar.span}: ${format(bar.value)} ${unit}`}</title>
                </rect>
              ) : null}
              {index % labelEvery === 0 ? (
                <text
                  x={index * slot + slot / 2}
                  y={HEIGHT - 4}
                  textAnchor="middle"
                  className="fill-ink-muted text-[9px]"
                >
                  {bar.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <text x={0} y={10} className="fill-ink-muted text-[9px]">
          {format(max)}
        </text>
      </svg>
      <figcaption className="text-body-sm text-ink">{summary}</figcaption>
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-body-sm text-accent">
          Show as a table
        </summary>
        <table className="mt-1 w-full text-left text-body-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 font-medium">
                When
              </th>
              <th scope="col" className="py-1 font-medium">
                {unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar, index) => (
              <tr key={`${bar.span}-row-${index}`} className="border-t border-line">
                <th scope="row" className="py-1 font-normal text-ink">
                  {bar.span}
                </th>
                <td className="py-1 text-ink">{format(bar.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
