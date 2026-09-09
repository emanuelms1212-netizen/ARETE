# PROJECT_LEDGER.md

The running record of what ARETE is, what has been decided, and what happens next.
Updated at the end of every stage.

**Last updated:** 2026-09-09
**Stage:** 2 of 17 — technical foundation and verification loop
**Branch:** `build/prompt-pack-v1`
**Repository:** `emanuelms1212-netizen/ARETE`

---

## 0. Recovery note — read this first

An earlier pass at stages 0–2 ran in a Codex session. **None of it was committed or
pushed.** The GitHub repository still contained only `README.md` and `.gitignore`, and the
remote branch `build/prompt-pack-v1` pointed at the same empty commit as `main`. That work
is not recoverable.

What exists in this repository was rebuilt on 2026-09-09 directly from the seven source
PDFs and the prompt pack, and — unlike the previous attempt — **is committed.** The
practical lesson is recorded as a working rule below: _commit at the end of every stage,
before reporting it complete._

## 1. Current architecture

**Shape:** mobile-first PWA, Next.js App Router, deployed as a single web app. Native
wrappers are a post-MVP question, not a stage-2 one.

| Concern                | Choice                                                                         | Version |
| ---------------------- | ------------------------------------------------------------------------------ | ------- |
| Framework              | Next.js (App Router, React Server Components)                                  | 16.3.4  |
| UI runtime             | React                                                                          | 19.2.8  |
| Language               | TypeScript, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | 6.0.3   |
| Styling                | Tailwind CSS v4 (CSS-first `@theme`), no config file                           | 4.3.3   |
| Validation             | Zod                                                                            | 4.5.4   |
| Unit / component tests | Vitest + Testing Library + jsdom                                               | 5.0.0   |
| End-to-end             | Playwright (phone + desktop projects)                                          | 1.63.0  |
| Lint                   | ESLint flat config + `eslint-config-next`                                      | 9.39.5  |
| Format                 | Prettier                                                                       | 3.9.6   |
| Package manager        | npm (no lockfile existed; npm was already on the machine)                      | 10.9.8  |
| Persistence            | Repository interface + deterministic in-memory demo adapter                    | —       |
| Database               | **Not yet.** Supabase/Postgres/Auth arrives in stage 4                         | —       |

### Layers

```
app  →  components  →  domain
                 ↘  persistence (interface)  →  demo adapter
                 ↘  content (validated data + provenance)
                 ↘  analytics (typed events → no-op sink)
                 ↘  integrations (empty by design)
```

`domain` imports nothing from React, Next or any database. `components` never import a
vendor SDK. Swapping the demo adapter for Supabase is a change inside `src/persistence`
and nowhere else — that is the property the whole layering exists to protect.

## 2. Decisions and why

| #   | Decision                                                              | Reason                                                                                                                                              | Reversible?                                             |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| D1  | Rebuild stages 0–2 rather than wait to recover the Codex work         | Nothing was pushed; the sandbox is gone                                                                                                             | n/a                                                     |
| D2  | npm, with a committed `package-lock.json`                             | Already installed; no lockfile to honour; CI needs a lock for `npm ci`                                                                              | Yes                                                     |
| D3  | **TypeScript 6.0.3, not 7.0.2**                                       | `typescript-eslint` (inside `eslint-config-next`) throws on TS 7.0 and does not support it yet. Linting matters more than being on the newest major | Yes — revisit when typescript-eslint ships TS 7 support |
| D4  | **ESLint 9.39.5, not 10.10.0**                                        | `eslint-plugin-react`, bundled inside `eslint-config-next`, calls `context.getFilename()`, removed in ESLint 10. Linting crashed outright           | Yes — revisit when the plugin updates                   |
| D5  | Demo mode is the default; `live` mode refuses to start                | The rule is no fake persistence. Failing loudly beats serving sample data as real                                                                   | No — the failure is deliberate                          |
| D6  | The demo repository is read-only                                      | A writable in-memory store would show saves that vanish on refresh — exactly the fake persistence the rules forbid                                  | No                                                      |
| D7  | Module screens show an honest placeholder, not disabled controls      | A greyed-out button still implies a feature exists                                                                                                  | No                                                      |
| D8  | No `@vitejs/plugin-react`                                             | It needs Vite 8 plus three further peers; oxc transforms JSX natively. `oxc.jsx.runtime: 'automatic'` in the Vitest config is all that was needed   | Yes                                                     |
| D9  | `typedRoutes` off                                                     | It generates types during `next build`, which would make `tsc --noEmit` depend on build artefacts and couple two gates that should be independent   | Yes                                                     |
| D10 | Offline shell only, stated plainly in the UI                          | Offline sync needs a conflict-resolution design; claiming it without one is the "silent failure" case                                               | No                                                      |
| D11 | The 66-day content pack ships as **66 days**, labelled                | The source PDF's title says 60 and its content says 66. Silently truncating or silently relabelling both mislead                                    | No                                                      |
| D12 | Analytics ships a no-op sink and a test that forbids free-text fields | Journal and review text is the most sensitive data here; a convention would erode, a test will not                                                  | No                                                      |

## 3. Data model

Stage 2 defines only the slice the shell uses. The full model is stage 4's job.

```
Day (keyed by local date)
 └── Commitment  { id, kind, title, isMinimum, status, skipReason?, goalId? }
     kind:   habit | task | focus | workout | mobility | mind | food | review
     status: pending | done | skipped
DayMark: normal | travel | not-today
```

`computeDayProgress` is the only logic that reads it, and it encodes two product rules:
skipped items leave the denominator, and a day with nothing on it is _quiet_, not failed.

**Migrations:** none. There is no database yet. The first migration lands in stage 4.

## 4. Routes

| Route          | Kind          | State                                              |
| -------------- | ------------- | -------------------------------------------------- |
| `/`            | redirect      | → `/today`                                         |
| `/today`       | server        | Live — demo day via the repository                 |
| `/plan`        | server        | Placeholder (stage 6)                              |
| `/train`       | server        | Placeholder (stages 8–10)                          |
| `/mind`        | server        | Placeholder (stage 7)                              |
| `/progress`    | server        | Placeholder (stage 12)                             |
| `/settings`    | server        | Live — build info, planned sections listed as text |
| `/api/health`  | route handler | `{ status, name, version, mode, stage, time }`     |
| `not-found`    | —             | Global 404                                         |
| `global-error` | —             | Root boundary, renders its own document            |

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

## 6. Known limitations

1. **No authentication and no database.** Demo mode only, by design, until stage 4.
2. **Four of six destinations are placeholders.** Labelled as such in the UI.
3. **No writes anywhere.** Nothing the user does is persisted yet, because nothing can be.
4. **Offline shell only** — no write queue, no sync, no conflict resolution.
5. **Icons are placeholders.** A generated ring mark, not a designed identity.
6. **No design system yet.** Tokens and five primitives; the real system is stage 3.
7. **`Total Flexibility` rights are unresolved** — see the open risk below.
8. TypeScript and ESLint are one major version behind their latest releases (D3, D4).

## 7. Open risks

| Risk                                                     | Severity | Owner                          | Note                                                                                                                                                                                             |
| -------------------------------------------------------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rights to ship the `Total Flexibility` program structure | **High** | Product owner                  | Third-party commercial ebook. Either obtain written permission from David Thurin, or have ARETE derive its own progression. Descriptions and images are already excluded. See `SOURCE_MAP.md` §7 |
| Contrast-therapy safety                                  | **High** | Product + a qualified reviewer | 70–82 °C sauna and 13 °C immersion with no screening in the source. Ships opt-in, gated, with conservative defaults below the source numbers                                                     |
| Seed-oil content is contested and copyrighted            | Medium   | Product owner                  | Third-party article. At most one labelled, optional viewpoint note; never in-app doctrine                                                                                                        |
| Exercise animations do not exist                         | Medium   | Design                         | Must be ARETE-drawn vectors, not traced from source images                                                                                                                                       |
| No infrastructure chosen                                 | Medium   | Engineering                    | Supabase project, hosting and CI secrets are all stage 4                                                                                                                                         |
| Unattributed quotes in a source PDF                      | Low      | Content                        | Drop them or label as unattributed. Never invent an author                                                                                                                                       |

## 8. Exact next step

**Stage 3 — Stoic design system and application shell.**

Concretely, and in this order:

1. Promote the ad-hoc tokens in `src/app/globals.css` into a documented design system:
   type scale, spacing scale, elevation rules, motion rules, and both palettes verified
   against 4.5:1 contrast rather than assumed to pass.
2. Build the primitive set properly — button variants, input, select, checkbox, radio,
   switch, sheet, dialog, list row, tab bar, toast — each with focus, disabled, loading and
   error states, and each with a component test.
3. Add a `/styleguide` route, excluded from production builds, rendering every primitive in
   every state at both themes.
4. Replace the placeholder icons with a real mark.
5. Add `prefers-reduced-motion` alternatives to any motion introduced.
6. Verify contrast and 200% zoom with screenshots at phone and desktop widths, and record
   what was checked.

**Do not start stage 4 before stage 3.** The data model is easier to get right against a
shell that already looks like the product.

## 9. Working rules learned the hard way

- **Commit at the end of every stage, before reporting it complete.** Uncommitted work in
  an agent sandbox is work that does not exist.
- Pin exact versions and verify them against the registry, never from memory.
- When a version choice breaks a gate, downgrade the dependency and record why (D3, D4) —
  do not disable the gate.
