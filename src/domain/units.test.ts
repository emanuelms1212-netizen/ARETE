import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatMass,
  formatTemperature,
  formatVolume,
  massToStorage,
  toCelsius,
  toKilograms,
  toPounds,
} from './units';

describe('units', () => {
  it('shows the same stored value in either system', () => {
    expect(formatMass(80, 'metric').text).toBe('80 kg');
    expect(formatMass(80, 'us').text).toBe('176.4 lb');
  });

  it('round-trips without drift', () => {
    expect(toKilograms(toPounds(72.5))).toBeCloseTo(72.5, 10);
    expect(toCelsius(13)).toBeCloseTo(-10.56, 2);
  });

  it('converts what the user typed back to storage units', () => {
    expect(massToStorage(176.37, 'us')).toBeCloseTo(80, 2);
    expect(massToStorage(80, 'metric')).toBe(80);
  });

  it('uses litres once the volume is large enough to deserve them', () => {
    expect(formatVolume(500, 'metric').text).toBe('500 ml');
    expect(formatVolume(2500, 'metric').text).toBe('2.5 L');
    expect(formatVolume(2500, 'us').unit).toBe('fl oz');
  });

  it("converts the source material's contrast-therapy temperatures correctly", () => {
    // SOURCE_MAP §4 quotes 13 °C cold and 70-82 °C sauna.
    expect(formatTemperature(13, 'us').text).toBe('55 °F');
    expect(formatTemperature(82, 'us').text).toBe('180 °F');
  });

  it("converts the reset programme's run distances", () => {
    expect(formatDistance(10, 'us').text).toBe('6.21 mi');
    expect(formatDistance(2, 'metric').text).toBe('2 km');
  });
});
