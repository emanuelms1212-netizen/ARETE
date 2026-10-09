'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import { Button } from './button';
import { TimerRing } from './timer-ring';

function format(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

export interface FocusTimerProps {
  readonly totalSeconds?: number;
}

/**
 * The focus timer's motion, working for real.
 *
 * It is driven by wall-clock time rather than by counting ticks, so
 * backgrounding the tab does not make it drift — the same approach the full
 * session in stage 6 will use. Nothing is persisted yet, and the screen it sits
 * on says so.
 */
export function FocusTimer({ totalSeconds = 25 * 60 }: FocusTimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const deadline = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      if (deadline.current === null) return;
      const left = (deadline.current - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setRunning(false);
        deadline.current = null;
      } else {
        setRemaining(left);
      }
    };

    const id = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(id);
  }, [running]);

  const toggle = useCallback(() => {
    setRunning((wasRunning) => {
      if (wasRunning) {
        deadline.current = null;
        return false;
      }
      const seconds = remaining > 0 ? remaining : totalSeconds;
      setRemaining(seconds);
      deadline.current = Date.now() + seconds * 1000;
      return true;
    });
  }, [remaining, totalSeconds]);

  const reset = useCallback(() => {
    deadline.current = null;
    setRunning(false);
    setRemaining(totalSeconds);
  }, [totalSeconds]);

  const progress = totalSeconds === 0 ? 0 : 1 - remaining / totalSeconds;

  return (
    <div className="flex flex-col items-center gap-5">
      <TimerRing progress={progress} label="Focus session remaining">
        <div>
          <p
            className="font-display text-display-1 font-semibold tabular-nums text-ink"
            aria-live="off"
          >
            {format(remaining)}
          </p>
          <p className="text-label tracking-[0.1em] text-ink-muted uppercase">
            {running ? 'Focusing' : remaining === 0 ? 'Done' : 'Ready'}
          </p>
        </div>
      </TimerRing>

      <div className="flex gap-2">
        <Button
          onClick={toggle}
          icon={running ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          disabled={remaining === 0}
        >
          {running ? 'Pause' : remaining === totalSeconds ? 'Start' : 'Resume'}
        </Button>
        <Button variant="quiet" onClick={reset} disabled={remaining === totalSeconds && !running}>
          Reset
        </Button>
      </div>

      <p role="status" className="sr-only">
        {running ? `Focusing, ${format(remaining)} remaining` : 'Timer paused'}
      </p>
    </div>
  );
}
