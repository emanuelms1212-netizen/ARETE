import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimerRing } from './timer-ring';

function offsets(container: HTMLElement): string[] {
  return [...container.querySelectorAll('circle')].map(
    (circle) => circle.getAttribute('stroke-dashoffset') ?? '',
  );
}

describe('TimerRing', () => {
  it('puts the value in text, not only in the ring', () => {
    render(
      <TimerRing progress={0.5} label="Focus session remaining">
        <span>12:30</span>
      </TimerRing>,
    );

    expect(screen.getByText('12:30')).toBeInTheDocument();
    expect(screen.getByText('Focus session remaining')).toBeInTheDocument();
  });

  it('clamps out-of-range progress instead of drawing something wrong', () => {
    const over = render(<TimerRing progress={4} />).container;
    const full = offsets(over).at(-1);
    expect(Number(full)).toBe(0);

    const under = render(<TimerRing progress={-2} />).container;
    const empty = offsets(under).at(-1);
    expect(Number(empty)).toBeGreaterThan(0);
  });

  it('survives a non-finite progress value', () => {
    const { container } = render(<TimerRing progress={Number.NaN} />);
    expect(Number(offsets(container).at(-1))).toBeGreaterThan(0);
  });
});
