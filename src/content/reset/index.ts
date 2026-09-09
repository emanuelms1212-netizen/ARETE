import { resetProgramSchema, type ResetProgram } from '../schema';
import raw from './reset-66-day.json';

/**
 * The 66-Day Reset.
 *
 * The source PDF is titled "60-Day Reset" and contains 66 numbered days. That
 * discrepancy is not silently resolved anywhere in this app: the pack ships as
 * 66 days, carries the note explaining why, and a 60-day variant is offered
 * explicitly rather than by quietly truncating.
 *
 * Every value in this pack is a *default*, not a prescription. Wake times,
 * hydration targets, run distances, push-up counts and social caps are all
 * user-editable before a program starts and while it runs. Cold exposure is
 * opt-in and off by default. See docs/SOURCE_MAP.md §1.
 */
export const resetProgram: ResetProgram = resetProgramSchema.parse(raw);

/** Days 1-60 only, for users who want the program its title advertises. */
export function truncatedTo60(program: ResetProgram = resetProgram): ResetProgram {
  return {
    ...program,
    id: `${program.id}-60`,
    title: '60-Day Reset (truncated)',
    days: program.days.filter((day) => day.day <= 60),
  };
}

export type { ResetProgram, ResetDay } from '../schema';
