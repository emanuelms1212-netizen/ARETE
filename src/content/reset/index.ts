import { resetProgramSchema, type ResetProgram } from '../schema';
import raw from './reset-66-day.json';

/**
 * The source's day-by-day reset data, kept as extracted.
 *
 * The source PDF is titled "60-Day Reset" and contains 66 numbered days. That
 * discrepancy is not silently resolved: ARETE's programme
 * (`domain/reset-program.ts`) runs sixty days, its title's number, and offers
 * days 61–66 as an optional extension week the person can add before starting
 * or at the finish (SOURCE_MAP §1). These rows are the reference shown beside
 * ARETE's ranges in the preview — never prescriptions in themselves. Every
 * target ARETE suggests is an editable range worked out from the person.
 */
export const resetSource: ResetProgram = resetProgramSchema.parse(raw);

/** Days 1–60: the programme proper. */
export const resetMainDays = resetSource.days.filter((day) => day.day <= 60);

/** Days 61–66: the optional extension week. */
export const resetExtensionDays = resetSource.days.filter((day) => day.day > 60);

export type { ResetProgram, ResetDay } from '../schema';
