# ARETE

One calm system for the day.

A mobile-first PWA that unifies habits, goals, tasks, focus sessions, meditation,
breathwork, calorie and macro logging, flexibility, cognitive practice and adaptive
workouts — coordinated by a single Today screen and a single evening review.

Working title. Renaming is a one-line change in `src/lib/app-config.ts`.

---

## Status

**Stage 3 of 17 — design system and application shell.** The app looks like the product
now: tokens, type, the component library, the navigation shell, a command launcher, and a
complete Today screen on demo data. The product modules are still not built — Plan, Train
and Progress render an honest "not built yet" state naming the stage that builds them,
rather than buttons that do nothing. Two things that do work are shown working and
labelled: the focus timer on Today, and the breathing pacer on Mind.

See `docs/PROJECT_LEDGER.md` for where the build actually stands and what comes next, and
`docs/DESIGN_SYSTEM.md` for the visual system.

## Requirements

- Node.js ≥ 20.9
- npm 10 (the repo pins `packageManager`; there was no lockfile before this stage)

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: the defaults already work
npm run dev                  # http://localhost:3000 -> /today
```

No credentials are needed. The app runs in **demo mode** by default, reading a fixed,
deterministic sample through the same repository interface that real data will use. The
UI labels it as demo data; it is never presented as the user's own.

`NEXT_PUBLIC_APP_MODE=live` deliberately **fails to start** until the Supabase adapter
exists in stage 4, rather than quietly serving sample data as if it were real.

## Commands

| Command                           | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `npm run dev`                     | Development server                                 |
| `npm run build`                   | Production build                                   |
| `npm run start`                   | Serve the production build                         |
| `npm run lint`                    | ESLint (flat config, `eslint-config-next`)         |
| `npm run format` / `format:check` | Prettier                                           |
| `npm run typecheck`               | `tsc --noEmit`, strict                             |
| `npm test`                        | Vitest unit and component tests                    |
| `npm run test:coverage`           | Vitest with V8 coverage                            |
| `npm run e2e`                     | Playwright smoke tests at phone and desktop widths |
| `npm run e2e:install`             | Install the Chromium browser Playwright needs      |
| `npm run verify`                  | Everything CI runs, in order                       |

## Architecture

```
src/
  app/            Next.js App Router — routes, layouts, loading/error/not-found
  components/     UI primitives, icons and navigation. No data fetching, no vendor SDKs
  design/         Design tokens and WCAG contrast maths. Pure data; the tests assert it
  domain/         Types and pure logic. Knows nothing about React or any database
  persistence/    Repository interfaces + the demo adapter. The only layer a database touches
  content/        Content packs as validated data, each carrying provenance
  analytics/      Typed events and a no-op sink. No free text ever leaves the device
  integrations/   External services, each behind an interface. Currently empty by design
  lib/            Environment validation and app config
e2e/              Playwright smoke tests
docs/             Source map, product spec, ledger, acceptance checklist
```

The dependency direction is one-way: `app` → `components` → `domain`, with `persistence`
and `content` reached only through their own interfaces. A component never imports a
database client, and the domain layer never imports React.

## Routes

| Route                                | State                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| `/`                                  | Redirects to `/today`                                  |
| `/today`                             | Live — reads the demo day through the repository layer |
| `/plan` `/train` `/mind` `/progress` | Shell with an honest placeholder                       |
| `/settings`                          | Live — build info and planned sections                 |
| `/api/health`                        | Build, version and mode. No secrets                    |

## Principles this codebase is held to

- **No fake anything.** No mock buttons, no dead links, no writes that vanish, no silent
  failures. A feature that is not built says so. A list row is pressable only when it has
  somewhere to go.
- **Accessibility claims are computed, not asserted.** Every colour pair the product
  renders is checked against WCAG AA in the test suite, and the stylesheet is parsed and
  compared against the token source so the two cannot drift.
- **Calm and non-shaming.** A missed day is quiet, not red. The word "streak" does not
  appear in copy about a missed day — there is a test for that.
- **Health features are self-management tools**, not diagnosis or treatment. Cold exposure
  and contrast therapy are opt-in and safety-gated.
- **Religious content is never assumed** from identity, name, language or location.
- **Cognitive drills report practice at those drills** and never claim IQ growth or transfer.
- **Source PDFs are reference material.** Every content item carries provenance, and
  `docs/SOURCE_MAP.md` records what may and may not be shipped.

## Privacy

No third-party analytics, no ad SDKs, no session replay. Journal text, reviews, food notes
and body measurements never appear in an analytics payload — enforced by a schema test, not
by a convention.
