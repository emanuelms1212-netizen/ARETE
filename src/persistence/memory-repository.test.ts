import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from './memory-repository';
import { DEMO_TODAY, demoDays } from './demo-data';

describe('memory repository', () => {
  it('returns the demo day for a known date', async () => {
    const day = await createMemoryRepository().getDay(DEMO_TODAY);

    expect(day?.date).toBe(DEMO_TODAY);
    expect(day?.commitments.length).toBeGreaterThan(0);
  });

  it('returns null rather than an empty day for an unknown date', async () => {
    expect(await createMemoryRepository().getDay('1999-01-01')).toBeNull();
  });

  it('lists days newest first', async () => {
    const days = await createMemoryRepository().listDays();

    expect(days.map((day) => day.date)).toEqual(['2026-03-16', '2026-03-15', '2026-03-14']);
  });

  it('is deterministic across instances', async () => {
    const first = await createMemoryRepository().listDays();
    const second = await createMemoryRepository().listDays();

    expect(first).toEqual(second);
  });

  it('includes the awkward states the UI has to survive', async () => {
    const statuses = demoDays.flatMap((day) => day.commitments.map((c) => c.status));

    expect(statuses).toContain('done');
    expect(statuses).toContain('pending');
    expect(statuses).toContain('skipped');
    expect(demoDays.some((day) => day.mark === 'travel')).toBe(true);
  });
});
