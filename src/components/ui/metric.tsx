import type { ReactNode } from 'react';

export interface MetricProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly unit?: string;
  readonly note?: ReactNode;
  /** `success` is for something the user completed. Never a reward colour. */
  readonly tone?: 'default' | 'success' | 'muted';
}

const tones = {
  default: 'text-ink',
  success: 'text-success',
  muted: 'text-ink-muted',
} as const;

/** A single number, said plainly. No sparkline, no delta chip, no trophy. */
export function Metric({ label, value, unit, note, tone = 'default' }: MetricProps) {
  return (
    <div className="min-w-0">
      <p className="text-label tracking-[0.08em] text-ink-muted uppercase">{label}</p>
      <p className={`font-display mt-1 text-display-2 font-semibold ${tones[tone]}`}>
        {value}
        {unit ? <span className="ml-1 text-body-sm font-normal text-ink-muted">{unit}</span> : null}
      </p>
      {note ? <p className="mt-0.5 text-body-sm text-ink-muted">{note}</p> : null}
    </div>
  );
}
