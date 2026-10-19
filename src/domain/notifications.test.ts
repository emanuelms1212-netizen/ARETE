import { describe, expect, it } from 'vitest';
import {
  BANNED_REMINDER_WORDS,
  dueNotifications,
  inQuietHours,
  notificationPreferencesSchema,
  planNotifications,
  shouldAutoMute,
  snoozeUntil,
  type DayState,
  type NotificationEvent,
} from './notifications';

const prefs = (input: object = {}) =>
  notificationPreferencesSchema.parse({
    morningPlanAt: '08:00',
    eveningReviewAt: '21:00',
    openItemsAt: '12:30',
    modules: { today: true, habits: true, train: true, programs: true, reflection: true },
    dailyCap: 6,
    ...input,
  });

const day = (input: Partial<DayState> = {}): DayState => ({
  localDate: '2026-03-16',
  timeZone: 'Europe/London',
  hasPlan: true,
  reviewWritten: false,
  openItems: [
    { id: 'c1', title: 'Read ten pages', kind: 'habit' },
    { id: 'c2', title: 'Call the bank', kind: 'task' },
  ],
  trainingToday: true,
  programDay: 4,
  isWeekReviewDay: false,
  firstDay: false,
  ...input,
});

const kinds = (result: ReturnType<typeof planNotifications>) =>
  result.planned.map((n) => `${n.kind}@${n.at}`);

describe('defaults', () => {
  it('send nothing until the person sets a time and turns a module on', () => {
    expect(planNotifications(notificationPreferencesSchema.parse({}), day()).planned).toEqual([]);
  });

  it('send nothing on the first day', () => {
    expect(planNotifications(prefs(), day({ firstDay: true })).planned).toEqual([]);
  });

  it('cap the day at two unless the person chooses otherwise', () => {
    expect(notificationPreferencesSchema.parse({}).dailyCap).toBe(2);
  });
});

describe('the plan', () => {
  it('bundles low-priority reminders into one', () => {
    const result = planNotifications(prefs(), day());
    expect(kinds(result)).toEqual([
      'morning_plan@08:00',
      'open_items@12:30',
      'evening_review@21:00',
    ]);
    const bundle = result.planned.find((n) => n.key === 'bundle')!;
    expect(bundle.title).toBe('A few things for today');
    expect(bundle.body).toContain('2 things still open');
    expect(bundle.body).toContain('Reset day 4');
    expect(bundle.items).toEqual(['c1', 'c2']);
  });

  it('respects module toggles', () => {
    const result = planNotifications(prefs({ modules: { today: true } }), day());
    expect(kinds(result)).toEqual(['morning_plan@08:00', 'evening_review@21:00']);
  });

  it('skips the evening review once it is written', () => {
    expect(kinds(planNotifications(prefs(), day({ reviewWritten: true })))).not.toContain(
      'evening_review@21:00',
    );
  });

  it('enforces the daily cap, keeping the high-priority ones', () => {
    const result = planNotifications(prefs({ dailyCap: 2 }), day());
    expect(kinds(result)).toEqual(['morning_plan@08:00', 'evening_review@21:00']);
    expect(result.withheld.some((entry) => /daily limit of 2/.test(entry.reason))).toBe(true);
  });

  it('never sends two within an hour', () => {
    const result = planNotifications(
      prefs({ morningPlanAt: '12:00', openItemsAt: '12:15' }),
      day(),
    );
    expect(kinds(result)).toEqual([
      'morning_plan@12:00',
      'open_items@13:00',
      'evening_review@21:00',
    ]);
  });
});

describe('quiet hours', () => {
  it('cover times across midnight', () => {
    expect(inQuietHours('23:30', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('13:30', '13:00', '14:00')).toBe(true);
  });

  it('move a morning reminder to their end, and hold back a late one', () => {
    const result = planNotifications(
      prefs({ morningPlanAt: '06:15', eveningReviewAt: '22:30' }),
      day(),
    );
    expect(kinds(result)).toContain('morning_plan@07:00');
    expect(kinds(result).some((entry) => entry.startsWith('evening_review'))).toBe(false);
    expect(result.withheld.some((entry) => /quiet hours/.test(entry.reason))).toBe(true);
  });

  it('never let spacing push a reminder into them', () => {
    const result = planNotifications(
      prefs({ eveningReviewAt: '21:30', openItemsAt: '21:15' }),
      day(),
    );
    expect(result.planned.every((n) => !inQuietHours(n.at, '22:00', '07:00'))).toBe(true);
  });
});

describe('time zones and travel', () => {
  it('keep local times when the zone changes, and move the instant with it', () => {
    const london = planNotifications(prefs(), day());
    const newYork = planNotifications(prefs(), day({ timeZone: 'America/New_York' }));
    expect(kinds(london)).toEqual(kinds(newYork));
    expect(london.planned[0]!.instant.toISOString()).toBe('2026-03-16T08:00:00.000Z');
    expect(newYork.planned[0]!.instant.toISOString()).toBe('2026-03-16T12:00:00.000Z');
  });

  it('handle a daylight-saving morning', () => {
    const result = planNotifications(prefs(), day({ localDate: '2026-03-29' }));
    expect(result.planned[0]!.instant.toISOString()).toBe('2026-03-29T07:00:00.000Z');
  });
});

describe('sacred practice reminders', () => {
  it('stay off unless enabled, and then use only the person’s own words', () => {
    expect(
      kinds(planNotifications(prefs({ sacredAt: '18:00', sacredText: 'Mincha' }), day())),
    ).not.toContain('sacred@18:00');
    const on = planNotifications(
      prefs({ sacredEnabled: true, sacredAt: '18:00', sacredText: 'Mincha' }),
      day(),
    );
    const sacred = on.planned.find((n) => n.kind === 'sacred')!;
    expect(sacred.title).toBe('Mincha');
    expect(sacred.body).toBe('');
    expect(
      planNotifications(prefs({ sacredEnabled: true, sacredAt: '18:00' }), day()).planned.some(
        (n) => n.kind === 'sacred',
      ),
    ).toBe(false);
  });
});

describe('tone', () => {
  it('never uses guilt, scarcity or urgency', () => {
    for (const variant of [
      day(),
      day({ openItems: [{ id: 'x', title: 'One', kind: 'task' }] }),
      day({ isWeekReviewDay: true }),
    ]) {
      for (const bundle of [true, false]) {
        const result = planNotifications(prefs({ bundleLowPriority: bundle }), variant);
        for (const n of result.planned) {
          expect(`${n.title} ${n.body}`).not.toMatch(BANNED_REMINDER_WORDS);
        }
      }
    }
  });
});

describe('the inbox', () => {
  const plan = planNotifications(prefs(), day()).planned;
  const at = (time: string) => new Date(`2026-03-16T${time}:00Z`);

  it('shows a reminder once its time has come, until it is answered', () => {
    expect(dueNotifications(plan, [], at('07:59')).map((n) => n.key)).toEqual([]);
    expect(dueNotifications(plan, [], at('13:00')).map((n) => n.key)).toEqual([
      'morning_plan',
      'bundle',
    ]);
    const done: NotificationEvent = {
      localDate: '2026-03-16',
      key: 'morning_plan',
      kind: 'morning_plan',
      action: 'done',
      snoozedUntil: null,
    };
    expect(dueNotifications(plan, [done], at('13:00')).map((n) => n.key)).toEqual(['bundle']);
  });

  it('brings a snoozed one back after the hour', () => {
    const snoozed: NotificationEvent = {
      localDate: '2026-03-16',
      key: 'bundle',
      kind: 'open_items',
      action: 'snoozed',
      snoozedUntil: '2026-03-16T13:30:00.000Z',
    };
    expect(dueNotifications(plan, [snoozed], at('13:00')).map((n) => n.key)).toEqual([
      'morning_plan',
    ]);
    expect(dueNotifications(plan, [snoozed], at('13:31')).map((n) => n.key)).toEqual([
      'morning_plan',
      'bundle',
    ]);
  });

  it('will not snooze into quiet hours', () => {
    expect(snoozeUntil(at('12:30'), '12:30', prefs())).toEqual(at('13:30'));
    expect(snoozeUntil(at('21:30'), '21:30', prefs())).toBeNull();
  });

  it('mutes a kind dismissed on two days running', () => {
    const dismissed = (localDate: string): NotificationEvent => ({
      localDate,
      key: 'morning_plan',
      kind: 'morning_plan',
      action: 'dismissed',
      snoozedUntil: null,
    });
    expect(shouldAutoMute([dismissed('2026-03-15')], 'morning_plan')).toBe(false);
    expect(shouldAutoMute([dismissed('2026-03-14'), dismissed('2026-03-16')], 'morning_plan')).toBe(
      false,
    );
    expect(shouldAutoMute([dismissed('2026-03-15'), dismissed('2026-03-16')], 'morning_plan')).toBe(
      true,
    );
  });

  it('honours a mute in the plan, and says so', () => {
    const result = planNotifications(prefs({ autoMuted: ['morning_plan'] }), day());
    expect(kinds(result)).not.toContain('morning_plan@08:00');
    expect(result.withheld[0]?.reason).toMatch(/dismissed twice/);
  });
});
