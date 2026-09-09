import type { Day, DayProgress } from './types';

/**
 * Pure day arithmetic. No dates are read from the system clock here: the caller
 * supplies the day, so this is trivially testable and timezone-safe.
 *
 * Design rules encoded here, from PRODUCT_SPEC §2 and §5.9:
 *   - Skipped commitments are removed from the denominator. A day where the
 *     user skipped two things with a reason and did the rest is a complete day.
 *   - The minimum day is the thing that matters; the ratio is secondary.
 *   - A day with nothing on it is "quiet", not "failed".
 */
export function computeDayProgress(day: Day): DayProgress {
  let done = 0;
  let skipped = 0;
  let pending = 0;
  let minimumTotal = 0;
  let minimumDone = 0;

  for (const commitment of day.commitments) {
    switch (commitment.status) {
      case 'done':
        done += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'pending':
        pending += 1;
        break;
    }

    if (commitment.isMinimum) {
      minimumTotal += 1;
      if (commitment.status === 'done') {
        minimumDone += 1;
      }
    }
  }

  const total = day.commitments.length;
  const completable = total - skipped;

  return {
    total,
    done,
    skipped,
    pending,
    minimumTotal,
    minimumDone,
    minimumDayMet: minimumTotal > 0 && minimumDone === minimumTotal,
    isQuietDay: done === 0 && skipped === 0,
    completionRatio: completable > 0 ? done / completable : 0,
  };
}

/**
 * The one line the Today screen shows about the state of the day.
 *
 * Tone contract (PRODUCT_SPEC §14): no "failed", "broke", "lost", or "streak".
 * Nothing here shames an empty day.
 */
export function describeDay(day: Day, progress: DayProgress): string {
  if (day.mark === 'not-today') {
    return 'Held for today. Nothing owed.';
  }

  if (day.mark === 'travel') {
    return progress.done > 0 ? 'A travel day, and you still moved.' : 'A travel day. Minimum only.';
  }

  if (progress.total === 0) {
    return 'Nothing planned yet. Pick one thing.';
  }

  if (progress.isQuietDay) {
    return 'A quiet day so far.';
  }

  if (progress.minimumDayMet && progress.pending === 0) {
    return 'Today is done.';
  }

  if (progress.minimumDayMet) {
    return 'Minimum met. The rest is optional.';
  }

  return `${progress.done} of ${progress.total - progress.skipped} done.`;
}
