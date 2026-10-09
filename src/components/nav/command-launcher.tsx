'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchIcon } from '@/components/icons';
import { launcherTargets } from './destinations';

/**
 * Command and search launcher.
 *
 * Opens with Cmd-K or Ctrl-K, or from the header button. It lists only routes
 * that exist — a launcher that offers actions which go nowhere would be the
 * most annoying possible version of a dead link, since it is the fastest way to
 * reach one.
 *
 * Built on the native `<dialog>` element for the focus trap and Escape
 * handling; arrow keys and Enter are wired here because a filtered list is not
 * a platform control.
 */
export function CommandLauncher() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = launcherTargets.filter((target) => {
    const haystack = `${target.label} ${target.question}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search and commands"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-ink"
      >
        <SearchIcon size={20} />
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={close}
        aria-label="Search and commands"
        className="animate-sheet-in mx-auto mt-24 w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-overlay backdrop:bg-black/40"
      >
        <div className="border-b border-line p-3">
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Go to…"
            aria-label="Search destinations"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const target = results[active];
                if (target) go(target.href);
              }
            }}
            className="min-h-11 w-full rounded-md bg-transparent px-2 text-body text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-sm text-ink-muted">
            Nothing matches “{query}”.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto p-2">
            {results.map((target, index) => (
              <li key={target.href}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(target.href)}
                  className={`focus-inset flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left ${
                    index === active ? 'bg-accent-soft text-accent' : 'text-ink'
                  }`}
                >
                  <target.Icon size={18} />
                  <span className="min-w-0">
                    <span className="block truncate text-body">{target.label}</span>
                    <span className="block truncate text-body-sm text-ink-muted">
                      {target.question}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-line px-4 py-2 text-label text-ink-muted">
          Enter to go · Esc to close · ⌘K anywhere
        </p>
      </dialog>
    </>
  );
}
