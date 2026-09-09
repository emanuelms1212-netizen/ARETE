# OFFLINE_STRATEGY.md

What ARETE does without a network, stated so that the app never claims more than it does.

## The rule

**The app must never pretend a write succeeded.** Everything below follows from that.
An app that swallows a journal entry into a queue it cannot reconcile is worse than an app
that says "not now" — the first loses the user's words silently, the second is merely
inconvenient.

## What ships in MVP

**An installable PWA with an offline app shell. Not offline sync.**

| Works offline                    | Does not work offline                       |
| -------------------------------- | ------------------------------------------- |
| The installed shell opens        | Loading a day that is not already in memory |
| Navigation between destinations  | Any write — commit, check-off, journal, log |
| A focus timer already running    | Auth refresh                                |
| Reading the currently-loaded day | Anything server-rendered on demand          |

## How the app behaves

1. `OfflineBanner` listens for `online` / `offline` and renders a quiet, polite live region
   at the top of the app when the connection is gone.
2. Write controls are **disabled** while offline, with the banner explaining why. They are
   not left enabled to fail later, and they do not queue silently.
3. A running focus timer keeps running. It is driven by wall-clock time, so it survives the
   tab being backgrounded, and it is reconciled on reconnect.
4. On reconnect the banner disappears and the current view refetches.

## What is deliberately not built yet

- **No service worker.** Precaching the shell lands with the design system in stage 3, once
  there is a stable asset set worth caching. Until then the app is honest about being
  online-only, which is the acceptable state; claiming otherwise is not.
- **No write queue.** A queue without conflict resolution is a data-loss mechanism.
- **No background sync.** It depends on the queue.
- **No local database.** Choosing IndexedDB now, before the stage-4 schema exists, would
  mean designing the same model twice.

## What full offline support would require (post-MVP)

A real offline mode is its own project, not a flag:

1. A local store mirroring the stage-4 schema (IndexedDB).
2. An outbox with idempotency keys, so a retried write cannot double-apply.
3. A conflict policy per entity. Most of ARETE's writes are append-only or last-write-wins
   per field, but two matter: **the day's commitment set** (edited on two devices) and
   **journal text** (never silently merged — the user is shown both and chooses).
4. A visible sync state: pending count, last successful sync, and a way to inspect and
   discard a stuck item.
5. Clock-skew handling, since `Day` is keyed by the device's local date.

Only once all five exist may the UI describe the app as working offline.

## Service-worker scope, when it arrives

- **Precache:** the app shell, fonts, icons, CSS and JS chunks.
- **Never cache:** `/api/*`, anything authenticated, anything with user data.
- **Strategy:** stale-while-revalidate for static assets, network-only for data.
- **Updates:** a new version prompts rather than swapping under the user mid-session, and
  never while a focus session is running.
