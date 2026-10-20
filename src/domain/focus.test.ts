import { describe, expect, it } from 'vitest';
import {
  countsAsFocus,
  describeLink,
  elapsedSeconds,
  finishPatch,
  formatDuration,
  pausePatch,
  presetBySlug,
  resumePatch,
  timerView,
  type FocusSession,
} from './focus';

const START = new Date('2026-03-16T09:00:00Z');

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 'f1',
    kind: 'work',
    status: 'running',
    plannedMinutes: 25,
    startedAt: START,
    endedAt: null,
    pausedAt: null,
    accumulatedSeconds: 0,
    interruptions: 0,
    taskId: null,
    taskTitleSnapshot: null,
    goalId: null,
    goalTitleSnapshot: null,
    preset: 'classic',
    reflection: null,
    ...overrides,
  };
}

function at(seconds: number): Date {
  return new Date(START.getTime() + seconds * 1000);
}

describe('elapsedSeconds', () => {
  it('derives elapsed from the clock rather than from a stored countdown', () => {
    expect(elapsedSeconds(session(), at(300))).toBe(300);
  });

  it('is identical however many times it is asked — a refresh loses nothing', () => {
    const running = session();
    const answers = [
      elapsedSeconds(running, at(742)),
      elapsedSeconds(running, at(742)),
      elapsedSeconds(running, at(742)),
    ];

    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBe(742);
  });

  it('stops counting while paused', () => {
    const paused = session({ accumulatedSeconds: 120, pausedAt: at(120) });

    expect(elapsedSeconds(paused, at(120))).toBe(120);
    expect(elapsedSeconds(paused, at(9999))).toBe(120);
  });

  it('freezes at the banked total once the session has ended', () => {
    const done = session({ status: 'completed', accumulatedSeconds: 1500, endedAt: at(1500) });

    expect(elapsedSeconds(done, at(99_999))).toBe(1500);
  });

  it('never goes negative when the device clock moves backwards', () => {
    // A phone correcting its time, or a session restored on a skewed machine.
    expect(elapsedSeconds(session(), new Date(START.getTime() - 60_000))).toBe(0);
  });
});

describe('pause and resume', () => {
  it('banks the live segment when pausing', () => {
    const patch = pausePatch(session(), at(300));

    expect(patch.accumulatedSeconds).toBe(300);
    expect(patch.pausedAt).toEqual(at(300));
  });

  it('counts a pause as an interruption, because that is what it is', () => {
    expect(pausePatch(session({ interruptions: 2 }), at(10)).interruptions).toBe(3);
  });

  it('does not count paused time as focus across a pause and resume', () => {
    // Run 5 minutes, pause, wait an hour, resume, run 5 more.
    const paused = { ...session(), ...pausePatch(session(), at(300)) };
    const resumed = { ...paused, ...resumePatch(at(3900)) };

    expect(elapsedSeconds(resumed, new Date(at(3900).getTime() + 300_000))).toBe(600);
  });

  it('survives a refresh mid-pause, then resumes correctly', () => {
    const paused = { ...session(), ...pausePatch(session(), at(300)) };

    // Three "page loads" while paused all agree.
    expect(elapsedSeconds(paused, at(600))).toBe(300);
    expect(elapsedSeconds(paused, at(1200))).toBe(300);

    const resumed = { ...paused, ...resumePatch(at(1200)) };
    expect(elapsedSeconds(resumed, new Date(at(1200).getTime() + 60_000))).toBe(360);
  });

  it('handles several pause cycles without drift', () => {
    let current = session();
    let clock = 0;

    for (let cycle = 0; cycle < 5; cycle += 1) {
      clock += 60;
      current = { ...current, ...pausePatch(current, at(clock)) };
      clock += 600; // paused for ten minutes
      current = { ...current, ...resumePatch(at(clock)) };
    }

    clock += 60;
    expect(elapsedSeconds(current, at(clock))).toBe(360);
    expect(current.interruptions).toBe(5);
  });
});

describe('timerView', () => {
  it('counts down from the planned time', () => {
    const view = timerView(session(), at(300));

    expect(view.remainingSeconds).toBe(1200);
    expect(view.ratio).toBeCloseTo(0.2, 5);
    expect(view.label).toBe('Running');
  });

  it('does not stop itself at zero, and says it is over', () => {
    const view = timerView(session(), at(1800));

    expect(view.remainingSeconds).toBe(0);
    expect(view.isOvertime).toBe(true);
    expect(view.overtimeSeconds).toBe(300);
    expect(view.ratio).toBe(1);
    expect(view.label).toBe('Over');
  });

  it('reports paused separately from running', () => {
    const paused = session({ accumulatedSeconds: 60, pausedAt: at(60) });
    const view = timerView(paused, at(900));

    expect(view.isPaused).toBe(true);
    expect(view.isRunning).toBe(false);
    expect(view.label).toBe('Paused');
  });

  it('describes a finished session as finished', () => {
    const done = session({ status: 'completed', accumulatedSeconds: 1500, endedAt: at(1500) });

    expect(timerView(done, at(2000)).label).toBe('Finished');
    expect(timerView(done, at(2000)).isRunning).toBe(false);
  });

  it('describes an abandoned session without judging it', () => {
    const stopped = session({ status: 'abandoned', accumulatedSeconds: 70, endedAt: at(70) });

    expect(timerView(stopped, at(2000)).label).toBe('Stopped');
  });
});

describe('formatDuration', () => {
  it('shows mm:ss under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(1500)).toBe('25:00');
  });

  it('shows h:mm:ss past an hour', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('never renders a negative clock', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });
});

describe('finishPatch', () => {
  it('banks the final segment and stops the clock', () => {
    const patch = finishPatch(session(), at(1500), 'completed');

    expect(patch.accumulatedSeconds).toBe(1500);
    expect(patch.status).toBe('completed');
    expect(patch.pausedAt).toBeNull();
  });

  it('banks correctly when finishing from a paused state', () => {
    const paused = { ...session(), ...pausePatch(session(), at(300)) };
    const patch = finishPatch(paused, at(9000), 'completed');

    expect(patch.accumulatedSeconds).toBe(300);
  });
});

describe('countsAsFocus', () => {
  it('ignores a session abandoned after a few seconds', () => {
    expect(countsAsFocus(session(), at(9))).toBe(false);
  });

  it('counts a minute of real work', () => {
    expect(countsAsFocus(session(), at(60))).toBe(true);
  });

  it('never counts a break as focus', () => {
    expect(countsAsFocus(session({ kind: 'break' }), at(600))).toBe(false);
  });
});

describe('presets and links', () => {
  it('finds a preset by slug', () => {
    expect(presetBySlug('deep')?.workMinutes).toBe(50);
  });

  it('is null for an unknown or absent slug', () => {
    expect(presetBySlug('invented')).toBeNull();
    expect(presetBySlug(null)).toBeNull();
  });

  it('describes a session by the task it was linked to', () => {
    expect(describeLink(session({ taskTitleSnapshot: 'Draft the report' }))).toBe(
      'Draft the report',
    );
  });

  it('falls back to the goal, then to saying so', () => {
    expect(describeLink(session({ goalTitleSnapshot: 'Ship v1' }))).toBe('Ship v1');
    expect(describeLink(session())).toBe('Unlinked');
  });
});

describe('timer announcements', () => {
  it('changes only every five minutes, then for the last minute and the end', async () => {
    const { timerAnnouncement } = await import('./focus');
    const heard = new Set<string>();
    for (let seconds = 25 * 60; seconds >= 0; seconds -= 1) heard.add(timerAnnouncement(seconds));
    // 25, 20, 15, 10, 5 minutes, the last minute, and the end: seven things in 25 minutes.
    expect([...heard]).toEqual([
      'About 25 minutes remaining.',
      'About 20 minutes remaining.',
      'About 15 minutes remaining.',
      'About 10 minutes remaining.',
      'About 5 minutes remaining.',
      'Less than a minute remaining.',
      'Time is up.',
    ]);
    expect(timerAnnouncement(0, 30)).toBe('Time is up.');
  });
});
