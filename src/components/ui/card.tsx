import type { ComponentProps } from 'react';

type Tone = 'surface' | 'sunken';

const tones: Record<Tone, string> = {
  surface: 'bg-surface',
  sunken: 'bg-sunken',
};

export interface CardProps extends ComponentProps<'div'> {
  readonly tone?: Tone;
  /** Cards do not float by default. Only overlays and sheets earn a shadow. */
  readonly raised?: boolean;
}

export function Card({ tone = 'surface', raised = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-line ${tones[tone]} ${raised ? 'shadow-raised' : ''} ${className}`}
      {...props}
    />
  );
}
