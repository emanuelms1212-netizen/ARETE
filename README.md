# ARETE

One calm system for the day.

A mobile-first PWA that unifies habits, goals, tasks, focus sessions, meditation,
breathwork, calorie and macro logging, flexibility, cognitive practice and adaptive
workouts — coordinated by a single Today screen and a single evening review.

Working title. Renaming is a one-line change in `src/lib/app-config.ts`.

---

## Status

**Stage 8 of 17 — Train.** There is a real schema: 49 tables, row-level security on every one of them, and an authorization test suite
that runs against a real Postgres and actually tries to read another user's data. The app
reads the signed-in user's own local day through a repository interface with two
interchangeable implementations.

Onboarding asks eight skippable questions and generates a first week from the answers —
capped, explained item by item, and saved only once the user has edited it and agreed.

Today and Plan are live. Today holds the morning intention and the dichotomy-of-control
prompt, the day's commitments with complete, skip-with-reason, move-to-tomorrow, reorder and
quick-add, a minimum-day switch, a focus timer whose state lives on the server, and the
evening review. Plan holds goals, tasks across four views, and habits of four kinds.

Mind is live too: five secular meditations, five slow breathing patterns with the safety copy
on the screen where the decision is made, and two cognitive drills that report practice at
that drill and explicitly nothing else. An optional meditation pack exists and is off — its
practices are absent until someone chooses it.

Train is live: a deterministic plan engine that fits the week to the days, equipment, time and
pain flags a person gives it (tennis days included), explains every rule it applied, and
progresses only when the logged sets say so. Workouts are started, logged set by set with
effort and pain, swapped within a movement pattern, and finished. Nine exercises have an
original, data-driven SVG mannequin animation — tested for what the movement should look
like — and every one of the fifty has a full text instruction.

Progress still renders an honest "not built yet" state naming the stage that builds it.

See `docs/PROJECT_LEDGER.md` for where the build stands and what comes next,
`docs/DATA_MODEL.md` for the schema and the reasoning behind it,
`docs/PLAN_ENGINE.md` for how answers become a week, and
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

No credentials are needed. The app runs in **demo mode** by default: a fixed, deterministic
account served through the same repository interface real data uses, with writes that work
and last until the server restarts. The UI says so; it is never presented as durable.

For **live mode** you need a Supabase project and three environment variables — see
`docs/PROJECT_LEDGER.md` §8 for the twenty-minute setup. ARETE refuses to start in live mode
half-configured, and names what is missing, rather than quietly serving demo data as if it
were the account.

## Commands

| Command                           | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `npm run dev`                     | Development server                                 |
| `npm run build`                   | Production build                                   |
| `npm run start`                   | Serve the production build                         |
| `npm run lint`                    | ESLint (flat config, `eslint-config-next`)         |
| `npm run format` / `format:check` | Prettier                                           |
| `npm run typecheck`               | `tsc --noEmit`, strict                             |
| `npm test`                        | Vitest unit, component and database tests          |
| `npm run test:coverage`           | Vitest with V8 coverage                            |
| `npm run e2e`                     | Playwright smoke tests at phone and desktop widths |
| `npm run e2e:install`             | Install the Chromium browser Playwright needs      |
| `npm run db:migrate`              | Apply every migration, in order, from zero         |
| `npm run db:seed`                 | Content; plus the demo account outside production  |
| `npm run db:reset`                | Both                                               |
| `npm run verify`                  | Everything CI runs, in order                       |

The database commands read `SUPABASE_DB_URL`, the service-role connection string. They
are deployment work and never run on the request path.

## Architecture

```
src/
  app/            Next.js App Router — routes, layouts, loading/error/not-found
  components/     UI primitives, icons and navigation. No data fetching, no vendor SDKs
  design/         Design tokens and WCAG contrast maths. Pure data; the tests assert it
  domain/         Types, local days, recurrence, units, idempotency. No React, no database
  auth/           Who is this? Demo identity, or a Supabase session
  persistence/    Repository interface, demo adapter, SQL adapter. The only layer SQL touches
supabase/
  migrations/     The schema: 37 tables, row-level security on all of them
  test/           An auth-schema stand-in, for the tests only. Never applied to a real database
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
- **Security claims are tried, not stated.** The authorization tests run against a real
  Postgres and attempt to read, forge, update and delete another user's rows.
- **Rules that can be constraints are constraints.** No analytics event can hold free text,
  no quote can carry an unverified author, no skip can lack a reason — enforced in the
  database, where application code cannot forget.
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
