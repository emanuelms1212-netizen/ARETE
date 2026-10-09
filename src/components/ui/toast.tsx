'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: 'neutral' | 'success' | 'warn';
}

interface ToastContextValue {
  readonly toasts: readonly Toast[];
  readonly show: (message: string, tone?: Toast['tone']) => void;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 3;

/**
 * Toasts report what just happened. They never carry an action that exists
 * nowhere else, because a message that disappears cannot be the only way to do
 * something.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: Toast['tone'] = 'neutral') => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}

const tones = {
  neutral: 'border-line text-ink',
  success: 'border-success text-ink',
  warn: 'border-warn text-ink',
} as const;

function ToastRegion() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-56"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-fade-in pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-3 text-body-sm shadow-overlay ${tones[toast.tone]}`}
        >
          <span className="min-w-0">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 text-body-sm text-ink-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
