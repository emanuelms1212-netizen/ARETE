import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from './memory-repository';
import { describeRepositoryContract } from './repository-contract';
import { DEMO_TODAY, DEMO_USER_ID, demoDays } from './demo-data';

describeRepositoryContract('memory', async () => {
  // An empty account: no demo days and no demo goals, tasks or habits. The
  // contract describes what the repository promises, not what the demo seed
  // happens to contain.
  let repository = createMemoryRepository('contract-user', [], null);
  return {
    get repository() {
      return repository;
    },
    userId: 'contract-user',
    async reset() {
      repository = createMemoryRepository('contract-user', [], null);
    },
  };
});

describe('the demo seed', () => {
  it('serves the fixed sample day', async () => {
    const repository = createMemoryRepository(DEMO_USER_ID);
    const day = await repository.getDay(DEMO_USER_ID, DEMO_TODAY);

    expect(day?.date).toBe(DEMO_TODAY);
    expect(day?.commitments.length).toBeGreaterThan(0);
  });

  it('is deterministic across instances', async () => {
    const first = await createMemoryRepository(DEMO_USER_ID).listDays(DEMO_USER_ID, {
      from: '2000-01-01',
      to: '2100-01-01',
    });
    const second = await createMemoryRepository(DEMO_USER_ID).listDays(DEMO_USER_ID, {
      from: '2000-01-01',
      to: '2100-01-01',
    });

    expect(first).toEqual(second);
  });

  it('includes the awkward states the UI has to survive', async () => {
    const statuses = demoDays.flatMap((day) => day.commitments.map((c) => c.status));

    expect(statuses).toContain('done');
    expect(statuses).toContain('pending');
    expect(statuses).toContain('skipped');
    expect(demoDays.some((day) => day.mark === 'travel')).toBe(true);
  });

  it("keeps one account's writes out of another's", async () => {
    const repository = createMemoryRepository(DEMO_USER_ID);
    await repository.upsertDay('someone-else', {
      localDate: DEMO_TODAY,
      timeZone: 'UTC',
      commitments: [{ kind: 'task', title: 'Not yours' }],
    });

    const demoDay = await repository.getDay(DEMO_USER_ID, DEMO_TODAY);
    expect(demoDay?.commitments.some((c) => c.title === 'Not yours')).toBe(false);
  });
});
