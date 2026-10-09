import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField, TextInput } from './form-field';

describe('FormField', () => {
  it('ties the label, hint and error to the control', () => {
    render(
      <FormField label="Water target" hint="Litres per day." error="Enter a number.">
        {({ id, describedBy }) => (
          <TextInput id={id} aria-describedby={describedBy} invalid defaultValue="40" />
        )}
      </FormField>,
    );

    const input = screen.getByLabelText('Water target');
    expect(input).toHaveAccessibleDescription('Litres per day. Enter a number.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('announces the error', () => {
    render(
      <FormField label="Wake time" error="That is not a time.">
        {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} />}
      </FormField>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('That is not a time.');
  });

  it('adds no description when there is nothing to describe', () => {
    render(
      <FormField label="Name">
        {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} />}
      </FormField>,
    );

    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby');
  });
});
