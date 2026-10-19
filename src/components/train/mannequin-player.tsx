'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import { Button, SegmentedControl, Switch, useReducedMotion } from '@/components/ui';
import {
  BODY,
  SEGMENTS,
  boundsOf,
  cueAt,
  frameAt,
  phaseAt,
  type ExerciseAnimation,
  type Frame,
  type JointName,
  type MannequinView,
  type SegmentName,
  type Vec,
} from '@/domain/mannequin';

/**
 * The exercise player.
 *
 * The figure is drawn once by React and then moved by writing attributes on
 * its lines directly, from a `requestAnimationFrame` loop. Nothing re-renders
 * while it plays: a React render per frame would be cheap on a laptop and
 * visibly uneven on a mid-range phone, and there is nothing in the tree that
 * needs to know where the knee is this frame. The scrubber is moved the same
 * way. The caption is the one thing that goes through state, and only when
 * the step actually changes — four times a cycle, not sixty a second.
 *
 * Reduced motion is honoured by replacing the animation with its steps as a
 * row of stills, each captioned. That is the same instruction without the
 * movement, not a lesser version. Anyone can switch to the stills; it is not
 * only for people who have asked their OS for it.
 */
export interface MannequinPlayerProps {
  readonly animation: ExerciseAnimation;
}

const WIDTH: Partial<Record<SegmentName, number>> = {
  trunk: 9,
  neck: 5,
  nearThigh: 8,
  farThigh: 8,
  nearShin: 7,
  farShin: 7,
  nearUpperArm: 6,
  farUpperArm: 6,
  nearForearm: 5,
  farForearm: 5,
  nearFoot: 4,
  farFoot: 4,
};

const isFar = (name: string) => name.startsWith('far');

/** In the front view the limbs hang from the ends of the girdles, not from the midline. */
function endpoint(frame: Frame, joint: JointName, segment: SegmentName, view: MannequinView): Vec {
  const point = frame[joint];
  if (view !== 'front') return point;
  const sign = isFar(segment) ? -1 : 1;
  if (joint === 'pelvis' && segment.endsWith('Thigh'))
    return { x: sign * BODY.hipHalf, y: point.y };
  if (joint === 'shoulder' && segment.endsWith('UpperArm')) {
    return { x: sign * BODY.shoulderHalf, y: point.y };
  }
  return point;
}

type Line = { x1: number; y1: number; x2: number; y2: number };

function linesFor(frame: Frame, view: MannequinView): Record<SegmentName, Line> {
  const out = {} as Record<SegmentName, Line>;
  for (const segment of SEGMENTS) {
    const a = endpoint(frame, segment.from, segment.name, view);
    const b = endpoint(frame, segment.to, segment.name, view);
    out[segment.name] = { x1: a.x, y1: -a.y, x2: b.x, y2: -b.y };
  }
  return out;
}

interface FigureProps {
  readonly animation: ExerciseAnimation;
  readonly frame: Frame;
  readonly view: MannequinView;
  readonly box: { minX: number; maxX: number; minY: number; maxY: number };
  readonly register?: (key: string) => (element: SVGElement | null) => void;
  readonly title: string;
  readonly className?: string;
}

function Figure({ animation, frame, view, box, register, title, className = '' }: FigureProps) {
  const lines = linesFor(frame, view);
  const highlighted = new Set<string>(animation.highlight.segments);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const ref = (key: string) => (register ? register(key) : undefined);

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`${box.minX} ${-box.maxY} ${width} ${height}`}
      className={`h-auto w-full ${className}`}
      preserveAspectRatio="xMidYMax meet"
    >
      {/* The floor. */}
      <line
        x1={box.minX}
        x2={box.maxX}
        y1={0}
        y2={0}
        stroke="var(--color-line-strong)"
        strokeWidth={1.5}
      />

      {view === 'front' ? (
        <>
          <line
            ref={ref('girdle-shoulders')}
            x1={-BODY.shoulderHalf}
            x2={BODY.shoulderHalf}
            y1={-frame.shoulder.y}
            y2={-frame.shoulder.y}
            stroke="var(--color-ink)"
            strokeWidth={7}
            strokeLinecap="round"
          />
          <line
            ref={ref('girdle-hips')}
            x1={-BODY.hipHalf}
            x2={BODY.hipHalf}
            y1={-frame.pelvis.y}
            y2={-frame.pelvis.y}
            stroke="var(--color-ink)"
            strokeWidth={7}
            strokeLinecap="round"
          />
        </>
      ) : null}

      {SEGMENTS.map((segment) => {
        const line = lines[segment.name];
        const far = isFar(segment.name);
        const lit = highlighted.has(segment.name);
        return (
          <line
            key={segment.name}
            ref={ref(`seg-${segment.name}`)}
            data-segment={segment.name}
            {...line}
            stroke={
              lit ? 'var(--color-accent)' : far ? 'var(--color-ink-muted)' : 'var(--color-ink)'
            }
            strokeOpacity={far && !lit ? 0.55 : 1}
            strokeWidth={WIDTH[segment.name] ?? 6}
            strokeLinecap="round"
          />
        );
      })}

      <circle
        ref={ref('head')}
        cx={frame.head.x}
        cy={-frame.head.y}
        r={BODY.headRadius}
        fill="var(--color-surface)"
        stroke="var(--color-ink)"
        strokeWidth={3}
      />

      {animation.highlight.joints.map((joint) => (
        <circle
          key={joint}
          ref={ref(`joint-${joint}`)}
          data-joint={joint}
          cx={frame[joint].x}
          cy={-frame[joint].y}
          r={5.5}
          fill="var(--color-accent-soft)"
          stroke="var(--color-accent)"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

/** Mid-points of each captioned step: the frames a still sequence shows. */
function stillPhases(animation: ExerciseAnimation): { phase: number; text: string }[] {
  return animation.cues.map((cue) => ({ phase: (cue.from + cue.to) / 2, text: cue.text }));
}

export function MannequinPlayer({ animation }: MannequinPlayerProps) {
  const reducedMotion = useReducedMotion();
  const [stillsChoice, setStillsChoice] = useState<boolean | null>(null);
  const showStills = stillsChoice ?? reducedMotion;

  const [view, setView] = useState<MannequinView>('side');
  const [speed, setSpeed] = useState<'0.5' | '1'>('1');
  const [playing, setPlaying] = useState(false);
  const [cueText, setCueText] = useState(() => cueAt(animation, 0)?.text ?? '');

  const elapsed = useRef(0);
  const elements = useRef(new Map<string, SVGElement>());
  const scrubber = useRef<HTMLInputElement>(null);
  const lastCue = useRef(cueText);

  const box = useMemo(() => boundsOf(animation, view), [animation, view]);
  const [initialFrame] = useState(() => frameAt(animation, 0, 'side'));

  const register = useCallback(
    (key: string) => (element: SVGElement | null) => {
      if (element) elements.current.set(key, element);
      else elements.current.delete(key);
    },
    [],
  );

  /** Moves the figure to a phase by writing attributes. No React render. */
  const draw = useCallback(
    (phase: number) => {
      const frame = frameAt(animation, phase, view);
      const lines = linesFor(frame, view);
      const map = elements.current;

      for (const segment of SEGMENTS) {
        const element = map.get(`seg-${segment.name}`);
        if (!element) continue;
        const line = lines[segment.name];
        element.setAttribute('x1', line.x1.toFixed(2));
        element.setAttribute('y1', line.y1.toFixed(2));
        element.setAttribute('x2', line.x2.toFixed(2));
        element.setAttribute('y2', line.y2.toFixed(2));
      }
      const head = map.get('head');
      head?.setAttribute('cx', frame.head.x.toFixed(2));
      head?.setAttribute('cy', (-frame.head.y).toFixed(2));
      for (const joint of animation.highlight.joints) {
        const element = map.get(`joint-${joint}`);
        element?.setAttribute('cx', frame[joint].x.toFixed(2));
        element?.setAttribute('cy', (-frame[joint].y).toFixed(2));
      }
      for (const [key, y] of [
        ['girdle-shoulders', frame.shoulder.y],
        ['girdle-hips', frame.pelvis.y],
      ] as const) {
        const element = map.get(key);
        element?.setAttribute('y1', (-y).toFixed(2));
        element?.setAttribute('y2', (-y).toFixed(2));
      }

      if (scrubber.current) scrubber.current.value = String(Math.round(phase * 1000));
      const text = cueAt(animation, phase)?.text ?? '';
      if (text !== lastCue.current) {
        lastCue.current = text;
        setCueText(text);
      }
    },
    [animation, view],
  );

  // Redraw in place whenever what is drawn changes shape (view switch) or the
  // stills are swapped back for the figure.
  useEffect(() => {
    if (!showStills) draw(phaseAt(animation, elapsed.current));
  }, [animation, draw, showStills]);

  useEffect(() => {
    if (!playing || showStills) return;
    let frameId = 0;
    let last: number | null = null;
    const rate = Number(speed);

    const tick = (now: number) => {
      if (last !== null) elapsed.current += (now - last) * rate;
      last = now;
      draw(phaseAt(animation, elapsed.current));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [animation, draw, playing, showStills, speed]);

  const restart = () => {
    elapsed.current = 0;
    draw(0);
    setPlaying(true);
  };

  const viewOptions = animation.views.map((option) => ({
    value: option,
    label: option === 'side' ? 'Side' : 'Front',
  }));

  return (
    <figure className="space-y-3" data-testid="mannequin-player">
      <p className="rounded-lg bg-sunken px-3 py-2 text-body-sm text-ink-muted">
        An instructional aid. It shows what the movement is meant to look like. It cannot see you,
        so it is not an assessment of your form.
      </p>

      <Switch
        label="Show the steps as stills"
        checked={showStills}
        onChange={(next) => {
          setPlaying(false);
          setStillsChoice(next);
        }}
      />

      {showStills ? (
        <ol
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label={`${animation.title}, step by step`}
        >
          {stillPhases(animation).map((still, index) => (
            <li key={still.text} className="rounded-lg border border-line p-2">
              <Figure
                animation={animation}
                frame={frameAt(animation, still.phase, view)}
                view={view}
                box={box}
                title={`Step ${index + 1}: ${still.text}`}
                className="max-h-40"
              />
              <p className="mt-1 text-body-sm text-ink">
                <span className="text-ink-muted">{index + 1}.</span> {still.text}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <div className="rounded-xl bg-surface p-2">
            <Figure
              // Remounted on a view change so the girdle lines exist (or not).
              key={view}
              animation={animation}
              frame={view === 'side' ? initialFrame : frameAt(animation, 0, view)}
              view={view}
              box={box}
              register={register}
              title={`${animation.title}, ${view} view`}
              className="mx-auto max-h-72"
            />
          </div>
          <figcaption className="min-h-12 text-body text-ink" data-testid="mannequin-caption">
            {cueText}
          </figcaption>

          <input
            ref={scrubber}
            type="range"
            min={0}
            max={1000}
            defaultValue={0}
            aria-label="Position in the movement"
            className="w-full accent-[var(--color-accent)]"
            onChange={(event) => {
              setPlaying(false);
              const phase = Number(event.target.value) / 1000;
              elapsed.current = phase * animation.durationMs;
              draw(phase);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => setPlaying((current) => !current)}
              icon={playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button size="sm" variant="quiet" onClick={restart}>
              Restart
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SegmentedControl
              legend="Speed"
              value={speed}
              onChange={setSpeed}
              options={[
                { value: '0.5', label: '0.5×' },
                { value: '1', label: '1×' },
              ]}
            />
            {viewOptions.length > 1 ? (
              <SegmentedControl
                legend="View"
                value={view}
                onChange={setView}
                options={viewOptions}
              />
            ) : null}
          </div>
        </>
      )}

      <p className="text-body-sm text-ink-muted">
        <span
          className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-accent align-middle"
          aria-hidden="true"
        />
        Highlighted: {animation.highlight.label}
      </p>
    </figure>
  );
}
