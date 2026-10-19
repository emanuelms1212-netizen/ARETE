'use client';

import { useState, useTransition } from 'react';
import { Button, Dialog, FormField, TextInput } from '@/components/ui';

/** The delete control: a typed phrase, then a final button that says what it does. */
export function DeleteEverything({
  phrase,
  onDelete,
}: {
  phrase: string;
  onDelete: (phrase: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p role="status" className="text-body text-ink">
        Everything has been deleted.
      </p>
    );
  }
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)}>
        Delete my account and data
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete everything?"
        description="Every day, entry, programme and setting is deleted at once. This cannot be undone. Export first if you want a copy."
        footer={
          <>
            <Button variant="quiet" onClick={() => setOpen(false)} autoFocus>
              Keep my data
            </Button>
            <Button
              loading={pending}
              disabled={typed.trim().toLowerCase() !== phrase}
              onClick={() =>
                start(async () => {
                  const result = await onDelete(typed);
                  if (!result.ok) setError(result.message);
                  else {
                    setOpen(false);
                    setDone(true);
                  }
                })
              }
            >
              Delete everything
            </Button>
          </>
        }
      >
        <FormField label={`Type “${phrase}” to confirm`} {...(error ? { error } : {})}>
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
      </Dialog>
    </>
  );
}
