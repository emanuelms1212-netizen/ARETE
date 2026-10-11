/**
 * Domain types.
 *
 * This layer knows nothing about React, Next.js, or any database. It is the
 * vocabulary the rest of the app agrees on. The full data model lands in
 * stage 4; what is here is the slice the Today shell actually uses, kept
 * deliberately small so it does not have to be unpicked later.
 */

/** Calendar date in the user's local timezone, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Opaque identifier. */
export type Id = string;

/**
 * How the user marked the day. `not-today` is the low-readiness / injury /
 * illness exit; it shrinks the day rather than failing it.
 */
export type DayMark = 'normal' | 'travel' | 'not-today';

export type CommitmentKind =
  'habit' | 'task' | 'focus' | 'workout' | 'mobility' | 'mind' | 'food' | 'review';

export type CommitmentStatus = 'pending' | 'done' | 'skipped';

/**
 * One thing the user intends to do today.
 *
 * `skipped` is a first-class outcome, not a failure: a skip with a reason feeds
 * the adaptive engine and is excluded from the completion ratio entirely.
 */
export interface Commitment {
  readonly id: Id;
  readonly kind: CommitmentKind;
  readonly title: string;
  /** Part of the user's self-defined minimum viable day. */
  readonly isMinimum: boolean;
  readonly status: CommitmentStatus;
  readonly skipReason?: string;
  /** Optional link back to the goal this serves. */
  readonly goalId?: Id;
  /**
   * The row this commitment stands for, in the table named by `kind` — the
   * habit that was ticked, the task that was finished. Optional, because a
   * commitment outlives the thing it referred to and the title is what the day
   * is rendered from.
   */
  readonly refId?: Id;
  /** Where this went when it was moved to another day. */
  readonly snoozedTo?: IsoDate;
}

export interface Day {
  readonly date: IsoDate;
  readonly mark: DayMark;
  /** ISO timestamp of when the user committed to the day, or null if not yet. */
  readonly committedAt: string | null;
  readonly commitments: readonly Commitment[];
}

export interface DayProgress {
  readonly total: number;
  readonly done: number;
  readonly skipped: number;
  readonly pending: number;
  readonly minimumTotal: number;
  readonly minimumDone: number;
  /** True when every commitment marked as a minimum is done. */
  readonly minimumDayMet: boolean;
  /** True when the day has no activity at all. Shown as "a quiet day", never as failure. */
  readonly isQuietDay: boolean;
  /** done / (total - skipped), 0 when there is nothing to complete. */
  readonly completionRatio: number;
}

/** Provenance carried by every item that originated in a source document. */
export interface Provenance {
  readonly source: string;
  readonly sourceLicense:
    | 'user-authored-personal'
    | 'public-domain'
    | 'third-party-permission-required'
    | 'third-party-no-redistribution';
  readonly provenanceNote?: string;
}
