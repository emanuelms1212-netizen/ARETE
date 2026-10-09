'use client';

import { useEffect, useState } from 'react';

const PHASES = [
  { label: 'Breathe in', seconds: 4 },
  { label: 'Hold', seconds: 2 },
  { label: 'Breathe out', seconds: 6 },
] as const;

/**
 * The breathing pacer.
 *
 * Four in, two held, six out — a long exhale, which is the only part of this
 * the evidence is comfortable about, and the app claims nothing more than that
 * it is a pacer.
 *
 * The ring's scale is a CSS animation on a twelve-second loop; the written cue
 * is driven separately in JavaScript. That separation is deliberate: under
 * `prefers-reduced-motion` the ring stops and rests at full size, and the cue
 * keeps the pacing on its own, so the practice still works without motion.
 */
export function BreathingRing() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const phase = PHASES[index] ?? PHASES[0];
    const id = window.setTimeout(() => {
      setIndex((current) => (current + 1) % PHASES.length);
    }, phase.seconds * 1000);
    return () => window.clearTimeout(id);
  }, [index]);

  const phase = PHASES[index] ?? PHASES[0];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative grid h-44 w-44 place-items-center">
        {/* The guide: how far the breath goes. Static, so the travel is readable. */}
        <div aria-hidden="true" className="absolute inset-0 rounded-full border border-line" />
        {/* The breath itself. */}
        <div
          aria-hidden="true"
          className="animate-breathe absolute inset-0 rounded-full border-2 border-accent bg-accent-soft"
        />
        <div aria-hidden="true" className="relative h-2.5 w-2.5 rounded-full bg-accent" />
      </div>
      <p role="status" className="text-body-lg text-ink">
        {phase.label}
      </p>
      <p className="text-body-sm text-ink-muted">Four in · two held · six out</p>
    </div>
  );
}
