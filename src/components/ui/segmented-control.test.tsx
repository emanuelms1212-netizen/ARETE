import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const options = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;

describe('SegmentedControl', () => {
  it('exposes real radios in a named group', () => {
    render(<SegmentedControl legend="Range" options={options} value="week" onChange={() => {}} />);

    expect(screen.getByRole('group', { name: 'Range' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Day' })).not.toBeChecked();
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl legend="Range" options={options} value="week" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Day' }));
    expect(onChange).toHaveBeenCalledWith('day');
  });
});
