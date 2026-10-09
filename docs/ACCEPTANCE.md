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
- [x] Notification strategy, with an explicit "never sent" list
- [x] MVP scope, non-MVP scope and permanent non-goals separated
- [x] Analytics events listed, with a rule forbidding free text
- [x] Privacy boundaries, accessibility targets and offline behaviour stated
- [x] Fixed source routines converted into editable templates — no hardcoded 06:00 wake,
      4 L hydration, two-hour workout, cold exposure or diet ideology
- [x] Every MVP feature maps to a journey and to a data entity

## Stage 2 — Technical foundation and verification loop

### Scaffold and structure

- [x] Mobile-first PWA — Next.js 16 App Router, React 19, TypeScript, Tailwind v4
- [x] Strict TypeScript, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- [x] Layered structure — `app`, `components`, `design`, `domain`, `persistence`,
      `content`, `analytics`, `integrations`, `lib`
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
- [x] `npm test` — **148** unit and component tests, all passing
- [x] `npm run e2e` — **36** end-to-end tests at phone and desktop widths
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
- [x] Icons at 192, 512, maskable 512 and Apple touch — now the real ARETE mark
- [x] Safe-area insets honoured — `pt-safe`, `pb-safe`, `px-safe`, `viewport-fit=cover`
- [x] Install metadata — `appleWebApp`, theme colour per colour scheme
- [x] Offline strategy documented honestly — `docs/OFFLINE_STRATEGY.md`
- [x] The app states when it is offline and pauses writes rather than losing them
- [~] No service worker yet — the offline _shell_ is documented and the UI is honest about
  the limits. Deferred again from stage 3: precaching an asset set that is still
  changing would mean writing the cache strategy twice. **Nothing claims offline
  support that does not exist**

### Product rules encoded as tests

- [x] Non-shaming copy — `describeDay` is asserted never to contain "fail", "broke",
      "lost", "streak" or an exclamation mark, across every reachable branch
- [x] Skipped commitments leave the completion denominator
- [x] A day with nothing on it reads as quiet, not failed
- [x] The reset pack has 66 days, keeps its source title, and offers a labelled 60-day variant
- [x] Cold exposure is opt-in in the content pack
- [x] No analytics event can carry a free-text field — asserted over every event schema
- [x] Settings is not in the tab bar

## Stage 3 — Stoic design system and application shell

### Tokens

- [x] Colour, type, spacing, radius, shadow and motion scales defined in
      `src/design/tokens.ts`
- [x] Light and dark palettes, both first-class — dark is its own palette, not an inversion
- [x] `globals.css` mirrors the token source exactly — asserted by 28 tests that parse the
      stylesheet, so the two cannot drift
- [x] Spacing is Tailwind's 4px scale, unchanged and documented as such

### Contrast — measured, not assumed

- [x] WCAG 2.2 relative-luminance and contrast maths implemented in `src/design/contrast.ts`
- [x] 24 colour pairs × 2 themes asserted against AA thresholds — **48 passing assertions**
- [x] Ordinary text meets 4.5:1 everywhere it is used. Worst case `accent` on `accentSoft`,
      **4.97:1** (light)
- [x] Control boundaries and focus indicators meet 3:1. Worst case `lineStrong` on `sunken`,
      **3.14:1** (light)
- [x] A test proves no palette colour escaped the verified set, with `line` the one
      documented exemption (decorative, carries no meaning)
- [x] The same numbers are rendered live on `/styleguide`, computed not transcribed

### Typography

- [x] Editorial display face (Fraunces Variable) paired with a readable UI sans (Inter
      Variable) — no faux-Roman novelty face
- [x] Self-hosted, shipped with the app, no third-party request at runtime
- [x] Latin subset only is downloaded, via `unicode-range`
- [x] Seven-step scale, each step asserted present in the stylesheet

### Shell

- [x] Bottom navigation on phones, left rail from `md` up — one IA, not two products
- [x] Current destination marked by `aria-current`, a filled chip and a heavier label, never
      colour alone
- [x] Avatar/settings entry in the header, not a sixth tab
- [x] Command/search launcher, opening on ⌘K / Ctrl+K and from the header
- [x] The launcher offers only routes that exist — 5 unit tests
- [x] Global toast region — polite live region, auto-dismiss, max three
- [x] Confirmation dialog whose confirm button names the action, never "OK"

### Components

- [x] Page header, section, metric, card, list row, empty state, error state, timer,
      form field, segmented control, bottom sheet/dialog, safety notice — all built
- [x] Every one rendered in every state on `/styleguide`
- [x] Component tests for button, segmented control, form field, toast, dialog and
      confirmation, timer ring, list row, safety notice, bottom nav, command launcher
- [x] A list row is interactive only when given an `href` — asserted
- [x] Every control keeps a 44px hit area at every size — asserted for the button

### Today and motion

- [x] Complete Today visual prototype on demo data
- [x] Focus timer works, driven by wall-clock time, and says plainly that nothing is
      recorded yet
- [x] Breathing pacer works on `/mind` — four in, two held, six out — and says plainly that
      nothing is recorded yet
- [x] Interactions either work or are absent; no stub route is linked from a live control

### Accessibility

- [x] Semantic landmarks — `header`, `nav`, `main`, skip link
- [x] The first tab stop is a working skip link — asserted end-to-end
- [x] Visible focus ring defined and never removed — asserted end-to-end
- [x] Touch targets ≥ 44px
- [x] Segmented control uses real radios, so arrow keys work
- [x] Dialogs use native `<dialog>`: focus trap, Escape, page inertness
- [x] Error state announced via `role="alert"`; safety notice is a region, not an alert
- [x] `prefers-reduced-motion` honoured globally
- [x] The breathing ring rests still under reduced motion while the written cue keeps the
      pacing — asserted end-to-end
- [x] WCAG AA contrast for ordinary text — measured (above)
- [ ] Screen-reader pass with VoiceOver and NVDA — **stage 13**
- [ ] 200% text zoom verified by screenshot — **stage 13**

### Layout

- [x] No horizontal overflow at 320, 390, 768 and 1440px, across four routes — asserted
      end-to-end
- [x] The Today heading stays fully on screen at 320px — asserted
- [x] `/styleguide` 404s in a production build — asserted end-to-end

### Verified by looking

- [x] Today at 390×844, light and dark
- [x] Today at 1440×900, light and dark
- [x] Mind, with the breathing pacer, at 390×844
- [x] Plan placeholder at 390×844, dark
- [x] Settings at 1440×900
- [x] Full styleguide at 1440 wide and at 390 wide, dark

Two things were changed because of what the screenshots showed: the breathing ring read as
a filled disc rather than a ring, so it gained a static guide circle and a larger scale
travel; and the three Today metrics wrapped 2-then-1, so they became a three-column grid.

## Stage 4 — Data model, authentication and persistence — not started

- [ ] Supabase project created and connection shape recorded in `.env.example`
- [ ] Schema migration for every entity in `PRODUCT_SPEC.md` §6
- [ ] Row-level security on every table, from the first migration
- [ ] Supabase adapter behind `DayRepository`, interface widened to cover writes
- [ ] `live` mode genuinely supported; the stage-2 guard removed
- [ ] Auth: email plus one social provider, sessions, and deletion that deletes
- [ ] Deterministic seed matching the demo adapter
- [ ] Integration tests against a real database, including an RLS isolation test

## Stages 5–17 — not started

Tracked in `docs/PROJECT_LEDGER.md` §8. No item below stage 4 may be ticked before the
stage that builds it has run and been verified.
