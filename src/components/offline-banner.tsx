'use client';

import { useEffect, useState } from 'react';

/**
 * Honest offline reporting.
 *
 * MVP has an offline app shell, not offline sync (PRODUCT_SPEC §12). So when
 * the connection drops the app says so plainly rather than accepting writes it
 * cannot keep. The banner is quiet, not alarming, and it is a live region so
 * screen readers hear the change.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div role="status" aria-live="polite">
      {isOffline ? (
        <p className="border-b border-line bg-sunken px-4 py-2 text-center text-body-sm text-ink-muted">
          Offline. You can read what is already loaded; saving is paused until you reconnect.
        </p>
      ) : null}
    </div>
  );
}
