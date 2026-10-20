'use client';

import { useState, useTransition } from 'react';
import { Button, Dialog, FormField, TextInput } from '@/components/ui';
import { DATA_FEATURES, DATA_FEATURE_INFO, type DataFeature } from '@/domain';

type Result = { ok: true } | { ok: false; message: string };

/**
 * Delete one part of the account. Each row says what goes and what stays;
 * the dialog asks for the part's name typed, so a stray tap does nothing.
 */
export function FeatureDeletion({
  onDelete,
}: {
  onDelete: (feature: string, typed: string) => Promise<Result>;
}) {
  const [chosen, setChosen] = useState<DataFeature | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<readonly DataFeature[]>([]);
  const [pending, start] = useTransition();
  const info = chosen ? DATA_FEATURE_INFO[chosen] : null;

  const close = () => {
    setChosen(null);
    setTyped('');
    setError(null);
  };

  return (
    <>
      <ul className="space-y-3" data-testid="feature-deletion">
        {DATA_FEATURES.map((feature) => {
          const row = DATA_FEATURE_INFO[feature];
          const gone = deleted.includes(feature);
          return (
            <li key={feature} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body font-medium text-ink">{row.label}</span>
                {gone ? (
                  <span role="status" className="text-body-sm text-ink-muted">
                    Deleted
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="quiet"
                    aria-label={`Delete: ${row.label}`}
                    onClick={() => setChosen(feature)}
                  >
                    Delete
                  </Button>
                )}
              </div>
              <p className="mt-1 text-body-sm text-ink-muted">Removes: {row.removes}</p>
              <p className="text-body-sm text-ink-muted">Keeps: {row.keeps}</p>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={chosen !== null}
        onClose={close}
        title={info ? `Delete your ${info.label.toLowerCase()}?` : ''}
        description={info ? `${info.removes} This cannot be undone.` : undefined}
        footer={
          <>
            <Button variant="quiet" onClick={close} autoFocus>
              Keep it
            </Button>
            <Button
              loading={pending}
              disabled={!info || typed.trim().toLowerCase() !== info.label.toLowerCase()}
              onClick={() =>
                start(async () => {
                  if (!chosen) return;
                  const result = await onDelete(chosen, typed);
                  if (!result.ok) setError(result.message);
                  else {
                    setDeleted([...deleted, chosen]);
                    close();
                  }
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        {info ? (
          <FormField label={`Type “${info.label}” to confirm`} {...(error ? { error } : {})}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
      </Dialog>
    </>
  );
}
