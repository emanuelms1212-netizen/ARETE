import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState, ErrorState } from './state-block';

describe('state blocks', () => {
  it('renders an empty state with a next action', () => {
    render(
      <EmptyState
        title="Nothing planned yet."
        body="Pick one thing."
        action={<button type="button">Add</button>}
      />,
    );

    expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('announces an error state to assistive technology', () => {
    render(<ErrorState title="This screen could not load." />);

    expect(screen.getByRole('alert')).toHaveTextContent('This screen could not load.');
  });

  it('does not announce a merely empty state as an alert', () => {
    render(<EmptyState title="Nothing here yet." />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
