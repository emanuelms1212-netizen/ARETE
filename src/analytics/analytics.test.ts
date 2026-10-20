import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_MODULES, ANALYTICS_REMINDER_KINDS, analyticsEventSchemas } from './events';
import { getAnalyticsSink, noopSink, setAnalyticsSink, track } from './client';

describe('analytics', () => {
  beforeEach(() => {
    setAnalyticsSink(noopSink);
  });

  it('defaults to a sink that sends nothing anywhere', () => {
    expect(getAnalyticsSink().name).toBe('noop');
  });

  it('emits a valid event to the sink', () => {
    const record = vi.fn();
    setAnalyticsSink({ name: 'test', record });

    track('focus_session_completed', { actualMinutes: 25, interruptions: 1 });

    expect(record).toHaveBeenCalledWith('focus_session_completed', {
      actualMinutes: 25,
      interruptions: 1,
    });
  });

  it('drops an invalid payload instead of sending it', () => {
    const record = vi.fn();
    setAnalyticsSink({ name: 'test', record });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // @ts-expect-error deliberately wrong payload
    track('focus_session_completed', { actualMinutes: 'twenty-five' });

    expect(record).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('defines no event that can carry free text the user typed', () => {
    const banned = /note|text|title|description|content|entry|answer|reflection|journal/i;

    for (const [name, schema] of Object.entries(analyticsEventSchemas)) {
      for (const key of Object.keys(schema.shape)) {
        expect(banned.test(key), `${name}.${key} looks like free text`).toBe(false);
      }
    }
  });

  it('carries no journal, food, injury or religious data, even by name', () => {
    const names = Object.keys(analyticsEventSchemas).join(' ');
    expect(names).not.toMatch(/food|meal|weight|injur|pain|health|pregnan|journal|sacred|relig/i);
    expect(ANALYTICS_MODULES as readonly string[]).not.toContain('sacred');
    expect(ANALYTICS_REMINDER_KINDS as readonly string[]).not.toContain('sacred');
    expect(analyticsEventSchemas.notification_muted.safeParse({ kind: 'sacred' }).success).toBe(
      false,
    );
    expect(
      analyticsEventSchemas.module_enabled.safeParse({ moduleId: 'contrast_therapy' }).success,
    ).toBe(false);
  });

  it('strips fields an event does not define before anything reaches the sink', () => {
    const record = vi.fn();
    setAnalyticsSink({ name: 'test', record });
    // @ts-expect-error an extra field is not part of the event
    track('data_exported', { note: 'my private words' });
    expect(record).toHaveBeenCalledWith('data_exported', {});
  });
});
