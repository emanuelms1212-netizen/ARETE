import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLauncher } from './command-launcher';
import { destinations } from './destinations';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('CommandLauncher', () => {
  beforeEach(() => {
    push.mockClear();
  });

  async function open() {
    const user = userEvent.setup();
    render(<CommandLauncher />);
    await user.click(screen.getByRole('button', { name: 'Search and commands' }));
    return user;
  }

  it('offers only destinations that exist', async () => {
    await open();

    const options = screen.getAllByRole('button').filter((button) => {
      const label = button.textContent ?? '';
      return destinations.some((destination) => label.startsWith(destination.label));
    });

    expect(options).toHaveLength(destinations.length);
  });

  it('filters as you type', async () => {
    const user = await open();

    await user.type(screen.getByRole('searchbox', { name: 'Search destinations' }), 'flex');

    expect(screen.getByText('Train')).toBeInTheDocument();
    expect(screen.queryByText('Progress')).toBeNull();
  });

  it('navigates on Enter', async () => {
    const user = await open();

    await user.type(screen.getByRole('searchbox', { name: 'Search destinations' }), 'mind{Enter}');

    expect(push).toHaveBeenCalledWith('/mind');
  });

  it('says so plainly when nothing matches', async () => {
    const user = await open();

    await user.type(screen.getByRole('searchbox', { name: 'Search destinations' }), 'zzzz');

    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('advertises its keyboard shortcut', async () => {
    render(<CommandLauncher />);
    expect(screen.getByRole('button', { name: 'Search and commands' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Meta+K Control+K',
    );
  });
});
