'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tracks the OS reduced-motion preference, live.
 *
 * `matchMedia` is an external store, so this subscribes to it rather than
 * mirroring it into state from an effect — which would cascade a render on
 * mount and is what the lint rule is objecting to. The server snapshot is
 * `false` because the server cannot know, and motion-on is the safe default
 * to hydrate from: the first client render corrects it before anything moves.
 */
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToMotion(onChange: () => void): () => void {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}
