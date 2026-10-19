import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, Section } from '@/components/ui';
import { EXERCISES } from '@/content/train/exercises';
import { MOVEMENT_PATTERNS, PATTERN_LABEL } from '@/domain';

export const metadata: Metadata = { title: 'Exercise library' };

/**
 * Every exercise ARETE can prescribe, by movement. Each opens to its full
 * text instruction, and to an animation where one has been drawn.
 */
export default function ExerciseLibraryPage() {
  const groups = MOVEMENT_PATTERNS.map((pattern) => ({
    pattern,
    exercises: EXERCISES.filter((exercise) => exercise.pattern === pattern),
  })).filter((group) => group.exercises.length > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/train" className="hover:underline">
            Train
          </Link>
        }
        title="Exercise library"
        lede="How to do each movement, what usually goes wrong, and when to stop."
      />
      {groups.map((group) => (
        <Section key={group.pattern} title={PATTERN_LABEL[group.pattern]}>
          <ul className="divide-y divide-line">
            {group.exercises.map((exercise) => (
              <li key={exercise.slug}>
                <Link
                  href={`/train/exercises/${exercise.slug}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-body text-ink hover:underline"
                >
                  <span>{exercise.name}</span>
                  <span className="text-body-sm text-ink-muted">
                    {exercise.animation ? 'Animated' : 'Text'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
