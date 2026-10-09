import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Commit</Button>);
    expect(screen.getByRole('button', { name: 'Commit' })).toHaveAttribute('type', 'button');
  });

  it('announces and blocks interaction while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is not busy when it is merely disabled', () => {
    render(<Button disabled>Later</Button>);
    const button = screen.getByRole('button', { name: 'Later' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('keeps a 44px hit area at every size', () => {
    render(
      <>
        <Button size="md">Medium</Button>
        <Button size="sm">Small</Button>
      </>,
    );
    for (const name of ['Medium', 'Small']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
  });
});
