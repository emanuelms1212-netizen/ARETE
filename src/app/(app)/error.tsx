'use client';

import { Button, ErrorState } from '@/components/ui';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="This screen could not load."
      body={
        <>
          <p>Nothing you recorded has been lost.</p>
          {process.env.NODE_ENV !== 'production' ? (
            <p className="mt-2 font-mono text-xs break-words">{error.message}</p>
          ) : null}
        </>
      }
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
