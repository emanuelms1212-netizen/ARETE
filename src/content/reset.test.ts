import { describe, expect, it } from 'vitest';
import { RESET_BASE_DAYS, RESET_EXTENSION_DAYS } from '@/domain';
import { resetExtensionDays, resetMainDays, resetSource } from './reset';

describe('the reset source data', () => {
  it('contains 66 consecutive days, matching the source and not its title', () => {
    expect(resetSource.days).toHaveLength(66);
    expect(resetSource.days.map((day) => day.day)).toEqual(
      Array.from({ length: 66 }, (_, index) => index + 1),
    );
  });

  it('splits into the sixty-day programme and an optional six-day extension week', () => {
    expect(resetMainDays).toHaveLength(RESET_BASE_DAYS);
    expect(resetExtensionDays).toHaveLength(RESET_EXTENSION_DAYS);
    expect(resetExtensionDays[0]?.day).toBe(61);
  });

  it('keeps the 60-versus-66 discrepancy visible rather than resolving it silently', () => {
    expect(resetSource.sourceTitle).toContain('60');
    expect(resetSource.provenanceNote).toMatch(/66 numbered days/);
  });

  it('carries provenance and is marked editable', () => {
    expect(resetSource.source).toBe('66_Day_Reset_CALM_SLEEK_LINKED.pdf');
    expect(resetSource.sourceLicense).toBe('user-authored-personal');
    expect(resetSource.editable).toBe(true);
  });

  it('treats cold exposure as opt-in rather than a default', () => {
    expect(resetSource.optInModules).toContain('coldShower');
  });

  it('preserves the source progression endpoints, for reference only', () => {
    const first = resetSource.days[0];
    const last = resetSource.days[65];
    expect(first?.wake).toBe('07:00');
    expect(first?.waterLiters).toBe(2);
    expect(last?.wake).toBe('06:00');
    expect(last?.waterLiters).toBe(4);
    expect(last?.pushUps).toBe(100);
  });
});
