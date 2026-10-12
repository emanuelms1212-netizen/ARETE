import { describe, expect, it } from 'vitest';
import {
  RATING_LABELS,
  describeOutcome,
  finishMindPatch,
  pauseMindPatch,
  playerView,
  practisedSeconds,
  resumeMindPatch,
  type MindSession,
} from './mind';

const START = new Date('2026-03-16T07:00:00Z');

function session(overrides: Partial<MindSession> = {}): MindSession {
  return {
    id: 'm1',
    kind: 'meditation',
    practiceSlug: 'breath-awareness',
    status: 'running',
    startedAt: START,
    endedAt: null,
    pausedAt: null,
    accumulatedSeconds: 0,
    plannedMinutes: 10,
    rating: null,
    reflection: null,
    ...overrides,
  };
}

const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);

describe('practisedSeconds', () => {
  it('derives elapsed from the clock rather than counting ticks', () => {
    expect(practisedSeconds(session(), at(120))).toBe(120);
  });

  it('survives backgrounding: the same answer however often it is asked', () => {
    const running = session();
    expect(practisedSeconds(running, at(437))).toBe(437);
    expect(practisedSeconds(running, at(437))).toBe(437);
  });

  it('stops while paused, however long the phone was asleep', () => {
    const paused = session({ accumulatedSeconds: 60, pausedAt: at(60) });

    expect(practisedSeconds(paused, at(60))).toBe(60);
    expect(practisedSeconds(paused, at(100_000))).toBe(60);
  });

  it('freezes once finished', () => {
    const done = session({ status: 'completed', accumulatedSeconds: 600, endedAt: at(600) });
    expect(practisedSeconds(done, at(99_999))).toBe(600);
  });

  it('never goes negative when the device clock moves back', () => {
    expect(practisedSeconds(session(), new Date(START.getTime() - 60_000))).toBe(0);
  });
});

describe('playerView', () => {
  it('starts in preparation when nothing is running', () => {
    expect(playerView(null, at(0)).stage).toBe('prepare');
  });

  it('counts down towards the chosen length', () => {
    const view = playerView(session(), at(120));

    expect(view.remainingSeconds).toBe(480);
    expect(view.ratio).toBeCloseTo(0.2, 5);
    expect(view.label).toBe('Running');
  });

  it('does not stop at zero, and says it is over', () => {
    const view = playerView(session(), at(700));

    expect(view.isOverrun).toBe(true);
    expect(view.remainingSeconds).toBe(0);
    expect(view.label).toBe('Over');
  });

  it('reports paused distinctly from running', () => {
    const view = playerView(session({ accumulatedSeconds: 30, pausedAt: at(30) }), at(900));

    expect(view.stage).toBe('paused');
    expect(view.label).toBe('Paused');
  });

  it('handles a drill with no planned length', () => {
    const view = playerView(session({ kind: 'cognitive', plannedMinutes: null }), at(90));

    expect(view.plannedSeconds).toBeNull();
    expect(view.remainingSeconds).toBeNull();
    expect(view.ratio).toBe(0);
  });
});

describe('pause, resume and finish', () => {
  it('does not count paused time as practice', () => {
    const paused = { ...session(), ...pauseMindPatch(session(), at(120)) };
    const resumed = { ...paused, ...resumeMindPatch(at(3600)) };

    expect(practisedSeconds(resumed, at(3660))).toBe(180);
  });

  it('banks the final segment on finishing', () => {
    const patch = finishMindPatch(session(), at(600), 'completed');

    expect(patch.accumulatedSeconds).toBe(600);
    expect(patch.status).toBe('completed');
  });

  it('banks correctly when finishing from paused', () => {
    const paused = { ...session(), ...pauseMindPatch(session(), at(120)) };

    expect(finishMindPatch(paused, at(9000), 'abandoned').accumulatedSeconds).toBe(120);
  });
});

describe('describeOutcome', () => {
  it('states a completed session plainly', () => {
    const done = session({ status: 'completed', accumulatedSeconds: 600 });
    expect(describeOutcome(done, at(600))).toBe('10 min.');
  });

  it('treats stopping early as a legitimate end, not a failure', () => {
    const stopped = session({ status: 'abandoned', accumulatedSeconds: 240 });
    const text = describeOutcome(stopped, at(240));

    expect(text).toContain('4 min of 10');
    expect(text).toContain('Stopping when you need to is fine.');
    expect(text.toLowerCase()).not.toMatch(/failed|incomplete|gave up|only|just/);
  });
});

describe('the ratings', () => {
  it('describe how the session went, not how well it was done', () => {
    const labels = Object.values(RATING_LABELS).join(' ').toLowerCase();

    expect(labels).not.toMatch(/bad|poor|good|great|excellent|failed|success/);
    expect(RATING_LABELS[1]).toBe('Hard going');
  });
});
