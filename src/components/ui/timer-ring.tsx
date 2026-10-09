import type { ReactNode } from 'react';

export interface TimerRingProps {
  /** 0 to 1. Values outside the range are clamped rather than drawn wrong. */
  readonly progress: number;
  readonly size?: number;
  readonly children?: ReactNode;
  /** Describes the ring for assistive technology; the ring itself is decorative. */
  readonly label?: string;
}

/**
 * A progress ring.
 *
 * Geometry only — it has no notion of time, so the same component serves the
 * focus timer, a rest timer and a mobility hold. The ring is `aria-hidden`
 * and the number inside it is the accessible content, because a ring is a
 * picture of a value, not the value.
 */
export function TimerRing({ progress, size = 184, children, label }: TimerRingProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--c-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{
            transition: 'stroke-dashoffset var(--duration-base) var(--e-standard)',
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {label ? <span className="sr-only">{label}</span> : null}
        {children}
      </div>
    </div>
  );
}
