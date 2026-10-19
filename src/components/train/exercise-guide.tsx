import { animationFor } from '@/content/train/animations';
import { PATTERN_LABEL, type Exercise } from '@/domain';
import { MannequinPlayer } from './mannequin-player';

/**
 * How to do one exercise: the animation when there is one, and always the
 * words. The text is complete on its own — steps, cues, mistakes and when to
 * stop — because an animation is an aid to instruction, not a replacement
 * for it, and some people cannot or would rather not watch one.
 */
export function ExerciseGuide({
  exercise,
  headingLevel = 2,
}: {
  exercise: Exercise;
  headingLevel?: 2 | 3;
}) {
  const animation = animationFor(exercise.animation);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const equipment =
    exercise.requires.length === 0
      ? 'No equipment'
      : exercise.requires.join(', ').replaceAll('_', ' ');

  return (
    <div className="space-y-5">
      <p className="text-body-sm text-ink-muted">
        {PATTERN_LABEL[exercise.pattern]} · {equipment}
        {exercise.perSide ? ' · each side' : ''}
      </p>

      {animation ? (
        <MannequinPlayer animation={animation} />
      ) : (
        <p className="rounded-lg bg-sunken px-3 py-2 text-body-sm text-ink-muted">
          No animation for this one. The steps below are the instruction.
        </p>
      )}

      <section aria-labelledby={`${exercise.slug}-steps`}>
        <Heading id={`${exercise.slug}-steps`} className="text-body font-semibold text-ink">
          How to do it
        </Heading>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-body text-ink">
          {exercise.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${exercise.slug}-cues`}>
        <Heading id={`${exercise.slug}-cues`} className="text-body font-semibold text-ink">
          Cues
        </Heading>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ink">
          {exercise.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${exercise.slug}-mistakes`}>
        <Heading id={`${exercise.slug}-mistakes`} className="text-body font-semibold text-ink">
          Common mistakes
        </Heading>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ink">
          {exercise.mistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby={`${exercise.slug}-stop`}
        className="rounded-lg border border-warn/40 bg-surface p-3"
      >
        <Heading id={`${exercise.slug}-stop`} className="text-body font-semibold text-warn">
          Stop if
        </Heading>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ink">
          {exercise.stopIf.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
