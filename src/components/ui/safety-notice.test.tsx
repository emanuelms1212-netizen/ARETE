import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafetyNotice } from './safety-notice';

describe('SafetyNotice', () => {
  it('is a named region, not an alert that interrupts', () => {
    render(
      <SafetyNotice title="Before any cold or heat exposure">
        <p>Never do cold immersion alone.</p>
      </SafetyNotice>,
    );

    expect(
      screen.getByRole('region', { name: 'Before any cold or heat exposure' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('carries its content', () => {
    render(
      <SafetyNotice title="Safety">
        <p>Start below the numbers in the source material.</p>
      </SafetyNotice>,
    );

    expect(screen.getByText(/Start below the numbers/)).toBeInTheDocument();
  });
});
