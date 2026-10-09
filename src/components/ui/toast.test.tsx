import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { ToastProvider, useToast } from './toast';

function Harness() {
  const { show } = useToast();
  return <Button onClick={() => show('Day committed.')}>Commit</Button>;
}

describe('toasts', () => {
  it('announces politely rather than interrupting', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Commit' }));

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Day committed.');
  });

  it('can be dismissed by hand', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Commit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('status')).not.toHaveTextContent('Day committed.');
  });

  it('refuses to be used outside its provider instead of failing quietly', () => {
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
  });
});
