import { z } from 'zod';
import { zonedTimeToInstant } from './local-day';
import type { IsoDate } from './types';

/**
 * Quiet notifications.
 *
 * A day's reminders are planned, not fired ad hoc: from the person's own
 * settings and the day's real state, one function decides what is worth
 * saying and when, inside their quiet hours, under their daily cap, at most
 * one an hour, with low-priority reminders bundled into one. The wording
 * never uses guilt, scarcity or urgency (PRODUCT_SPEC §8). Times are local:
 * travel changes the time zone and the reminders follow the person's clock.
 */

export const NOTIFICATION_MODULES = ['today', 'habits', 'train', 'programs', 'reflection'] as const;
export type NotificationModule = (typeof NOTIFICATION_MODULES)[number];

export const NOTIFICATION_MODULE_LABEL: Record<NotificationModule, string> = {
  today: 'Today: the morning plan and the evening review',
  habits: 'Habits and tasks still open',
  train: 'Training and flexibility days',
  programs: 'Programme days, like the reset',
  reflection: 'The weekly review',
};

export const NOTIFICATION_KINDS = [
  'morning_plan',
  'evening_review',
  'open_items',
  'training_day',
  'program_day',
  'weekly_review',
  'sacred',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  morning_plan: 'Morning plan',
  evening_review: 'Evening review',
  open_items: 'Things still open',
  training_day: 'Training days',
  program_day: 'Programme days',
  weekly_review: 'Weekly review',
  sacred: 'Your practice reminder',
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 07:30.');

export const notificationPreferencesSchema = z.object({
  morningPlanAt: time.nullable().default(null),
  eveningReviewAt: time.nullable().default(null),
  /** A gentle nudge for things still open, bundled into one. */
  openItemsAt: time.nullable().default(null),
  modules: z.partialRecord(z.enum(NOTIFICATION_MODULES), z.boolean()).default({}),
  quietStart: time.default('22:00'),
  quietEnd: time.default('07:00'),
  dailyCap: z.int().min(1).max(6).default(2),
  bundleLowPriority: z.boolean().default(true),
  /** Religious or sacred practice: off unless chosen, in the person's own words only. */
  sacredEnabled: z.boolean().default(false),
  sacredAt: time.nullable().default(null),
  sacredText: z.string().trim().max(140).nullable().default(null),
  autoMuted: z.array(z.enum(NOTIFICATION_KINDS)).default([]),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export function moduleOn(
  preferences: NotificationPreferences,
  module: NotificationModule,
): boolean {
  return preferences.modules[module] ?? false;
}

export interface DayState {
  readonly localDate: IsoDate;
  readonly timeZone: string;
  readonly hasPlan: boolean;
  readonly reviewWritten: boolean;
  readonly openItems: readonly {
    readonly id: string;
    readonly title: string;
    readonly kind: string;
  }[];
  readonly trainingToday: boolean;
  readonly programDay: number | null;
  readonly isWeekReviewDay: boolean;
  /** No notifications on someone's first day (PRODUCT_SPEC §8). */
  readonly firstDay: boolean;
}

export interface PlannedNotification {
  /** Stable for the day: the same reminder has the same key on every plan. */
  readonly key: string;
  readonly kind: NotificationKind;
  /** Local time, HH:MM. */
  readonly at: string;
  readonly instant: Date;
  readonly title: string;
  readonly body: string;
  readonly priority: 'high' | 'low';
  /** Commitment ids a "done" action can complete. */
  readonly items: readonly string[];
  readonly href: string;
}

export interface PlanResult {
  readonly planned: readonly PlannedNotification[];
  /** What was left out, and why, in plain words — shown in settings. */
  readonly withheld: readonly { readonly kind: NotificationKind; readonly reason: string }[];
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
const hhmm = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Whether a local time falls inside quiet hours, which may run past midnight. */
export function inQuietHours(at: string, quietStart: string, quietEnd: string): boolean {
  const t = minutes(at);
  const start = minutes(quietStart);
  const end = minutes(quietEnd);
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** Words ARETE never puts in a reminder. Tested against every template. */
export const BANNED_REMINDER_WORDS =
  /\b(streak|don't break|lose|losing|last chance|hurry|now or never|only \d+ left|missed|failing|failed|behind|guilt|shame|urgent)\b/i;

type Draft = Omit<PlannedNotification, 'instant'>;

/**
 * The day's reminders.
 *
 * Order of rules: muted kinds and modules that are off go first; a time in
 * quiet hours moves to the end of quiet hours; low-priority reminders bundle
 * into one; nothing lands within an hour of another; the cap keeps the high
 * priority ones. Pure, so the settings page can show exactly what will
 * happen and why.
 */
export function planNotifications(preferences: NotificationPreferences, day: DayState): PlanResult {
  const withheld: { kind: NotificationKind; reason: string }[] = [];
  if (day.firstDay) {
    return {
      planned: [],
      withheld: [{ kind: 'morning_plan', reason: 'Nothing is sent on your first day.' }],
    };
  }
  const drafts: Draft[] = [];
  const muted = new Set(preferences.autoMuted);
  const add = (draft: Draft, module: NotificationModule | null) => {
    if (module && !moduleOn(preferences, module)) return;
    if (muted.has(draft.kind)) {
      withheld.push({ kind: draft.kind, reason: 'Muted after it was dismissed twice in a row.' });
      return;
    }
    drafts.push(draft);
  };

  if (preferences.morningPlanAt && day.hasPlan) {
    add(
      {
        key: 'morning_plan',
        kind: 'morning_plan',
        at: preferences.morningPlanAt,
        title: 'Your day is ready',
        body: 'A minute to look at today, whenever suits you.',
        priority: 'high',
        items: [],
        href: '/today',
      },
      'today',
    );
  }
  if (preferences.eveningReviewAt && !day.reviewWritten) {
    add(
      {
        key: 'evening_review',
        kind: 'evening_review',
        at: preferences.eveningReviewAt,
        title: 'Two lines before bed',
        body: 'The evening questions are there if you want them.',
        priority: 'high',
        items: [],
        href: '/today',
      },
      'today',
    );
  }
  if (preferences.sacredEnabled && preferences.sacredAt && preferences.sacredText) {
    // The person's own words, exactly, with no wording of ARETE's added.
    drafts.push({
      key: 'sacred',
      kind: 'sacred',
      at: preferences.sacredAt,
      title: preferences.sacredText,
      body: '',
      priority: 'high',
      items: [],
      href: '/today',
    });
  }

  const low: Draft[] = [];
  const lowAt = preferences.openItemsAt ?? preferences.morningPlanAt;
  if (lowAt && day.openItems.length > 0 && moduleOn(preferences, 'habits')) {
    low.push({
      key: 'open_items',
      kind: 'open_items',
      at: lowAt,
      title:
        day.openItems.length === 1
          ? 'One thing still open'
          : `${day.openItems.length} things still open`,
      body: `${day.openItems
        .slice(0, 3)
        .map((item) => item.title)
        .join(', ')}${day.openItems.length > 3 ? ', and more' : ''}. Any of them, or none.`,
      priority: 'low',
      items: day.openItems.map((item) => item.id),
      href: '/today',
    });
  }
  if (lowAt && day.trainingToday && moduleOn(preferences, 'train')) {
    low.push({
      key: 'training_day',
      kind: 'training_day',
      at: lowAt,
      title: 'A training day',
      body: 'There is a session planned. The smaller version counts too.',
      priority: 'low',
      items: [],
      href: '/train',
    });
  }
  if (lowAt && day.programDay !== null && moduleOn(preferences, 'programs')) {
    low.push({
      key: 'program_day',
      kind: 'program_day',
      at: lowAt,
      title: `Reset day ${day.programDay}`,
      body: 'Today’s list is ready when you are.',
      priority: 'low',
      items: [],
      href: '/programs/reset',
    });
  }
  if (lowAt && day.isWeekReviewDay && moduleOn(preferences, 'reflection')) {
    low.push({
      key: 'weekly_review',
      kind: 'weekly_review',
      at: preferences.eveningReviewAt ?? lowAt,
      title: 'The week, in a few lines',
      body: 'The weekly review is open whenever you like.',
      priority: 'low',
      items: [],
      href: '/reflect',
    });
  }
  const lowKept = low.filter((draft) => {
    if (muted.has(draft.kind)) {
      withheld.push({ kind: draft.kind, reason: 'Muted after it was dismissed twice in a row.' });
      return false;
    }
    return true;
  });

  if (preferences.bundleLowPriority && lowKept.length > 1) {
    drafts.push({
      key: 'bundle',
      kind: 'open_items',
      at: lowAt!,
      title: 'A few things for today',
      body: lowKept.map((draft) => draft.title).join(' · '),
      priority: 'low',
      items: lowKept.flatMap((draft) => draft.items),
      href: '/today',
    });
  } else {
    drafts.push(...lowKept);
  }

  // Quiet hours: move to the end of them, the same morning.
  const moved = drafts.map((draft) => {
    if (!inQuietHours(draft.at, preferences.quietStart, preferences.quietEnd)) return draft;
    const end = minutes(preferences.quietEnd);
    if (
      minutes(draft.at) > minutes(preferences.quietStart) &&
      minutes(preferences.quietStart) > end
    ) {
      // Evening side of quiet hours: there is no "later today" left.
      withheld.push({ kind: draft.kind, reason: `${draft.at} is inside your quiet hours.` });
      return null;
    }
    return { ...draft, at: preferences.quietEnd };
  });

  // At most one an hour, earliest first; a clash moves an hour later if that is still allowed.
  const ordered = moved
    .filter((draft): draft is Draft => draft !== null)
    .sort((a, b) => minutes(a.at) - minutes(b.at) || (a.priority === 'high' ? -1 : 1));
  const spaced: Draft[] = [];
  for (const draft of ordered) {
    const last = spaced.at(-1);
    let at = minutes(draft.at);
    if (last && at < minutes(last.at) + 60) at = minutes(last.at) + 60;
    if (at >= 24 * 60 || inQuietHours(hhmm(at), preferences.quietStart, preferences.quietEnd)) {
      withheld.push({
        kind: draft.kind,
        reason: 'No room left outside quiet hours, an hour from the others.',
      });
      continue;
    }
    spaced.push({ ...draft, at: hhmm(at) });
  }

  // The cap: high priority first, then the earliest.
  const byPriority = [...spaced].sort((a, b) =>
    a.priority === b.priority ? minutes(a.at) - minutes(b.at) : a.priority === 'high' ? -1 : 1,
  );
  const kept = new Set(byPriority.slice(0, preferences.dailyCap).map((draft) => draft.key));
  for (const draft of byPriority.slice(preferences.dailyCap)) {
    withheld.push({
      kind: draft.kind,
      reason: `Over your daily limit of ${preferences.dailyCap}.`,
    });
  }

  return {
    planned: spaced
      .filter((draft) => kept.has(draft.key))
      .map((draft) => ({
        ...draft,
        instant: zonedTimeToInstant(day.localDate, `${draft.at}:00`, day.timeZone),
      })),
    withheld,
  };
}

// ---------------------------------------------------------------------------
// The in-app inbox: what has happened to each reminder
// ---------------------------------------------------------------------------

export const NOTIFICATION_ACTIONS = ['done', 'snoozed', 'dismissed'] as const;
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

export interface NotificationEvent {
  readonly localDate: IsoDate;
  readonly key: string;
  readonly kind: NotificationKind;
  readonly action: NotificationAction;
  readonly snoozedUntil: string | null;
}

/** Reminders whose time has come and which have not been answered (or whose snooze is over). */
export function dueNotifications(
  planned: readonly PlannedNotification[],
  events: readonly NotificationEvent[],
  now: Date,
): PlannedNotification[] {
  return planned.filter((notification) => {
    if (notification.instant > now) return false;
    const latest = events.filter((event) => event.key === notification.key).at(-1);
    if (!latest) return true;
    if (latest.action === 'snoozed')
      return latest.snoozedUntil !== null && new Date(latest.snoozedUntil) <= now;
    return false;
  });
}

/** A snooze is an hour, and only if that hour is outside quiet hours. */
export function snoozeUntil(
  now: Date,
  localTime: string,
  preferences: NotificationPreferences,
): Date | null {
  const later = minutes(localTime) + 60;
  if (later >= 24 * 60 || inQuietHours(hhmm(later), preferences.quietStart, preferences.quietEnd))
    return null;
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/** Two dismissals of the same kind on consecutive days mute it, and the app says so. */
export function shouldAutoMute(
  events: readonly NotificationEvent[],
  kind: NotificationKind,
): boolean {
  const dismissedDays = [
    ...new Set(
      events
        .filter((event) => event.kind === kind && event.action === 'dismissed')
        .map((event) => event.localDate),
    ),
  ].sort();
  const answeredDays = new Set(
    events
      .filter((event) => event.kind === kind && event.action === 'done')
      .map((event) => event.localDate),
  );
  const last = dismissedDays.at(-1);
  const before = dismissedDays.at(-2);
  if (!last || !before) return false;
  const gap = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${before}T00:00:00Z`)) / 86_400_000;
  return gap === 1 && !answeredDays.has(last);
}
