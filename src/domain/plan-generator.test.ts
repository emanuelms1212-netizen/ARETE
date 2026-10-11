import { describe, expect, it } from 'vitest';
import { PERSONAS, persona } from './fixtures/personas';
import { countDays, generateFirstWeek, weeklyMinutes, type DraftWeek } from './plan-generator';
import { onboardingProfileSchema } from './onboarding';
import { isBlocked } from './safety';

const OPTIONS = { startDate: '2026-10-12', timeZone: 'Europe/London' } as const; // a Monday

function weekFor(id: string): DraftWeek {
  return generateFirstWeek(persona(id).profile, OPTIONS);
}

/** A short description of what a plan actually is, for comparing personas. */
function signature(week: DraftWeek): string {
  return JSON.stringify({
    train: countDays(week, 'train'),
    move: countDays(week, 'move'),
    rest: countDays(week, 'rest'),
    minutes: weeklyMinutes(week),
    habits: week.habits.map((habit) => habit.title),
    kinds: week.days.flatMap((day) => day.items.map((item) => item.kind)).sort(),
  });
}

describe('every plan, for every persona', () => {
  for (const { id, name } of PERSONAS) {
    describe(name, () => {
      const week = weekFor(id);

      it('covers seven consecutive days from the start date', () => {
        expect(week.days).toHaveLength(7);
        expect(week.days[0]?.date).toBe(OPTIONS.startDate);
        expect(week.days[6]?.date).toBe('2026-10-18');
      });

      it('never schedules more than three habits', () => {
        expect(week.habits.length).toBeLessThanOrEqual(3);
      });

      it('never schedules more than four training days in week one', () => {
        expect(countDays(week, 'train')).toBeLessThanOrEqual(4);
      });

      it('leaves at least one quiet day', () => {
        expect(countDays(week, 'rest')).toBeGreaterThanOrEqual(1);
      });

      it('gives every single item a reason', () => {
        for (const day of week.days) {
          for (const item of day.items) {
            expect(item.because.length, `${item.title}`).toBeGreaterThan(15);
            expect(item.because).not.toMatch(/undefined|null|\[object/);
          }
        }
      });

      it('never says the duration twice', () => {
        // `minutes` is rendered beside the title, so a title that also names a
        // duration makes the row read "Mobility · 10 min   10 min".
        for (const day of week.days) {
          for (const item of day.items) {
            expect(item.title, `${item.title}`).not.toMatch(/\d+\s*(min|minute)/i);
          }
        }
      });

      it('gives every day a minimum version', () => {
        for (const day of week.days) {
          const minimums = day.items.filter((item) => item.isMinimum);
          expect(minimums.length, day.date).toBeGreaterThanOrEqual(1);
          expect(minimums.length).toBeLessThanOrEqual(3);
        }
      });

      it('never schedules anything on a day the user said they are not free', () => {
        const available = new Set(persona(id).profile.schedule.availableWeekdays);
        for (const day of week.days) {
          if (available.has(day.weekday)) continue;
          expect(day.shape, `${day.date} is not an available day`).toBe('rest');
        }
      });

      it('is deterministic', () => {
        expect(generateFirstWeek(persona(id).profile, OPTIONS)).toEqual(week);
      });
    });
  }
});

describe('personas get meaningfully different plans', () => {
  it('produces a distinct plan for each persona', () => {
    const signatures = PERSONAS.map((p) => signature(weekFor(p.id)));
    expect(new Set(signatures).size).toBe(PERSONAS.length);
  });

  it('scales training with experience and recent activity', () => {
    const beginner = countDays(weekFor('new-sedentary'), 'train');
    const experienced = countDays(weekFor('experienced'), 'train');

    expect(beginner).toBeLessThan(experienced);
    expect(experienced).toBe(4);
  });

  it('gives the experienced persona more scheduled minutes than the beginner', () => {
    expect(weeklyMinutes(weekFor('experienced'))).toBeGreaterThan(
      weeklyMinutes(weekFor('new-sedentary')),
    );
  });

  it('honours the preferred training days when there are any', () => {
    const week = weekFor('experienced');
    const preferred = new Set(persona('experienced').profile.training.preferredWeekdays);

    for (const day of week.days.filter((candidate) => candidate.shape === 'train')) {
      expect(preferred.has(day.weekday), `${day.date}`).toBe(true);
    }
  });

  it('gives the flexibility persona more mobility than the default', () => {
    expect(countDays(weekFor('severe-injury'), 'move')).toBeGreaterThan(
      countDays(weekFor('new-sedentary'), 'move'),
    );
  });
});

describe('unsafe combinations are blocked or rerouted, never silently scheduled', () => {
  it('replaces contrast therapy with the gentle alternative during pregnancy', () => {
    const week = weekFor('pregnant');
    const contrast = week.days.flatMap((day) =>
      day.items.filter((item) => item.module === 'contrast_therapy'),
    );

    expect(contrast.length).toBeGreaterThan(0);
    for (const item of contrast) {
      expect(item.title).not.toMatch(/contrast/i);
      expect(item.because).toMatch(/pregnant/i);
    }
  });

  it('replaces contrast therapy after a fainting history', () => {
    const week = weekFor('cardiac-history');
    const contrast = week.days.flatMap((day) =>
      day.items.filter((item) => item.module === 'contrast_therapy'),
    );

    expect(contrast.length).toBeGreaterThan(0);
    expect(contrast.every((item) => !/contrast/i.test(item.title))).toBe(true);
    expect(isBlocked(week.safety, 'contrast_therapy')).toBe(true);
  });

  it('still offers contrast therapy to someone who chose it and reported nothing, behind a notice', () => {
    const week = generateFirstWeek(
      onboardingProfileSchema.parse({
        health: { pregnancyStatus: 'prefer_not_to_say' },
        mind: { chosenPackSlugs: ['contrast-therapy'] },
      }),
      OPTIONS,
    );
    const contrast = week.days.flatMap((day) =>
      day.items.filter((item) => item.module === 'contrast_therapy'),
    );

    expect(contrast.length).toBeGreaterThan(0);
    expect(contrast[0]?.title).toMatch(/contrast/i);
    expect(contrast[0]?.because).toMatch(/safety notice/i);
  });

  it('never schedules a pack the user did not choose', () => {
    const week = weekFor('new-sedentary');
    expect(
      week.days.flatMap((day) => day.items.filter((item) => item.module === 'contrast_therapy')),
    ).toEqual([]);
  });

  it('makes mobility unloaded when an area must not be loaded', () => {
    const week = weekFor('severe-injury');
    const mobility = week.days.flatMap((day) =>
      day.items.filter((item) => item.kind === 'mobility'),
    );

    expect(mobility.length).toBeGreaterThan(0);
    for (const item of mobility) {
      expect(item.title).toMatch(/gentle|unloaded/i);
      expect(item.because).toMatch(/stop at any point/i);
    }
  });

  it('keeps the week short while clearance is pending', () => {
    expect(countDays(weekFor('cardiac-history'), 'train')).toBeLessThanOrEqual(2);
  });

  it('surfaces every safety decision in the notes shown above the week', () => {
    const week = weekFor('pregnant');
    const notes = week.notes.join(' ');

    expect(notes).toMatch(/pregnant/i);
    expect(notes).toMatch(/clinician/i);
  });
});

describe('the quieter details', () => {
  it('says "note what you ate" rather than showing numbers when asked to hide them', () => {
    const week = weekFor('no-numbers');
    const food = week.days.flatMap((day) => day.items.filter((item) => item.kind === 'food'));

    expect(food.length).toBe(7);
    expect(food.every((item) => item.title === 'Note what you ate')).toBe(true);
  });

  it('schedules no food item at all when food logging is off', () => {
    const week = generateFirstWeek(
      onboardingProfileSchema.parse({ food: { loggingGoal: 'none' } }),
      OPTIONS,
    );
    expect(week.days.flatMap((day) => day.items.filter((item) => item.kind === 'food'))).toEqual(
      [],
    );
  });

  it('honours a three-item minimum day, or the whole day when it is shorter', () => {
    const week = weekFor('no-numbers');
    for (const day of week.days) {
      expect(day.items.filter((item) => item.isMinimum).length, day.date).toBe(
        Math.min(3, day.items.length),
      );
    }
  });

  it('never makes a training session the minimum when something smaller is on the day', () => {
    for (const { id } of PERSONAS) {
      for (const day of weekFor(id).days) {
        const minimums = day.items.filter((item) => item.isMinimum);
        const hasSmaller = day.items.some((item) => ['mind', 'review', 'food'].includes(item.kind));
        if (hasSmaller && minimums.length === 1) {
          expect(minimums[0]?.kind, `${id} ${day.date}`).not.toBe('workout');
        }
      }
    }
  });

  it('gives someone who skipped every question a gentle, complete week', () => {
    const week = weekFor('skipped');

    expect(week.habits.length).toBeGreaterThan(0);
    expect(week.habits.every((habit) => /default/i.test(habit.because))).toBe(true);
    expect(countDays(week, 'train')).toBeLessThanOrEqual(3);
    expect(week.notes[0]).toMatch(/deliberately lighter/i);
  });

  it('tells the user the quiet days are deliberate', () => {
    expect(weekFor('new-sedentary').notes.join(' ')).toMatch(/quiet days are part of the plan/i);
  });
});
