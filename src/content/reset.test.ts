import { describe, expect, it } from 'vitest';
import { resetProgram, truncatedTo60 } from './reset';

describe('66-Day Reset content pack', () => {
  it('contains 66 consecutive days, matching the source and not its title', () => {
    expect(resetProgram.days).toHaveLength(66);
    expect(resetProgram.days.map((day) => day.day)).toEqual(
      Array.from({ length: 66 }, (_, index) => index + 1),
    );
  });

  it('keeps the 60-versus-66 discrepancy visible rather than resolving it silently', () => {
    expect(resetProgram.title).toContain('66');
    expect(resetProgram.sourceTitle).toContain('60');
    expect(resetProgram.provenanceNote).toMatch(/66 numbered days/);
  });

  it('carries provenance and is marked editable', () => {
    expect(resetProgram.source).toBe('66_Day_Reset_CALM_SLEEK_LINKED.pdf');
    expect(resetProgram.sourceLicense).toBe('user-authored-personal');
    expect(resetProgram.editable).toBe(true);
  });

  it('treats cold exposure as opt-in rather than a default', () => {
    expect(resetProgram.optInModules).toContain('coldShower');
  });

  it('offers a genuine 60-day variant that is labelled as truncated', () => {
    const short = truncatedTo60();

    expect(short.days).toHaveLength(60);
    expect(short.title).toMatch(/truncated/i);
    expect(short.id).not.toBe(resetProgram.id);
  });

  it('preserves the source progression endpoints', () => {
    const first = resetProgram.days[0];
    const last = resetProgram.days[65];

    expect(first?.wake).toBe('07:00');
    expect(first?.waterLiters).toBe(2);
    expect(last?.wake).toBe('06:00');
    expect(last?.waterLiters).toBe(4);
    expect(last?.pushUps).toBe(100);
  });
});
