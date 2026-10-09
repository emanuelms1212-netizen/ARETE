'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from '@/components/icons';
import { Button } from './button';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
}

/**
 * A bottom sheet on phones and a centred dialog from `sm` up — one component,
 * because they are the same thing at two widths.
 *
 * Built on the native `<dialog>` element, so the focus trap, the Escape key,
 * inertness of the page behind and the backdrop all come from the platform
 * rather than from hand-written ARIA that drifts.
 */
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `showModal` is absent in some test environments; fall back to the plain
    // open attribute rather than throwing.
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="animate-sheet-in m-0 mt-auto w-full max-w-md rounded-t-xl border border-line bg-surface p-0 text-ink shadow-overlay backdrop:bg-black/40 sm:m-auto sm:rounded-xl"
    >
      <div className="px-safe pb-safe p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="font-display text-display-3 font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        {description ? <div className="mt-2 text-body text-ink-muted">{description}</div> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </dialog>
  );
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Confirmation for anything that cannot be undone.
 *
 * The confirm button says what it does ("Delete everything"), never "OK", and
 * cancel is the first thing focus lands on.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="quiet" onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    />
  );
}
