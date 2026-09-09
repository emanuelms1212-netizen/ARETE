# ACCEPTANCE.md

A living checklist. **An item is ticked only after it has been verified**, and the
verification is named. "It should work" is not a tick.

Legend: `[x]` verified · `[ ]` not done · `[~]` partially done, with the gap stated

---

## Stage 0 — Project contract and repository audit

- [x] Seven source PDFs read end to end — 143 pages, extracted with `pdftotext -layout`
- [x] `docs/SOURCE_MAP.md` exists, with programs, schedules, conflicts, safety issues and
      publication rights per source
- [x] The 60-versus-66-day inconsistency is explicitly recorded — `SOURCE_MAP.md` §1, and
      enforced by a test in `src/content/reset.test.ts`
- [x] `docs/PROJECT_LEDGER.md` exists and is current
- [x] `docs/ACCEPTANCE.md` exists (this file)
- [x] Repo health reported — `docs/REPO_HEALTH.md`
- [x] No feature code was written before the audit

## Stage 1 — Product specification

- [x] `docs/PRODUCT_SPEC.md` written with decisions, not options
- [x] Primary user, north star and exactly five supporting metrics
- [x] The four loops mapped to screens and to the data each writes
- [x] Five primary destinations; settings behind the avatar
- [x] Fourteen journeys specified in enough detail to implement without guessing
- [x] Entity relationships defined, with the rules that govern them
- [x] Screen-state contracts for every screen — loading, empty, error, success
- [x] Notification strategy, with explicit "never sent" list
- [x] MVP scope, non-MVP scope and permanent non-goals separated
- [x] Analytics events listed, with a rule forbidding free text
- [x] Privacy boundaries, accessibility targets and offline behaviour stated
- [x] Fixed source routines converted into editable templates — no hardcoded 06:00 wake,
      4 L hydration, two-hour workout, cold exposure or diet ideology
- [x] Every MVP feature maps to a journey and to a data entity

## Stage 2 — Technical foundation and verification loop

### Scaffold and structure

- [x] Mobile-first PWA scaffolded — Next.js 16 App Router, React 19, TypeScript, Tailwind v4
- [x] Strict TypeScript, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- [x] Layered structure — `app`, `components`, `domain`, `persistence`, `content`,
      `analytics`, `integrations`, `lib`
- [x] Package manager chosen and documented — npm, with a committed lockfile
- [x] Dependency versions verified against the npm registry, not from memory

### Environment

- [x] `.env.example` complete, placeholders only, every variable explained
- [x] Environment validated with Zod at module load, failing with a readable message
- [x] `live` mode refuses to start until the persistence adapter exists — 6 unit tests
- [x] No secrets, keys or production identifiers committed — verified by inspection

### Quality gates

- [x] `npm run format:check` — Prettier, passes
- [x] `npm run lint` — ESLint flat config, passes clean
- [x] `npm run typecheck` — `tsc --noEmit`, passes
- [x] `npm test` — 37 unit and component tests, all passing
- [x] Component tests supported and used — Testing Library on jsdom
- [x] `npm run e2e` — Playwright smoke tests at phone and desktop widths
- [x] Coverage available — `npm run test:coverage`, V8 provider
- [x] CI runs install, format, lint, typecheck, test, build and E2E
- [x] `npm run verify` runs the CI-equivalent set locally

### Runtime behaviour

- [x] Deterministic demo mode — the full shell reviewable with no credentials
- [x] Demo data is labelled in the UI and never passed off as the user's own
- [x] Global error boundary, per-segment error boundary, and `not-found`
- [x] Loading skeleton convention, used rather than ad-hoc spinners
- [x] `/api/health` returns build, version and mode, and leaks nothing
- [x] Read path goes through the repository interface — no component touches storage

### PWA

- [x] `manifest.webmanifest` with name, scope, start URL, display and categories
- [x] Icons at 192, 512, maskable 512 and Apple touch — generated placeholders
- [x] Safe-area insets honoured — `pt-safe`, `pb-safe`, `px-safe`, `viewport-fit=cover`
- [x] Install metadata — `appleWebApp`, theme colour per colour scheme
- [x] Offline strategy documented honestly — `docs/OFFLINE_STRATEGY.md`
- [x] The app states when it is offline and pauses writes rather than losing them
- [~] No service worker yet — the offline _shell_ is documented and the UI is honest about
  the limits, but caching lands with the design system in stage 3. **Nothing claims
  offline support that does not exist**

### Accessibility (foundation level)

- [x] Semantic landmarks — `header`, `nav`, `main`, skip link
- [x] Primary nav labelled; current page marked with `aria-current`, not colour alone
- [x] Visible focus ring, never removed
- [x] Touch targets ≥ 44 px on every interactive element
- [x] `prefers-reduced-motion` honoured globally
- [x] Error state announced via `role="alert"`; empty state is not
- [x] Offline banner is a polite live region
- [ ] Contrast formally measured against 4.5:1 — **stage 3**
- [ ] Full keyboard and screen-reader pass — **stage 13**

### Product rules encoded as tests

- [x] Non-shaming copy — `describeDay` is asserted never to contain "fail", "broke",
      "lost", "streak" or an exclamation mark, across every reachable branch
- [x] Skipped commitments leave the completion denominator
- [x] A day with nothing on it reads as quiet, not failed
- [x] The reset pack has 66 days, keeps its source title, and offers a labelled 60-day variant
- [x] Cold exposure is opt-in in the content pack
- [x] No analytics event can carry a free-text field — asserted over every event schema
- [x] Settings is not in the tab bar

### Verified by looking

- [x] `/today` at phone width (390 px) — screenshot inspected
- [x] `/today` at desktop width (1280 px) — screenshot inspected
- [x] A placeholder module screen at phone width — screenshot inspected
- [x] No horizontal overflow at phone width — asserted in the E2E suite

## Stage 3 — Design system and shell — not started

- [ ] Type, spacing, elevation and motion scales documented
- [ ] Both palettes verified at 4.5:1, measured not assumed
- [ ] Full primitive set with every state, each component-tested
- [ ] `/styleguide` route, excluded from production
- [ ] Designed icon replacing the placeholder mark
- [ ] Screenshots at both widths, both themes, and at 200% zoom

## Stages 4–17 — not started

Tracked in `docs/PROJECT_LEDGER.md` §8. No item below stage 3 may be ticked before the
stage that builds it has run and been verified.
