import { exerciseBySlug } from '@/content/train/exercises';
import type { Exercise, Prescription, Target } from '@/domain';

/** "45 s", "2 min", "1 min 30 s". */
export function formatSeconds(total: number): string {
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

export function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}

export function nameOf(slug: string): string {
  return exerciseBySlug(slug)?.name ?? slug;
}

export function requireExercise(slug: string): Exercise {
  const found = exerciseBySlug(slug);
  if (!found) throw new Error(`Unknown exercise ${slug}`);
  return found;
}

/**
 * The prescription as one line a person can read mid-set:
 * "3 × 8–12 · aim for 9 · 16 kg · RPE 7 (3 in reserve) · rest 90 s".
 */
export function prescriptionLine(item: Prescription, target?: Target): string {
  const sets = target?.sets ?? item.sets;
  const side = item.perSide ? ' each side' : '';
  const parts: string[] = [];

  if (item.reps) {
    parts.push(`${sets} × ${item.reps.min}–${item.reps.max}${side}`);
    const goal = target?.repsGoal;
    if (goal !== null && goal !== undefined && item.block !== 'warmup')
      parts.push(`aim for ${goal}`);
  } else {
    const seconds = target?.seconds ?? item.seconds ?? 0;
    parts.push(
      sets === 1
        ? `${formatSeconds(seconds)}${side}`
        : `${sets} × ${formatSeconds(seconds)}${side}`,
    );
  }

  if (target?.loadKg !== null && target?.loadKg !== undefined) parts.push(formatKg(target.loadKg));
  const rpe = target?.rpe ?? item.rpe;
  if (rpe !== null) parts.push(`RPE ${rpe} (${10 - rpe} in reserve)`);
  if (item.restSeconds > 0 && sets > 1) parts.push(`rest ${formatSeconds(item.restSeconds)}`);
  return parts.join(' · ');
}
