'use client';

import { breathStateAt, type BreathPattern } from '@/domain';

/**
 * The breathing orb.
 *
 * Two things about it are deliberate.
 *
 * It is driven by `breathStateAt(pattern, elapsed, rounds)`, so the phase is
 * derived from how long the session has actually run. A CSS keyframe
 * animation would drift the moment the tab was backgrounded and would be
 * wrong on resume; this recomputes from the elapsed seconds the server knows
 * about, so a locked phone picks up where the breath is rather than where an
 * animation stopped.
 *
 * And the reduced-motion alternative is not a degraded version — it is the
 * same information without the scaling. The phase name, the count and the
 * ring's fill all still pace the breath, because somebody who has turned
 * motion off still needs to know when to breathe out.
 */
export interface BreathOrbProps {
  readonly pattern: BreathPattern;
  readonly elapsedSeconds: number;
  readonly rounds: number;
  readonly reducedMotion: boolean;
  readonly size?: number;
}

export function BreathOrb({
  pattern,
  elapsedSeconds,
  rounds,
  reducedMotion,
  size = 220,
}: BreathOrbProps) {
  const state = breathStateAt(pattern, elapsedSeconds, rounds);

  // 0.55 to 1.0, so the orb never collapses to nothing on the out-breath —
  // a dot that vanishes reads as an error rather than as an exhale.
  const scale = reducedMotion ? 0.85 : 0.55 + state.scale * 0.45;
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          className="absolute inset-0"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={2}
          />
          {/* The ring fills across the current phase, which is what keeps the
              pacing legible when the orb itself is not moving. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - state.phaseProgress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>

        <div
          className="rounded-full bg-accent-soft"
          style={{
            width: size * 0.62 * scale,
            height: size * 0.62 * scale,
            // Matched to the browser's own frame rate rather than to the phase
            // length: the scale is recomputed every render anyway, so this is
            // only smoothing between frames.
            transition: reducedMotion ? 'none' : 'width 120ms linear, height 120ms linear',
          }}
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-display-2 font-semibold text-ink">{state.label}</span>
          <span className="text-body-sm text-ink-muted tabular-nums">
            {Math.ceil(state.phaseRemaining)}
          </span>
        </div>
      </div>

      {/* Announced rather than only drawn. A screen reader gets the phase and
          the count; `aria-live="polite"` means it waits for a gap rather than
          interrupting. */}
      <p role="status" aria-live="polite" className="sr-only">
        {state.isComplete
          ? 'Breathing complete.'
          : `${state.label}. ${Math.ceil(state.phaseRemaining)} seconds. Round ${state.round + 1} of ${rounds}.`}
      </p>

      <p className="mt-4 text-body-sm text-ink-muted">
        {state.isComplete ? 'Done' : `Round ${state.round + 1} of ${rounds}`}
      </p>
    </div>
  );
}
