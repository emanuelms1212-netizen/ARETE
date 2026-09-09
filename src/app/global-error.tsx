'use client';

/**
 * Last-resort boundary. It replaces the root layout, so it renders its own
 * html/body and cannot rely on any app styling being present.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#f6f5f2',
          color: '#1b1f24',
        }}
      >
        <main style={{ maxWidth: '28rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.125rem', margin: 0 }}>ARETE could not start.</h1>
          <p style={{ color: '#5b6570', marginTop: '0.75rem' }}>
            Nothing you recorded has been lost. Try again, and if this keeps happening the version
            details are at <code>/api/health</code>.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '2.75rem',
              padding: '0 1.25rem',
              borderRadius: '999px',
              border: 'none',
              background: '#3d6d62',
              color: '#f6f5f2',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
