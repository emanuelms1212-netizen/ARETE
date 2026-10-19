import {
  RANGE_STATUS_LABEL,
  formatLocalDate,
  formatFoodMass,
  formatVolume,
  rangeStatus,
  type Nutrient,
  type Nutrients,
  type Range,
  type UnitSystem,
} from '@/domain';

/** What the person chose to see. Passed down rather than re-derived per component. */
export interface Visibility {
  readonly numbers: boolean;
  readonly calories: boolean;
}

export const NUTRIENT_SHORT: Record<Nutrient, { label: string; unit: string }> = {
  kcal: { label: 'Energy', unit: 'kcal' },
  proteinG: { label: 'Protein', unit: 'g' },
  carbsG: { label: 'Carbohydrate', unit: 'g' },
  fatG: { label: 'Fat', unit: 'g' },
  fiberG: { label: 'Fibre', unit: 'g' },
};

export function visibleNutrients(visibility: Visibility): Nutrient[] {
  if (!visibility.numbers) return [];
  const all: Nutrient[] = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG'];
  return visibility.calories ? all : all.filter((key) => key !== 'kcal');
}

const number = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);

/** "300 kcal · 11 g protein" — only what is known and visible. Empty when there is nothing to say. */
export function nutrientSummary(nutrients: Nutrients, visibility: Visibility): string {
  return visibleNutrients(visibility)
    .flatMap((key) => {
      const value = nutrients[key];
      if (value === null) return [];
      return key === 'kcal'
        ? [`${number(value)} kcal`]
        : [`${number(value)} g ${NUTRIENT_SHORT[key].label.toLowerCase()}`];
    })
    .join(' · ');
}

export function formatAmount(value: number | null, unit: string): string {
  return value === null ? '—' : `${number(value)} ${unit}`;
}

export function formatRange(range: Range, unit: string, kind: 'band' | 'floor' = 'band'): string {
  return kind === 'floor'
    ? `${number(range.min)} ${unit} or more`
    : `${number(range.min)}–${number(range.max)} ${unit}`;
}

export function statusWords(value: number, range: Range, kind: 'band' | 'floor' = 'band'): string {
  return RANGE_STATUS_LABEL[rangeStatus(value, range, kind)];
}

export function water(ml: number, system: UnitSystem): string {
  return formatVolume(ml, system).text;
}

export function servingWeight(grams: number | null, system: UnitSystem): string | null {
  return grams === null ? null : formatFoodMass(grams, system).text;
}

export function dayName(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (iso === yesterday) return 'Yesterday';
  return formatLocalDate(iso, 'long');
}

export function shortDay(iso: string): string {
  return formatLocalDate(iso, 'day');
}

/** A number field's value, or null when left blank. */
export function optionalNumber(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
}
