# PROJECT_LEDGER.md

The running record of what ARETE is, what has been decided, and what happens next.
Updated at the end of every stage.

**Last updated:** 2026-10-10
**Stage:** 4 of 17 — data model, authentication and reliable persistence
**Branch:** `build/prompt-pack-v1`
**Repository:** `emanuelms1212-netizen/ARETE`

---

## 0. Recovery note — read this first

An earlier pass at stages 0–2 ran in a Codex session. **None of it was committed or
pushed.** That work is not recoverable. What exists here was rebuilt on 2026-09-09 from the
seven source PDFs and the prompt pack, and — unlike the previous attempt — **is committed**
at the end of every stage.

## 1. Current architecture

**Shape:** mobile-first PWA, Next.js App Router, Postgres behind a repository interface.

| Concern                           | Choice                                                                         | Version                |
| --------------------------------- | ------------------------------------------------------------------------------ | ---------------------- |
| Framework                         | Next.js (App Router, React Server Components)                                  | 16.3.4                 |
| UI runtime                        | React                                                                          | 19.2.8                 |
| Language                          | TypeScript, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | 6.0.3                  |
| Styling                           | Tailwind CSS v4 over design tokens                                             | 4.3.3                  |
| Faces                             | Fraunces Variable (display), Inter Variable (UI), self-hosted                  | 5.3.0                  |
| Validation                        | Zod                                                                            | 4.5.4                  |
| Database                          | Postgres. Schema in `supabase/migrations`, 37 tables, RLS on all of them       | —                      |
| Driver                            | `pg`, pooled, request-scoped JWT claim per transaction                         | 8.17.0                 |
| Auth                              | Supabase Auth, **authentication only**                                         | `@supabase/ssr` 0.12.7 |
| Test database                     | PGlite — Postgres 18 in-process, no server, no credentials                     | 0.5.8                  |
| Unit / component / database tests | Vitest + Testing Library + jsdom                                               | 5.0.0                  |
| End-to-end                        | Playwright (phone + desktop projects)                                          | 1.63.0                 |
| Lint / format                     | ESLint flat config + `eslint-config-next`; Prettier                            | 9.39.5 / 3.9.6         |
| Package manager                   | npm                                                                            | 10.9.8                 |

### Layers

```
app  →  components  →  domain      (types, local days, recurrence, units, idempotency)
   ↘  design                        (tokens + contrast maths)
   ↘  auth          → integrations/supabase   (sessions only)
   ↘  persistence   → repository interface
                        ├── memory adapter    (demo mode)
                        └── sql adapter → pg  (production)
```

`domain` imports nothing from React, Next or any database. `components` never import a vendor
SDK. The two repository adapters are interchangeable because they pass the same contract
suite — and the SQL one passes it _through_ row-level security, as the `authenticated` role.

## 2. Decisions and why

| #       | Decision                                                                         | Reason                                                                                                                                                                                                                                                                                                                                                | Reversible? |
| ------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D1      | Rebuild stages 0–2 rather than wait to recover the Codex work                    | Nothing was pushed                                                                                                                                                                                                                                                                                                                                    | n/a         |
| D2      | npm, with a committed lockfile                                                   | CI needs a lock for `npm ci`                                                                                                                                                                                                                                                                                                                          | Yes         |
| D3      | TypeScript 6.0.3, not 7.0.2                                                      | `typescript-eslint` throws on TS 7                                                                                                                                                                                                                                                                                                                    | Yes         |
| D4      | ESLint 9.39.5, not 10.10.0                                                       | `eslint-plugin-react` calls an API removed in ESLint 10                                                                                                                                                                                                                                                                                               | Yes         |
| D5      | Demo mode default; live mode refuses to start half-configured                    | No fake persistence. Failing loudly beats serving sample data as real                                                                                                                                                                                                                                                                                 | No          |
| D6      | ~~The demo repository is read-only~~                                             | **Superseded by D20**                                                                                                                                                                                                                                                                                                                                 | —           |
| D7      | Module screens show an honest placeholder                                        | A greyed-out button still implies a feature                                                                                                                                                                                                                                                                                                           | No          |
| D8      | No `@vitejs/plugin-react`; `oxc.jsx.runtime` in the Vitest config                | Fewer peers, native JSX transform                                                                                                                                                                                                                                                                                                                     | Yes         |
| D9      | `typedRoutes` off                                                                | Would couple `tsc --noEmit` to build artefacts                                                                                                                                                                                                                                                                                                        | Yes         |
| D10     | Offline shell only, stated plainly                                               | Offline sync needs a conflict design first                                                                                                                                                                                                                                                                                                            | No          |
| D11     | The reset pack ships as 66 days, labelled                                        | Source title says 60, content says 66                                                                                                                                                                                                                                                                                                                 | No          |
| D12     | No analytics event may carry free text                                           | Journal text is the most sensitive data here                                                                                                                                                                                                                                                                                                          | No          |
| D13     | Tokens in TypeScript; CSS mirrors them; a test compares                          | A design system documented in prose drifts                                                                                                                                                                                                                                                                                                            | No          |
| D14     | Contrast computed, not claimed                                                   | 48 assertions across both themes                                                                                                                                                                                                                                                                                                                      | No          |
| D15     | Self-hosted fonts, not `next/font`                                               | A PWA should not need a third party to render its own text                                                                                                                                                                                                                                                                                            | Yes         |
| D16     | Native `<dialog>` for sheets, confirmations and the launcher                     | Focus trap and Escape from the platform                                                                                                                                                                                                                                                                                                               | Yes         |
| D17     | Real radios for the segmented control                                            | Arrow keys come free and correct                                                                                                                                                                                                                                                                                                                      | Yes         |
| D18     | Reduced motion rests the breathing ring at full size                             | A 0.01ms collapse would freeze it mid-scale                                                                                                                                                                                                                                                                                                           | No          |
| D19     | `/styleguide` 404s in production                                                 | One line that cannot be forgotten                                                                                                                                                                                                                                                                                                                     | Yes         |
| **D20** | **The demo repository is writable, in memory, and says so**                      | D6 kept demo mode read-only to avoid faking durability. With a real contract to satisfy, the honest version is the opposite: demo mode implements the _same_ writes so it exercises the real domain behaviour, and the badge says changes last until the server restarts. The dishonest version is a store that looks permanent and empties on deploy | No          |
| **D21** | **Supabase for authentication only; data access is plain SQL to Postgres**       | The SQL the tests prove is the SQL production runs. A PostgREST data layer would only exist in production and could not be exercised against a real database locally                                                                                                                                                                                  | Yes         |
| **D22** | **The authorization tests run against PGlite, a real Postgres in process**       | "One user cannot read another's data" is worthless unless something tries. PGlite is Postgres 18 compiled to WASM, so policies behave exactly as they will hosted — and it needs no project, no network and no credentials                                                                                                                            | Yes         |
| **D23** | **A test fixture stands in for Supabase's `auth` schema**                        | The migrations depend on `auth.users` and `auth.uid()`. `supabase/test/0000_auth_shim.sql` is the smallest faithful stand-in, kept in a separate directory so it can never be applied to a real database                                                                                                                                              | No          |
| **D24** | **One contract suite, both adapters**                                            | They are only interchangeable if they behave identically, and the only way to know is to hold both to the same tests                                                                                                                                                                                                                                  | No          |
| **D25** | **Both `ENABLE` and `FORCE` row-level security, everywhere**                     | FORCE means the table owner is not exempt either, so a bug in a security-definer function cannot quietly read everything                                                                                                                                                                                                                              | No          |
| **D26** | **Product rules go in check constraints where they can**                         | No free text in analytics, no unverified attributions, no skip without a reason. Application code can forget; a constraint cannot                                                                                                                                                                                                                     | No          |
| **D27** | **`DATABASE_URL` that looks like a service-role connection is rejected at boot** | The service role bypasses every policy. Catching it in environment validation is cheaper than discovering it in an incident                                                                                                                                                                                                                           | No          |
| **D28** | **Measurements stored metric, converted at the edge**                            | `unit_system` says what to show, never what to store, so switching systems cannot corrupt history                                                                                                                                                                                                                                                     | No          |
| **D29** | **A small closed recurrence grammar, not RRULE**                                 | Daily, weekly-by-weekday and monthly-by-day cover everything the product needs, and a small grammar can be exhaustively tested and rendered back in plain English                                                                                                                                                                                     | Yes         |

## 3. Data model

37 tables. The full account is in **`docs/DATA_MODEL.md`**; the schema itself is
`supabase/migrations/0001` through `0010`.

Five conventions run through all of it: ownership by `user_id` with RLS; local days with the
zone stored beside the date; template / instance / log as separate tables; one unit system in
storage; and `client_token` on every write a retry might repeat.

**Migrations:** 10, applying from zero, proven in `src/persistence/rls.test.ts`.
**Not yet:** a migration-ledger table. `db:migrate` replays every file, which is fine while
they are idempotent and the project is pre-release, and must change before the first deploy.

## 4. Routes

| Route                        | Kind          | State                                                              |
| ---------------------------- | ------------- | ------------------------------------------------------------------ |
| `/`                          | redirect      | → `/today`                                                         |
| `/today`                     | **dynamic**   | Live — reads the signed-in user's local day through the repository |
| `/plan` `/train` `/progress` | static        | Placeholder                                                        |
| `/mind`                      | static        | Placeholder, plus a working breathing pacer                        |
| `/settings`                  | static        | Build info and planned sections                                    |
| `/styleguide`                | dev only      | 404s in production                                                 |
| `/api/health`                | route handler | Build, version and mode. No secrets                                |

## 5. Commands

| Gate                         | Command                               | In CI           |
| ---------------------------- | ------------------------------------- | --------------- |
| Format · Lint · Types        | `format:check` · `lint` · `typecheck` | Yes             |
| Unit, component and database | `npm test` — **242 tests**            | Yes             |
| Build                        | `npm run build`                       | Yes             |
| End-to-end                   | `npm run e2e` — **36 tests**          | Yes             |
| Everything                   | `npm run verify`                      | —               |
| Migrate / seed / reset       | `db:migrate` · `db:seed` · `db:reset` | No — deployment |

## 6. Known limitations

1. **No Supabase project exists.** Everything is proven against an in-process Postgres; the
   migrations have never been applied to a hosted database. This is the one thing stage 4
   cannot finish without the product owner — see §8.
2. **Repositories exist for days and focus sessions only.** The other tables have schema,
   policies, seed and tests; their repositories arrive with the modules that use them.
3. **Four of six destinations are placeholders.**
4. **No sign-in screen.** The auth provider works; the screen is stage 5's onboarding.
5. **Offline shell only** — no service worker, no write queue, no sync.
6. **No migration ledger table** (see §3).
7. **No theme toggle.** The app follows `prefers-color-scheme`; a manual override is stage 5.
8. TypeScript and ESLint are each one major version behind their latest release (D3, D4).
9. **Playwright cannot run on this machine**: no browser, and the network allowlist blocks
   `cdn.playwright.dev`. The suite runs in CI and was run for this stage elsewhere.

## 7. Open risks

| Risk                                                       | Severity | Owner                          | Note                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rights to ship the `Total Flexibility` programme structure | **High** | Product owner                  | Third-party commercial ebook. Now enforced in data: `flexibility_programs.rights_status = 'pending'`, and the seed ships it that way. Either obtain written permission from David Thurin or re-derive the progression |
| Contrast-therapy safety                                    | **High** | Product + a qualified reviewer | 70–82 °C sauna, 13 °C immersion, no screening in the source. The pack is flagged `requires_safety_acknowledgement`, and `safety_acknowledgements` gates it                                                            |
| Seed-oil content is contested and copyrighted              | Medium   | Product owner                  | Seeded as `third-party-no-redistribution`. At most one optional labelled note                                                                                                                                         |
| Exercise animations do not exist                           | Medium   | Design                         | `exercise_animation_assets.is_original` must be true for anything shipped                                                                                                                                             |
| No infrastructure                                          | Medium   | Engineering                    | §8                                                                                                                                                                                                                    |
| Screen-reader testing has not been done                    | Medium   | Engineering                    | Stage 13                                                                                                                                                                                                              |
| No backup or restore procedure                             | Medium   | Engineering                    | Needed before any real user data exists                                                                                                                                                                               |
| Unattributed quotes in a source PDF                        | Low      | Content                        | The schema now refuses to attribute anything unverified                                                                                                                                                               |

## 8. Exact next step

**Blocked on one thing, then stage 5.**

### Blocked: the Supabase project (product owner, ~20 minutes)

Everything else in stage 4 is done and tested. What is needed:

1. Create a Supabase project. Note the region — put it near the users, not near the developer.
2. From **Project settings → API**, copy the project URL and the `anon` key into
   `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are
   public values; they identify the project and grant nothing on their own.
3. From **Project settings → Database**, copy the connection string twice:
   - the **pooler** URL, as `DATABASE_URL` — this is the request path, and it must be a role
     that row-level security applies to. Environment validation rejects a service-role URL here.
   - the **service-role** URL, as `SUPABASE_DB_URL`, kept out of the repository. Migrations
     and the seed only.
4. `npm run db:reset` — applies all ten migrations, then seeds content and the demo account.
5. In **Authentication → Providers**, enable email, and one social provider.
6. Set `NEXT_PUBLIC_APP_MODE=live` and start the app.

Until then `NEXT_PUBLIC_APP_MODE=demo` runs the whole product with no credentials at all.

### Then: stage 5 — onboarding and the adaptive plan engine

1. The sign-in screen the auth provider is waiting for, and the session middleware that
   refreshes it.
2. Onboarding: name, timezone, what they want help with, and **the minimum viable day** —
   writing to `profiles`, `preferences` and `onboarding_answers`.
3. Programme selection, with every parameter editable before starting and the 60-versus-66-day
   note shown.
4. The plan engine: expand habit schedules and task recurrences into a day, honouring the
   user's week start and timezone. The recurrence module is already built and tested.
5. Repositories for `habits`, `habit_schedules` and `tasks`, held to the same contract.

**Do not build feature modules (stage 6 onward) before onboarding exists.** Every module needs
a user who has said what a real day looks like for them.

## 9. Working rules learned the hard way

- **Commit at the end of every stage, before reporting it complete.** Uncommitted work in an
  agent sandbox is work that does not exist.
- Pin exact versions and verify them against the registry, never from memory.
- When a version choice breaks a gate, downgrade the dependency and record why — do not
  disable the gate.
- When a claim can be computed, compute it in a test (D13, D14). Documentation that only
  asserts will eventually lie.
- When a rule can be a constraint, make it a constraint (D26). Code forgets; constraints do not.
- A security claim with no adversarial test behind it is a wish (D22).
