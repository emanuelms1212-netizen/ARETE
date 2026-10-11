import { describe, expect, it } from 'vitest';
import { onboardingProfileSchema } from './onboarding';
import { decisionFor, evaluateSafety, isBlocked, notableDecisions } from './safety';
import { persona } from './fixtures/personas';

const TODAY = '2026-10-12';

function profileWith(partial: unknown) {
  return onboardingProfileSchema.parse(partial);
}

describe('safety rules', () => {
  it('allows everything when nothing was reported', () => {
    const report = evaluateSafety(profileWith({}), TODAY);

    expect(report.decisions.every((decision) => decision.outcome === 'allowed')).toBe(true);
    expect(notableDecisions(report)).toEqual([]);
    expect(report.clearanceRecommended).toBe(false);
  });

  it('blocks heat and cold during pregnancy, and says so without diagnosing', () => {
    const report = evaluateSafety(persona('pregnant').profile, TODAY);

    for (const gated of ['cold_exposure', 'contrast_therapy', 'sauna', 'fasting'] as const) {
      expect(isBlocked(report, gated), gated).toBe(true);
    }
    expect(decisionFor(report, 'loaded_mobility').outcome).toBe('rerouted');
    expect(decisionFor(report, 'high_intensity').outcome).toBe('rerouted');
    expect(report.clearanceRecommended).toBe(true);

    const reason = decisionFor(report, 'cold_exposure').reason;
    expect(reason).toContain('You told us');
    expect(reason).toMatch(/not advice about you/i);
  });

  it('blocks immersion and sauna after a fainting history', () => {
    const report = evaluateSafety(persona('cardiac-history').profile, TODAY);

    expect(isBlocked(report, 'cold_exposure')).toBe(true);
    expect(isBlocked(report, 'sauna')).toBe(true);
    expect(decisionFor(report, 'high_intensity').outcome).toBe('rerouted');
    expect(report.clearanceRecommended).toBe(true);
  });

  it('does not punish someone for declining to answer', () => {
    const report = evaluateSafety(persona('private').profile, TODAY);

    // Behind a notice, not blocked — blocking people for declining a personal
    // question teaches them to lie to the form.
    expect(decisionFor(report, 'cold_exposure').outcome).toBe('requires_acknowledgement');
    expect(isBlocked(report, 'cold_exposure')).toBe(false);
  });

  it('blocks calorie targets for a minor without guardian confirmation', () => {
    const report = evaluateSafety(persona('minor').profile, TODAY);

    expect(report.isMinor).toBe(true);
    expect(isBlocked(report, 'calorie_targets')).toBe(true);
    expect(isBlocked(report, 'fasting')).toBe(true);
  });

  it('allows calorie targets once a guardian has confirmed them', () => {
    const report = evaluateSafety(
      profileWith({ age: { birthYear: 2010, guardianConfirmed: true } }),
      TODAY,
    );

    expect(report.isMinor).toBe(true);
    expect(isBlocked(report, 'calorie_targets')).toBe(false);
  });

  it('treats an eighteenth birthday year as an adult', () => {
    expect(evaluateSafety(profileWith({ age: { birthYear: 2008 } }), TODAY).isMinor).toBe(false);
    expect(evaluateSafety(profileWith({ age: { birthYear: 2009 } }), TODAY).isMinor).toBe(true);
  });

  it('blocks loading an area with a severe problem, and eases one with a moderate problem', () => {
    const severe = evaluateSafety(persona('severe-injury').profile, TODAY);
    expect(isBlocked(severe, 'loaded_mobility')).toBe(true);
    expect(severe.excludedRegions).toEqual(['hamstrings']);

    const moderate = evaluateSafety(
      profileWith({ health: { injuries: [{ region: 'knees', severity: 'moderate' }] } }),
      TODAY,
    );
    expect(decisionFor(moderate, 'loaded_mobility').outcome).toBe('rerouted');
    expect(decisionFor(moderate, 'loaded_mobility').alternative).toBeTruthy();
    expect(moderate.regressedRegions).toEqual(['knees']);
  });

  it('separates heat sensitivity from cold sensitivity', () => {
    const heat = evaluateSafety(profileWith({ health: { heatSensitivity: true } }), TODAY);
    expect(isBlocked(heat, 'sauna')).toBe(true);
    expect(isBlocked(heat, 'cold_exposure')).toBe(false);

    const cold = evaluateSafety(profileWith({ health: { coldSensitivity: true } }), TODAY);
    expect(isBlocked(cold, 'cold_exposure')).toBe(true);
    expect(decisionFor(cold, 'contrast_therapy').outcome).toBe('rerouted');
  });

  it('keeps the strictest rule when several apply', () => {
    const report = evaluateSafety(
      profileWith({
        health: { pregnancyStatus: 'prefer_not_to_say', cardiovascularOrFaintingHistory: true },
      }),
      TODAY,
    );

    // "Prefer not to say" alone would only need an acknowledgement; the
    // fainting history blocks it outright, and the stricter rule must win.
    expect(isBlocked(report, 'cold_exposure')).toBe(true);
  });

  it('routes intensity down while clearance is pending, and back up once confirmed', () => {
    const pending = evaluateSafety(
      profileWith({ health: { medicalClearanceNeeded: true } }),
      TODAY,
    );
    expect(decisionFor(pending, 'high_intensity').outcome).toBe('rerouted');

    const confirmed = evaluateSafety(
      profileWith({
        health: { medicalClearanceNeeded: true, medicalClearanceConfirmed: true },
        training: { experience: 'consistent', recentActivity: 'moderate' },
      }),
      TODAY,
    );
    expect(decisionFor(confirmed, 'high_intensity').outcome).toBe('allowed');
  });

  it('gives every non-allowed decision a reason a person can read', () => {
    for (const { profile } of [
      persona('pregnant'),
      persona('cardiac-history'),
      persona('minor'),
      persona('severe-injury'),
    ]) {
      for (const decision of notableDecisions(evaluateSafety(profile, TODAY))) {
        expect(decision.reason.length).toBeGreaterThan(20);
        expect(decision.reason).not.toMatch(/undefined|null|\[object/);
        if (decision.outcome === 'rerouted') expect(decision.alternative).toBeTruthy();
      }
    }
  });

  it('is pure — the same inputs give the same report', () => {
    const a = evaluateSafety(persona('pregnant').profile, TODAY);
    const b = evaluateSafety(persona('pregnant').profile, TODAY);
    expect(a).toEqual(b);
  });
});
