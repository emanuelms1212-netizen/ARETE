# PROJECT_LEDGER.md

The running record of what ARETE is, what has been decided, and what happens next.
Updated at the end of every stage.

**Last updated:** 2026-10-09
**Stage:** 3 of 17 — Stoic design system and application shell
**Branch:** `build/prompt-pack-v1`
**Repository:** `emanuelms1212-netizen/ARETE`

---

## 0. Recovery note — read this first

An earlier pass at stages 0–2 ran in a Codex session. **None of it was committed or
pushed.** The GitHub repository still contained only `README.md` and `.gitignore`, and the
remote branch `build/prompt-pack-v1` pointed at the same empty commit as `main`. That work
is not recoverable.

What exists here was rebuilt on 2026-09-09 directly from the seven source PDFs and the
prompt pack, and — unlike the previous attempt — **is committed.** The practical lesson is
recorded as a working rule below: _commit at the end of every stage, before reporting it
complete._

## 1. Current architecture

**Shape:** mobile-first PWA, Next.js App Router, deployed as a single web app. Native
wrappers are a post-MVP question.

| Concern                | Choice                                                                         | Version |
| ---------------------- | ------------------------------------------------------------------------------ | ------- |
| Framework              | Next.js (App Router, React Server Components)                                  | 16.3.4  |
| UI runtime             | React                                                                          | 19.2.8  |
| Language               | TypeScript, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | 6.0.3   |
| Styling                | Tailwind CSS v4, CSS-first `@theme inline` over token custom properties        | 4.3.3   |
| Display face           | Fraunces Variable, self-hosted                                                 | 5.3.0   |
| UI face                | Inter Variable, self-hosted                                                    | 5.3.0   |
| Validation             | Zod                                                                            | 4.5.4   |
| Unit / component tests | Vitest + Testing Library + jsdom                                               | 5.0.0   |
| End-to-end             | Playwright (phone + desktop projects)                                          | 1.63.0  |
| Lint                   | ESLint flat config + `eslint-config-next`                                      | 9.39.5  |
| Format                 | Prettier                                                                       | 3.9.6   |
| Package manager        | npm                                                                            | 10.9.8  |
| Persistence            | Repository interface + deterministic in-memory demo adapter                    | —       |
| Database               | **Not yet.** Supabase/Postgres/Auth arrives in stage 4                         | —       |

### Layers

```
app  →  components  →  domain
   ↘  design (tokens + contrast maths)
                 ↘  persistence (interface)  →  demo adapter
                 ↘  content (validated data + provenance)
                 ↘  analytics (typed events → no-op sink)
                 ↘  integrations (empty by design)
```

`domain` imports nothing from React, Next or any database. `components` never import a
vendor SDK. `design` is pure data and arithmetic — it is imported by the token test, by the
styleguide, and by nothing that renders product UI, which is why the tokens can be asserted
without a browser.

Swapping the demo adapter for Supabase is a change inside `src/persistence` and nowhere
else. That is the property the whole layering exists to protect.

## 2. Decisions and why

| #       | Decision                                                                            | Reason                                                                                                                                                                                     | Reversible?                                             |
| ------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| D1      | Rebuild stages 0–2 rather than wait to recover the Codex work                       | Nothing was pushed; the sandbox is gone                                                                                                                                                    | n/a                                                     |
| D2      | npm, with a committed `package-lock.json`                                           | Already installed; CI needs a lock for `npm ci`                                                                                                                                            | Yes                                                     |
| D3      | **TypeScript 6.0.3, not 7.0.2**                                                     | `typescript-eslint` throws on TS 7.0 and does not support it yet. Linting matters more than being on the newest major                                                                      | Yes — revisit when typescript-eslint ships TS 7 support |
| D4      | **ESLint 9.39.5, not 10.10.0**                                                      | `eslint-plugin-react`, bundled inside `eslint-config-next`, calls `context.getFilename()`, removed in ESLint 10. Linting crashed outright                                                  | Yes — revisit when the plugin updates                   |
| D5      | Demo mode is the default; `live` mode refuses to start                              | The rule is no fake persistence. Failing loudly beats serving sample data as real                                                                                                          | No — the failure is deliberate                          |
| D6      | The demo repository is read-only                                                    | A writable in-memory store would show saves that vanish on refresh                                                                                                                         | No                                                      |
| D7      | Module screens show an honest placeholder, not disabled controls                    | A greyed-out button still implies a feature exists                                                                                                                                         | No                                                      |
| D8      | No `@vitejs/plugin-react`; `oxc.jsx.runtime: 'automatic'` in the Vitest config      | The plugin needs Vite 8 plus three further peers; oxc transforms JSX natively                                                                                                              | Yes                                                     |
| D9      | `typedRoutes` off                                                                   | It generates types during `next build`, coupling `tsc --noEmit` to build artefacts                                                                                                         | Yes                                                     |
| D10     | Offline shell only, stated plainly in the UI                                        | Offline sync needs a conflict-resolution design; claiming it without one is a silent failure                                                                                               | No                                                      |
| D11     | The 66-day content pack ships as **66 days**, labelled                              | The source PDF's title says 60 and its content says 66                                                                                                                                     | No                                                      |
| D12     | Analytics ships a no-op sink and a test forbidding free-text fields                 | Journal and review text is the most sensitive data here                                                                                                                                    | No                                                      |
| **D13** | **Tokens live in TypeScript; CSS mirrors them; a test parses the CSS and compares** | A design system documented in prose drifts from the stylesheet within weeks. This one cannot — 28 assertions compare the two                                                               | No                                                      |
| **D14** | **Contrast is computed, not claimed**                                               | 24 colour pairs × 2 themes are asserted against WCAG AA thresholds in the test suite. `line` is the single documented exemption, and a further test proves no other token escaped the list | No                                                      |
| **D15** | **Self-hosted Fraunces + Inter from `@fontsource-variable`, not `next/font`**       | A PWA should not need a third-party request to render its own text. It also keeps the build working offline and behind this machine's egress allowlist, which blocks Google Fonts outright | Yes                                                     |
| **D16** | **Native `<dialog>` for the sheet, the confirmation and the command launcher**      | Focus trap, Escape, page inertness and the backdrop come from the platform rather than from hand-written ARIA that drifts. A `showModal` fallback covers environments that lack it         | Yes                                                     |
| **D17** | **The segmented control is real radio inputs in a fieldset**                        | Arrow-key navigation, grouping and announcement come free and correct. A button-based version would re-implement all three, worse                                                          | Yes                                                     |
| **D18** | **Reduced motion stops the breathing ring at full size rather than at 0.01ms**      | Collapsing the animation would freeze the ring at an arbitrary scale. The written cue runs on its own timer, so the practice still paces correctly with no motion at all                   | No                                                      |
| **D19** | **`/styleguide` 404s in production rather than being stripped at build**            | A `notFound()` guard is one line and cannot be forgotten; a build-time exclusion is configuration that silently stops working                                                              | Yes                                                     |

## 3. Data model

Stage 3 added no data. The slice the shell uses is unchanged:

```
Day (keyed by local date)
 └── Commitment  { id, kind, title, isMinimum, status, skipReason?, goalId? }
     kind:   habit | task | focus | workout | mobility | mind | food | review
     status: pending | done | skipped
DayMark: normal | travel | not-today
```

**Migrations:** none. There is no database yet. The first migration lands in stage 4.

## 4. Routes

| Route          | Kind          | State                                                       |
| -------------- | ------------- | ----------------------------------------------------------- |
| `/`            | redirect      | → `/today`                                                  |
| `/today`       | server        | Live — demo day, full visual prototype, working focus timer |
| `/plan`        | server        | Placeholder (stage 6)                                       |
| `/train`       | server        | Placeholder (stages 8–10)                                   |
| `/mind`        | server        | Placeholder (stage 7) + working breathing pacer             |
| `/progress`    | server        | Placeholder (stage 12)                                      |
| `/settings`    | server        | Live — build info, planned sections listed as text          |
| `/styleguide`  | server        | **Development only.** 404s in production                    |
| `/api/health`  | route handler | `{ status, name, version, mode, stage, time }`              |
| `not-found`    | —             | Global 404                                                  |
| `global-error` | —             | Root boundary, renders its own document                     |

## 5. Test commands

| Gate             | Command                | Runs in CI                        |
| ---------------- | ---------------------- | --------------------------------- |
| Format           | `npm run format:check` | Yes                               |
| Lint             | `npm run lint`         | Yes                               |
| Types            | `npm run typecheck`    | Yes                               |
| Unit + component | `npm test`             | Yes                               |
| Build            | `npm run build`        | Yes                               |
| End-to-end       | `npm run e2e`          | Yes (after `npm run e2e:install`) |
| Everything       | `npm run verify`       | —                                 |

**148 unit and component tests. 36 end-to-end tests** across the phone and desktop projects.

## 6. Known limitations

1. **No authentication and no database.** Demo mode only, by design, until stage 4.
2. **Four of six destinations are placeholders.** Labelled as such in the UI. Two of them
   now carry something that genuinely works (the focus timer on Today, the breathing pacer
   on Mind), each labelled as recording nothing.
3. **No writes anywhere.** Nothing the user does is persisted yet, because nothing can be.
4. **Offline shell only** — no service worker yet, no write queue, no sync.
5. **No theme toggle.** The app follows `prefers-color-scheme`. A manual override is a
   settings feature and belongs with the rest of settings in stage 5.
6. **`Total Flexibility` rights are unresolved** — see the open risk below.
7. TypeScript and ESLint are each one major version behind their latest release (D3, D4).
8. **Playwright cannot run on this machine**: the Linux workspace has no browser and the
   network allowlist blocks `cdn.playwright.dev`. The suite runs in CI and was run for this
   stage in a separate environment with Chromium present.

## 7. Open risks

| Risk                                                     | Severity | Owner                          | Note                                                                                                                                               |
| -------------------------------------------------------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rights to ship the `Total Flexibility` program structure | **High** | Product owner                  | Third-party commercial ebook. Either obtain written permission from David Thurin, or have ARETE derive its own progression. See `SOURCE_MAP.md` §7 |
| Contrast-therapy safety                                  | **High** | Product + a qualified reviewer | 70–82 °C sauna and 13 °C immersion with no screening in the source. Ships opt-in, gated, conservative. `SafetyNotice` is the surface it must use   |
| Seed-oil content is contested and copyrighted            | Medium   | Product owner                  | At most one labelled, optional viewpoint note; never in-app doctrine                                                                               |
| Exercise animations do not exist                         | Medium   | Design                         | Must be ARETE-drawn vectors, not traced from source images. The icon set establishes the drawing style they should follow                          |
| No infrastructure chosen                                 | Medium   | Engineering                    | Supabase project, hosting and CI secrets are all stage 4                                                                                           |
| Screen-reader testing has not been done                  | Medium   | Engineering                    | Semantics and keyboard paths are tested; actual VoiceOver/NVDA passes are stage 13                                                                 |
| Unattributed quotes in a source PDF                      | Low      | Content                        | Drop them or label as unattributed. Never invent an author                                                                                         |

## 8. Exact next step

**Stage 4 — Data model, authentication, and reliable persistence.**

Concretely, and in this order:

1. Create the Supabase project and record the connection shape in `.env.example`. Keys go
   in the environment, never the repository.
2. Write the schema for the entities in `PRODUCT_SPEC.md` §6 — `Goal`, `Milestone`,
   `Project`, `Task`, `Habit`, `Day`, `Commitment`, the session tables, `FoodEntry`,
   `BodyLog`, `DayReview`, `WeekReview` — as a migration, with row-level security scoped to
   the user on every table from the first migration rather than added later.
3. Implement the Supabase adapter behind the existing `DayRepository` interface, and widen
   that interface to cover writes. Demo mode stays, as the way to review the UX without
   credentials.
4. Turn on `NEXT_PUBLIC_APP_MODE=live`: delete the guard in `src/lib/env.ts` that currently
   refuses it, and replace it with real validation of the Supabase variables.
5. Auth: email plus one social provider, session handling, and account deletion that
   actually deletes.
6. A seed script that produces the same deterministic data the demo adapter serves, so the
   two modes show the same thing.
7. Integration tests against a real database, and an RLS test that proves one user cannot
   read another's rows.

**Do not begin feature modules (stage 6 onward) before stage 4 and 5 are done.** Every
module writes data; building them against a repository that cannot write would mean
building each one twice.

## 9. Working rules learned the hard way

- **Commit at the end of every stage, before reporting it complete.** Uncommitted work in
  an agent sandbox is work that does not exist.
- Pin exact versions and verify them against the registry, never from memory.
- When a version choice breaks a gate, downgrade the dependency and record why (D3, D4) —
  do not disable the gate.
- When a claim can be computed, compute it in a test (D13, D14). Design documentation that
  only asserts is documentation that will eventually lie.
