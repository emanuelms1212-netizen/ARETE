import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from './bottom-nav';
import { destinations } from './destinations';

vi.mock('next/navigation', () => ({
  usePathname: () => '/train',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('BottomNav', () => {
  it('renders exactly the five primary destinations', () => {
    render(<BottomNav />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.textContent)).toEqual(destinations.map((d) => d.label));
  });

  it('marks the current destination for assistive technology, not only by colour', () => {
    render(<BottomNav />);

    expect(screen.getByRole('link', { name: 'Train' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
  });

  it('is labelled as the primary navigation landmark', () => {
    render(<BottomNav />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('does not put settings in the tab bar', () => {
    render(<BottomNav />);

    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull();
  });
});
