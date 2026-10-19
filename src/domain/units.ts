/**
 * Units.
 *
 * Everything is stored metric — kilograms, centimetres, kilometres, millilitres,
 * degrees Celsius — and converted at the edge for display. `preferences.unit_system`
 * says what to *show*, never what to store, so a user switching systems changes
 * nothing in the database and cannot corrupt their own history.
 */
export type UnitSystem = 'metric' | 'us';

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const KM_PER_MILE = 1.609344;
const ML_PER_FL_OZ = 29.5735295625;

export const toPounds = (kg: number): number => kg / KG_PER_LB;
export const toKilograms = (lb: number): number => lb * KG_PER_LB;
export const toInches = (cm: number): number => cm / CM_PER_INCH;
export const toCentimetres = (inches: number): number => inches * CM_PER_INCH;
export const toMiles = (km: number): number => km / KM_PER_MILE;
export const toKilometres = (miles: number): number => miles * KM_PER_MILE;
export const toFluidOunces = (ml: number): number => ml / ML_PER_FL_OZ;
export const toMillilitres = (flOz: number): number => flOz * ML_PER_FL_OZ;
export const toFahrenheit = (celsius: number): number => (celsius * 9) / 5 + 32;
export const toCelsius = (fahrenheit: number): number => ((fahrenheit - 32) * 5) / 9;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface Measured {
  readonly value: number;
  readonly unit: string;
  readonly text: string;
}

function measured(value: number, unit: string, decimals: number): Measured {
  const rounded = round(value, decimals);
  return { value: rounded, unit, text: `${rounded} ${unit}` };
}

export function formatMass(kilograms: number, system: UnitSystem): Measured {
  return system === 'metric'
    ? measured(kilograms, 'kg', 1)
    : measured(toPounds(kilograms), 'lb', 1);
}

export function formatLength(centimetres: number, system: UnitSystem): Measured {
  return system === 'metric'
    ? measured(centimetres, 'cm', 1)
    : measured(toInches(centimetres), 'in', 1);
}

export function formatDistance(kilometres: number, system: UnitSystem): Measured {
  return system === 'metric'
    ? measured(kilometres, 'km', 2)
    : measured(toMiles(kilometres), 'mi', 2);
}

export function formatVolume(millilitres: number, system: UnitSystem): Measured {
  return system === 'metric'
    ? millilitres >= 1000
      ? measured(millilitres / 1000, 'L', 2)
      : measured(millilitres, 'ml', 0)
    : measured(toFluidOunces(millilitres), 'fl oz', 1);
}

export function formatTemperature(celsius: number, system: UnitSystem): Measured {
  return system === 'metric'
    ? measured(celsius, '°C', 0)
    : measured(toFahrenheit(celsius), '°F', 0);
}

/** Converts a value the user typed, in their system, back to storage units. */
export function massToStorage(value: number, system: UnitSystem): number {
  return system === 'metric' ? value : toKilograms(value);
}

export function lengthToStorage(value: number, system: UnitSystem): number {
  return system === 'metric' ? value : toCentimetres(value);
}

export function distanceToStorage(value: number, system: UnitSystem): number {
  return system === 'metric' ? value : toKilometres(value);
}

// --- Food and body measurements -------------------------------------------------

const GRAMS_PER_OUNCE = 28.349523125;

export const gramsToOunces = (grams: number): number => grams / GRAMS_PER_OUNCE;
export const ouncesToGrams = (ounces: number): number => ounces * GRAMS_PER_OUNCE;

export function formatFoodMass(grams: number, system: UnitSystem): Measured {
  return system === 'metric' ? measured(grams, 'g', 0) : measured(gramsToOunces(grams), 'oz', 1);
}

/** Height for display: centimetres, or feet and inches. */
export function formatHeight(centimetres: number, system: UnitSystem): Measured {
  if (system === 'metric') return measured(centimetres, 'cm', 0);
  const totalInches = Math.round(toInches(centimetres));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { value: totalInches, unit: 'in', text: `${feet} ft ${inches} in` };
}

export function feetInchesToCentimetres(feet: number, inches: number): number {
  return toCentimetres(feet * 12 + inches);
}

export function volumeToStorage(value: number, system: UnitSystem): number {
  return system === 'metric' ? value : toMillilitres(value);
}
