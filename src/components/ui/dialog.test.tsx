import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from './dialog';

describe('Dialog', () => {
  it('names itself from its heading', () => {
    render(<Dialog open onClose={() => {}} title="Mark the day" />);
    expect(screen.getByRole('dialog', { name: 'Mark the day' })).toBeInTheDocument();
  });

  it('offers a labelled way out', async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="Mark the day" />);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  const props = {
    open: true,
    title: 'Delete everything?',
    description: 'This cannot be undone.',
    confirmLabel: 'Delete everything',
  };

  it('labels the confirm button with the action, never "OK"', () => {
    render(<ConfirmDialog {...props} onConfirm={() => {}} onCancel={() => {}} />);

    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ok$/i })).toBeNull();
  });

  it('reports confirm and cancel separately', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
