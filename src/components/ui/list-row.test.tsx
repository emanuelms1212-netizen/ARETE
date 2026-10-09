import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListRow } from './list-row';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ListRow', () => {
  it('is static when it has nowhere to go', () => {
    render(
      <ul>
        <ListRow title="Read ten pages" trailing="Open" />
      </ul>,
    );

    expect(screen.getByText('Read ten pages')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a link only when given an href', () => {
    render(
      <ul>
        <ListRow title="Programs" href="/settings" />
      </ul>,
    );

    expect(screen.getByRole('link', { name: /Programs/ })).toHaveAttribute('href', '/settings');
  });

  it('shows the reason a row was skipped', () => {
    render(
      <ul>
        <ListRow title="Lower body" detail="Slept badly" muted />
      </ul>,
    );

    expect(screen.getByText('Slept badly')).toBeInTheDocument();
  });
});
