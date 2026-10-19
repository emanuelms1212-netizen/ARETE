import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseGuide } from '@/components/train/exercise-guide';
import { PageHeader } from '@/components/ui';
import { exerciseBySlug } from '@/content/train/exercises';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: exerciseBySlug(slug)?.name ?? 'Exercise' };
}

export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exercise = exerciseBySlug(slug);
  if (!exercise) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href="/train/exercises" className="hover:underline">
            Exercise library
          </Link>
        }
        title={exercise.name}
      />
      <div className="rounded-xl border border-line bg-surface p-4">
        <ExerciseGuide exercise={exercise} />
      </div>
    </div>
  );
}
