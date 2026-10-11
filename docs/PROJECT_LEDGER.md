# PROJECT_LEDGER.md

The running record of what ARETE is, what has been decided, and what happens next.
Updated at the end of every stage.

**Last updated:** 2026-10-10
**Stage:** 5 of 17 — onboarding and the adaptive plan engine
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
| Database                          | Postgres. Schema in `supabase/migrations`, 43 tables, RLS on all of them       | —                      |
| Driver                            | `pg`, pooled, request-scoped JWT claim per transaction                         | 8.17.0                 |
| Auth                              | Supabase Auth, **authentication only**                                         | `@supabase/ssr` 0.12.7 |
| Test database                     | PGlite — Postgres 18 in-process, no server, no credentials                     | 0.5.8                  |
| Unit / component / database tests | Vitest + Testing Library + jsdom                                               | 5.0.0                  |
| End-to-end                        | Playwright (phone + desktop projects)                                          | 1.63.0                 |
| Lint / format                     | ESLint flat config + `eslint-config-next`; Prettier                            | 9.39.5 / 3.9.6         |
| Package manager                   | npm                                                                            | 10.9.8                 |

### Layers

```
app  →  components  →  domain      (types, local days, recurrence, units, idempotency,
   ↘                                   onboarding schemas, safety rules, plan generator)
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
| **D30** | **A skipped step is a conservative answer, not a missing one**                   | Every step schema supplies its own defaults and the profile uses Zod's `.prefault({})`, so skipping produces a complete, usable, cautious week. The alternative — absent answers the generator checks for everywhere — puts the branch in every call site instead of once in the schema                                                               | No          |
| **D31** | **"Prefer not to say" raises a safety notice; it never blocks**                  | Blocking someone for declining a personal question teaches them to lie to the form, and a form people lie to is more dangerous than one they leave blank                                                                                                                                                                                              | No          |
| **D32** | **Safety rules may only tighten**                                                | Decisions are ranked and rules apply in sequence through `tighten()`, so the strictest answer wins and nothing later can relax it. Two conditions that each reroute something can never combine into permission                                                                                                                                       | No          |
| **D33** | **The age gate is enforced in the database as well as the generator**            | A trigger rejects a `nutrition_targets` row with calories for a user under 18 without `guardian_confirmed_at`. A later feature that writes targets by another path cannot forget                                                                                                                                                                      | No          |
| **D34** | **Nothing is written until the user accepts the week**                           | The generated week is a `plan_drafts` row. Reaching review and leaving creates no days, and the contract suite asserts it. A plan a person has edited is a plan they chose                                                                                                                                                                            | No          |
| **D35** | **The edited draft is stored beside the generated one, not over it**             | The difference between what the engine proposed and what the user kept is the most useful signal this product will collect. Overwriting loses it                                                                                                                                                                                                      | Yes         |
| **D36** | **Hard caps on week one: four training days, three habits, one quiet day**       | The limit protects the user from their own first-week enthusiasm, which is the single most reliable cause of abandonment in this category                                                                                                                                                                                                             | Yes         |
| **D37** | **Durations live in `minutes`, never in an item's title**                        | The UI renders both, so a title that names its own duration reads "Mobility · 10 min 10 min". A test asserts no generated title contains one                                                                                                                                                                                                          | No          |
| **D38** | **The review screen draws its draft in a plain server function, not an action**  | A server action may not revalidate a path during render. `ensureDraftWeek` is the reusable read; `generateDraftAction` wraps it for the client. Found by reading the dev-server log during an otherwise green E2E run                                                                                                                                 | No          |

## 3. Data model

43 tables. The full account is in **`docs/DATA_MODEL.md`**; the schema itself is
`supabase/migrations/0001` through `0011`. Stage 5 added `onboarding_progress`,
`health_profile`, `training_profile`, `nutrition_profile`, `mind_profile` and `plan_drafts`,
with row-level security on all of them and `user_owned_tables()` rewritten to cover them —
so export and deletion reach them too.

Five conventions run through all of it: ownership by `user_id` with RLS; local days with the
zone stored beside the date; template / instance / log as separate tables; one unit system in
storage; and `client_token` on every write a retry might repeat.

**Migrations:** 11, applying from zero, proven in `src/persistence/rls.test.ts`.
**Not yet:** a migration-ledger table. `db:migrate` replays every file, which is fine while
they are idempotent and the project is pre-release, and must change before the first deploy.

## 4. Routes

| Route                        | Kind          | State                                                                                                                                   |
| ---------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | redirect      | → `/today`                                                                                                                              |
| `/today`                     | **dynamic**   | Live — reads the signed-in user's real local day through the repository, and offers to set up the first week until onboarding completes |
| `/onboarding`                | **dynamic**   | Live — resumes at the step the user left                                                                                                |
| `/onboarding/[step]`         | **dynamic**   | Live — eight questions and the week review                                                                                              |
| `/plan` `/train` `/progress` | static        | Placeholder                                                                                                                             |
| `/mind`                      | static        | Placeholder, plus a working breathing pacer                                                                                             |
| `/settings`                  | static        | Build info and planned sections                                                                                                         |
| `/styleguide`                | dev only      | 404s in production                                                                                                                      |
| `/api/health`                | route handler | Build, version and mode. No secrets                                                                                                     |

## 5. Commands

| Gate                         | Command                               | In CI           |
| ---------------------------- | ------------------------------------- | --------------- |
| Format · Lint · Types        | `format:check` · `lint` · `typecheck` | Yes             |
| Unit, component and database | `npm test` — **374 tests**            | Yes             |
| Build                        | `npm run build`                       | Yes             |
| End-to-end                   | `npm run e2e` — **50 tests**          | Yes             |
| Everything                   | `npm run verify`                      | —               |
| Migrate / seed / reset       | `db:migrate` · `db:seed` · `db:reset` | No — deployment |

## 6. Known limitations

1. **No Supabase project exists.** Everything is proven against an in-process Postgres; the
   migrations have never been applied to a hosted database. This is the one thing still
   blocked on the product owner — see §8. It did not block stage 5.
2. **Repositories exist for days, focus sessions and onboarding only.** The other tables have
   schema, policies, seed and tests; their repositories arrive with the modules that use them.
3. **Four of six destinations are placeholders.**
4. **No sign-in screen.** The auth provider works and onboarding runs; the screen itself still
   waits on the Supabase project (§8), because there is nothing to sign in to without one.
5. **The plan engine generates week one only.** Adaptation needs completion history to adapt
   to, which arrives with the modules that record it.
6. **No programme selection.** Choosing the reset pack or a flexibility programme, with its
   parameters editable and the 60-versus-66-day note shown, is still ahead. The mind step
   offers the packs; starting one does not exist yet.
7. **Offline shell only** — no service worker, no write queue, no sync.
8. **No migration ledger table** (see §3).
9. **No theme toggle.** The app follows `prefers-color-scheme`; a manual override is still open.
10. TypeScript and ESLint are each one major version behind their latest release (D3, D4).
11. **Playwright cannot run on the build machine**: no browser, and the network allowlist
    blocks `cdn.playwright.dev`. The suite runs in CI with Playwright's own Chromium, and is
    run here against a production build by setting `PLAYWRIGHT_CHROMIUM_PATH` to a
    preinstalled one. There is no uncommitted local patch.

## 7. Open risks

| Risk                                                       | Severity | Owner                          | Note                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rights to ship the `Total Flexibility` programme structure | **High** | Product owner                  | Third-party commercial ebook. Now enforced in data: `flexibility_programs.rights_status = 'pending'`, and the seed ships it that way. Either obtain written permission from David Thurin or re-derive the progression                                                      |
| Contrast-therapy safety                                    | **High** | Product + a qualified reviewer | 70–82 °C sauna, 13 °C immersion, no screening in the source. The pack is flagged `requires_safety_acknowledgement`, and `safety_acknowledgements` gates it                                                                                                                 |
| Seed-oil content is contested and copyrighted              | Medium   | Product owner                  | Seeded as `third-party-no-redistribution`. At most one optional labelled note                                                                                                                                                                                              |
| Exercise animations do not exist                           | Medium   | Design                         | `exercise_animation_assets.is_original` must be true for anything shipped                                                                                                                                                                                                  |
| No infrastructure                                          | Medium   | Engineering                    | §8                                                                                                                                                                                                                                                                         |
| **The safety rules have not been reviewed by a clinician** | **High** | Product + a qualified reviewer | The rules in `src/domain/safety.ts` are conservative and tested, but they were written by an engineer reading source PDFs. Pregnancy, cardiovascular and injury gating is exactly the kind of judgement that needs a professional to sign it off before real users meet it |
| Screen-reader testing has not been done                    | Medium   | Engineering                    | Stage 13                                                                                                                                                                                                                                                                   |
| No backup or restore procedure                             | Medium   | Engineering                    | Needed before any real user data exists                                                                                                                                                                                                                                    |
| Unattributed quotes in a source PDF                        | Low      | Content                        | The schema now refuses to attribute anything unverified                                                                                                                                                                                                                    |

## 8. Exact next step

**Still blocked on one thing, and it is not blocking the build.**

### Blocked: the Supabase project (product owner, ~20 minutes)

1. Create a Supabase project. Note the region — put it near the users, not near the developer.
2. From **Project settings → API**, copy the project URL and the `anon` key into
   `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are
   public values; they identify the project and grant nothing on their own.
3. From **Project settings → Database**, copy the connection string twice:
   - the **pooler** URL, as `DATABASE_URL` — this is the request path, and it must be a role
     that row-level security applies to. Environment validation rejects a service-role URL here.
   - the **service-role** URL, as `SUPABASE_DB_URL`, kept out of the repository. Migrations
     and the seed only.
4. `npm run db:reset` — applies all eleven migrations, then seeds content and the demo account.
5. In **Authentication → Providers**, enable email, and one social provider.
6. Set `NEXT_PUBLIC_APP_MODE=live` and start the app.

Until then `NEXT_PUBLIC_APP_MODE=demo` runs the whole product, onboarding included, with no
credentials at all.

### Also waiting on the product owner

The safety rules need a clinical reviewer before real users meet them (§7). The rules are
written, conservative and tested; what is missing is a professional saying so. This is not
blocking stage 6, but it blocks launch.

### Then: stage 6 — the daily system

Onboarding now produces a real week, so the modules finally have a user who has said what a
real day looks like for them.

1. Checking items off, committing to the day, and the evening review — the `/today` screen
   currently reads but does not write.
2. Repositories for `habits`, `habit_schedules` and `tasks`, held to the same contract suite,
   so the draft's habits become recurring schedules rather than one week of items.
3. Attaching a focus session to a task and keeping its history. The timer and the idempotent
   write already exist; nothing is recorded yet.
4. The sign-in screen, once the Supabase project exists.
5. Week two: the first adaptation, which is the first time completion history has anywhere to
   go.

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
- **Read the dev-server log even when the suite is green.** The `revalidatePath`-during-render
  bug (D38) passed all fifty end-to-end tests and only appeared in Next's output.
- **Look at the screenshots, do not just take them.** Three defects in this stage — duplicated
  copy on two steps, a duplicated duration on every timed item, and a translucent save bar over
  dense content — were invisible to every test and obvious in a picture.
