import { describe, expect, it } from 'vitest';
import {
  CONTRAST_NOTICE_VERSION,
  CONTRAST_SCREENING_QUESTIONS,
  GENTLE_PROTOCOL,
  SOURCE_PROTOCOLS,
  afterStop,
  contrastEligibility,
  contrastPhases,
  contrastProtocolSchema,
  contrastTotalSeconds,
  screeningHints,
} from './contrast';
import { JOURNAL_QUOTES, quoteFor, weekFactLines, weekStart } from './journal';

const allNo = Object.fromEntries(CONTRAST_SCREENING_QUESTIONS.map((q) => [q.id, false])) as Record<
  (typeof CONTRAST_SCREENING_QUESTIONS)[number]['id'],
  boolean
>;

describe('contrast therapy screening', () => {
  it('refuses minors outright, even when every answer is no', () => {
    expect(
      contrastEligibility({
        screening: { answers: allNo, clinicianCleared: true },
        isMinor: true,
        acknowledgedVersion: CONTRAST_NOTICE_VERSION,
      }).kind,
    ).toBe('refused');
  });

  it('needs the screening and the current safety notice before anything', () => {
    expect(
      contrastEligibility({ screening: null, isMinor: false, acknowledgedVersion: null }).kind,
    ).toBe('refused');
    expect(
      contrastEligibility({
        screening: { answers: allNo, clinicianCleared: false },
        isMinor: false,
        acknowledgedVersion: 'an-older-wording',
      }).kind,
    ).toBe('refused');
  });

  it('asks for a clinician’s clearance when any answer is yes — or missing', () => {
    const yes = contrastEligibility({
      screening: { answers: { ...allNo, bloodPressure: true }, clinicianCleared: false },
      isMinor: false,
      acknowledgedVersion: CONTRAST_NOTICE_VERSION,
    });
    expect(yes).toEqual({ kind: 'needs_clearance', flagged: ['bloodPressure'] });
    const { heart: _omit, ...missing } = allNo;
    void _omit;
    expect(
      contrastEligibility({
        screening: { answers: missing as typeof allNo, clinicianCleared: false },
        isMinor: false,
        acknowledgedVersion: CONTRAST_NOTICE_VERSION,
      }).kind,
    ).toBe('needs_clearance');
    expect(
      contrastEligibility({
        screening: { answers: { ...allNo, bloodPressure: true }, clinicianCleared: true },
        isMinor: false,
        acknowledgedVersion: CONTRAST_NOTICE_VERSION,
      }).kind,
    ).toBe('ok');
  });

  it('pre-ticks what onboarding already knows', () => {
    expect(
      screeningHints({
        pregnancyStatus: 'pregnant',
        cardiovascularOrFaintingHistory: true,
        heatSensitivity: false,
        coldSensitivity: true,
      }),
    ).toEqual({ pregnancy: true, heart: true, fainting: true, temperature: true });
  });
});

describe('contrast protocols', () => {
  it('default below the source: shorter heat, shorter cold, fewer rounds', () => {
    expect(GENTLE_PROTOCOL.heatSeconds).toBeLessThan(5 * 60);
    expect(GENTLE_PROTOCOL.coldSeconds).toBeLessThan(60);
    expect(GENTLE_PROTOCOL.cycles).toBeLessThan(3);
    expect(contrastProtocolSchema.safeParse({ ...GENTLE_PROTOCOL, coldSeconds: 300 }).success).toBe(
      false,
    );
    expect(contrastProtocolSchema.safeParse({ ...GENTLE_PROTOCOL, cycles: 6 }).success).toBe(false);
  });

  it('alternate heat and cold and finish where asked', () => {
    expect(contrastPhases(GENTLE_PROTOCOL).map((p) => p.kind)).toEqual(['heat', 'cold', 'heat']);
    expect(contrastPhases({ ...GENTLE_PROTOCOL, finishOn: 'cold' }).map((p) => p.kind)).toEqual([
      'heat',
      'cold',
      'heat',
      'cold',
    ]);
    expect(contrastTotalSeconds(GENTLE_PROTOCOL)).toBe(180 + 30 + 180);
  });

  it('report the source’s reasons as commonly cited, never as promised', () => {
    for (const protocol of SOURCE_PROTOCOLS) {
      expect(protocol.rationale).toMatch(/^Commonly cited rationale/);
    }
  });

  it('send someone who felt dizzy towards help, not back into the cold', () => {
    expect(afterStop('dizzy')).toMatch(/medical help/);
    expect(afterStop('too_cold')).not.toMatch(/medical/);
  });
});

describe('the journal', () => {
  it('ships only verified, attributed public-domain quotes', () => {
    for (const quote of JOURNAL_QUOTES) {
      expect(quote.attribution).toBe('verified-public-domain');
      expect(quote.translator).toBe('George Long');
      expect(quote.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(quoteFor('2026-03-02')).toEqual(quoteFor('2026-03-02'));
  });

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-03-02')).toBe('2026-03-02');
    expect(weekStart('2026-03-08')).toBe('2026-03-02');
    expect(weekStart('2026-03-09')).toBe('2026-03-09');
  });

  it('states facts as counts, and says nothing harsh about an empty week', () => {
    const empty = {
      from: '2026-03-02',
      to: '2026-03-08',
      daysPlanned: 0,
      commitmentsDone: 0,
      commitmentsTotal: 0,
      minimumDays: 0,
      focusMinutes: 0,
      workouts: 0,
      mindSessions: 0,
      foodDays: 0,
      resetItemsDone: 0,
      contrastSessions: 0,
      journalDays: 0,
    };
    expect(weekFactLines(empty)).toEqual([
      'Nothing recorded this week. That is information, not a judgement.',
    ]);
    const lines = weekFactLines({
      ...empty,
      daysPlanned: 5,
      commitmentsDone: 9,
      commitmentsTotal: 14,
      minimumDays: 1,
      workouts: 1,
    });
    expect(lines).toContain('9 commitments done across 5 planned days.');
    expect(lines).toContain('1 day run at the minimum — each one counted.');
    expect(lines.join(' ')).not.toMatch(/%|missed|failed/);
  });
});
