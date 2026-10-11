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

## Stage 4 — Data model, authentication and reliable persistence

### Schema and migrations

- [x] Ten migrations apply **from zero** to a real Postgres — asserted, not assumed
- [x] All 36 tables the brief lists are present, plus `daily_plan_items` — asserted by name
- [x] Timezone-safe dates: `local_date` plus the `timezone` it was recorded in, everywhere
- [x] Recurring schedules modelled as rules with effective ranges, so past days expand with
      the rule that applied then
- [x] Soft deletion where history matters (`archived_at` on goals, projects, tasks, habits,
      programmes, foods); append-only where the row _is_ the history
- [x] Idempotent writes: `client_token` with `unique (user_id, client_token)` on every
      session and log table
- [x] Units: metric in storage, `preferences.unit_system` for display only
- [x] Provenance on imported content — `content_sources`, `content_packs`, and rights columns
      on `flexibility_programs`
- [x] Template, instance and log are separate tables throughout
- [x] No derived aggregate is stored; progress is computed

### Authorization — tried, not claimed

- [x] Row-level security **enabled and forced** on every table — a test lists any that are not
- [x] Every table has at least one policy — a test lists any that do not
- [x] A user sees exactly their own rows in every owned table
- [x] Another user's journal entry is invisible even when asked for by id
- [x] Inserting a row owned by someone else is rejected
- [x] Updating or deleting another user's rows affects zero rows
- [x] Moving one's own row to another owner is rejected
- [x] An unauthenticated session sees nothing at all
- [x] Library content is readable by any signed-in user and writable by none
- [x] The production SQL passes its contract **through** the policies, so a policy that is
      too strict fails as loudly as one that is too loose

### Product rules in the schema

- [x] An analytics payload with a free-text-looking key is rejected by a check constraint
- [x] A quote may not carry an author unless its attribution is verified
- [x] A skipped item must have a reason
- [x] A workout movement is counted in reps or in time, never both
- [x] Cognitive sessions hold practice counts only — no column is a cognitive score
- [x] The flexibility programme ships `rights_status = 'pending'` and cannot be served

### Typed access and repositories

- [x] One repository contract, two implementations, **one shared test suite** — 13 tests each
- [x] Reads and writes both go through the contract
- [x] Demo mode is writable in memory and the UI says changes last until the server restarts
- [x] Editing a day keeps the status of the items that survive the edit
- [x] A focus session recorded three times is one row — asserted for both adapters

### Domain

- [x] Local-day arithmetic across the date line and both daylight-saving boundaries —
      23-hour and 25-hour days asserted
- [x] A wall-clock time inside the spring-forward gap resolves forward
- [x] Recurrence: daily, weekly-by-weekday and monthly-by-day, anchored to the start date,
      honouring the user's week start, skipping months that lack the day
- [x] Recurrence rendered back in plain English
- [x] Unit conversions round-trip without drift, including the source material's own numbers
- [x] Idempotency keys are stable for the same write and distinct for different ones

### Authentication

- [x] Auth behind an interface; the app asks "who is this?", never "what did Supabase say?"
- [x] Demo identity for demo mode; Supabase session for live mode
- [x] Demo sign-in **refuses with an explanation** rather than silently doing nothing
- [x] Supabase is used for authentication only — data access is plain SQL
- [ ] Sign-in screen — **stage 5**, with onboarding
- [ ] Social provider enabled — needs the Supabase project

### Export and deletion

- [x] `export_my_data()` returns the whole account as JSON, immediately, as the caller
- [x] `delete_my_account()` removes the account and everything attached, irreversibly
- [x] Deletion cannot be aimed at another account — the subject comes from the session
- [x] `user_owned_tables()` names what export covers, so a forgotten table is a visible bug

### Seed

- [x] Deterministic: no random values, no current time
- [x] Idempotent: running it twice changes nothing — asserted
- [x] Every source document from the source map, with its licence
- [x] Packs that may never be enabled by default are flagged as such
- [x] A seeded database shows the same demo day the in-memory repository serves — asserted
- [x] `npm run db:migrate` · `db:seed` · `db:reset`, service-role connection, never on the
      request path

### Environment

- [x] Live mode is genuinely supported; the stage-2 guard is gone
- [x] Live mode names every missing variable rather than failing vaguely
- [x] A service-role `DATABASE_URL` is rejected at boot, because it would bypass every policy
- [x] `.env.example` explains which values are public and which are deployment-only

### Verification

- [x] `npm test` — **242** unit, component and database tests
- [x] `npm run e2e` — **36** end-to-end tests at phone and desktop widths
- [x] Format, lint, typecheck and build all clean
- [x] `/today` is dynamic, so no account's data is baked into a build

### Not done, and why

- [ ] **Migrations applied to a hosted database** — no Supabase project exists yet.
      This is the one item blocked on the product owner; `PROJECT_LEDGER.md` §8 is the
      twenty-minute checklist.
- [ ] Repositories for the other ~30 tables — deliberately deferred to the stages that build
      their screens. An interface written before its screen is an interface written twice.
- [ ] Migration ledger table — needed before the first production deploy.

## Stage 5 — Onboarding and the adaptive plan engine

### The questions

- [x] Nine steps, eight of which ask something — `ONBOARDING_STEPS`
- [x] Every step says **why it is being asked**, in its own words — `STEP_RATIONALE`, asserted
      end to end on the health step
- [x] Every step is skippable, and skipping is as reachable as continuing
- [x] Onboarding can be left entirely at any point — "Do this later" in the header, asserted
      end to end
- [x] The flow is resumable: leaving and returning lands on the step the user left
- [x] A skipped step produces a **conservative answer**, not a missing one — Zod `.prefault({})`,
      asserted for every step by the `skipped` persona
- [x] Answers can be changed after the fact; the later week reflects the change
- [x] Invalid answers are rejected by the same schema the generator reads
- [x] Visible position in the flow — `role="progressbar"` with an accessible name
- [x] The minimum-viable-day question is asked last, and asked plainly

### Safety — rules that only tighten

- [x] Seven gated modules: cold exposure, contrast therapy, sauna, loaded mobility, high
      intensity, calorie targets, fasting
- [x] Decisions are ranked and may only tighten — the strictest rule wins, asserted
- [x] Pregnancy or postpartum blocks heat, cold and fasting; reroutes loading and intensity
- [x] A heart condition or a history of fainting blocks immersion and sauna
- [x] Heat and cold intolerance are separate answers — one never implies the other
- [x] Severe injury blocks loaded mobility; moderate injury reroutes to easier versions
- [x] Awaiting medical clearance keeps week one light
- [x] A user under 18 without guardian confirmation gets **no calorie targets and no fasting**
- [x] The age rule is enforced **in the database too** — a trigger rejects the row
- [x] "Prefer not to say" raises a safety notice and is **deliberately not blocked** — D31
- [x] Every gated decision carries a reason the user can read

### The generated week

- [x] `generateFirstWeek` is pure: no clock, no database, no randomness — same answers, same week
- [x] Never more than **four training days** in week one, whatever the answers say
- [x] Never more than **three habits**
- [x] At least one quiet day, labelled as part of the plan rather than a gap
- [x] Training days are spread, not back to back
- [x] Every day has a **minimum version**, and the smallest eligible item is chosen — a
      thirty-minute workout is never the sole minimum when a five-minute sit exists
- [x] **Every item carries a reason**, and a test fails any reason under fifteen characters
      or containing `undefined`
- [x] No generated title names its own duration — `minutes` is rendered beside it
- [x] Nine personas produce **pairwise distinct** weeks — asserted, so the engine is not
      quietly ignoring its inputs
- [x] Contrast therapy is scheduled only if chosen, and only where safety allows

### Nothing is written until the user agrees

- [x] The generated week is a `plan_drafts` row, not a plan
- [x] Reaching review and leaving writes **no days** — asserted in the contract suite
- [x] Accepting turns the draft into seven real days with their items
- [x] The **edited** draft is stored before acceptance, beside the generated one
- [x] A draft belonging to another user is refused
- [x] Every item on the review screen can be removed, restored, or promoted to the minimum
- [x] "Why is this here?" is available per item, and closed by default

### Persistence and authorization

- [x] Migration `0011_onboarding.sql` — six new tables, applying from zero
- [x] Row-level security enabled **and forced** on all six, with policies
- [x] `user_owned_tables()` rewritten, so export and deletion reach the new tables
- [x] Onboarding implemented by **both** repository adapters, against the one contract suite
- [x] Raw answers are kept _and_ projected into the typed profile tables
- [x] Server actions re-read the user from the session; none takes a user id from the client
- [x] `/today` resolves the user's real local date, and offers the first week until
      onboarding completes

### Verification

- [x] `npm test` — **374** unit, component and database tests (112 of them the plan engine)
- [x] `npm run e2e` — **50** end-to-end tests, at phone and desktop widths, against a
      production build
- [x] Format, lint, typecheck and build all clean
- [x] Screenshots captured **and inspected** at 390×844 and 1440×900 for all nine screens
- [x] The dev-server log was read during a green E2E run — which is how the
      `revalidatePath`-during-render bug was found (D38)
- [x] A flaky launcher test was fixed rather than retried away

### Fixed because a screenshot showed it

- [x] The health and minimum steps each said the same thing twice — rationale rewritten
- [x] Every timed item read its duration twice ("Mobility · 10 min 10 min") — durations
      removed from titles, with a test to keep them out
- [x] The review screen's save bar was translucent over dense content — now opaque
- [x] The review screen ignored desktop width — now two columns, with the actions on one row
- [x] `Switch` used a native checkbox and inherited the browser's blue — now drawn to match
      the radios beside it

### Not done, and why

- [ ] **Migrations applied to a hosted database** — still no Supabase project.
      `PROJECT_LEDGER.md` §8. It did not block this stage.
- [ ] **The sign-in screen** — there is nothing to sign in to until the project exists.
- [ ] **Clinical review of the safety rules** — the rules are written, conservative and
      tested, by an engineer. A professional has not signed them off. Blocks launch, not
      stage 6.
- [ ] **Week two onward** — adaptation needs completion history, which nothing records yet.
- [ ] **Programme selection** — the packs are offered in the mind step; starting one with
      editable parameters is still ahead.
- [ ] Repositories for `habits`, `habit_schedules` and `tasks` — stage 6, with their screens.

## Stage 6 — Today, habits, goals, tasks and the Pomodoro

### The day, start to finish

- [x] A morning intention, in one sentence
- [x] The dichotomy of control as two boxes and a plain question — no lecture, no quote
- [x] Both are optional; a screen that cannot be left unanswered gets lied to
- [x] Today's commitments with complete, skip-with-reason, move-to-tomorrow and reorder
- [x] Quick add, straight onto the day
- [x] Every one of those is **optimistic, with a real revert** — the server's refusal restores
      the previous state and says what was refused
- [x] A skip asks why, because that is what makes it a decision rather than a failure
- [x] A moved item stays visible, marked, so "I moved this" reads differently from "it vanished"
- [x] The evening review: three prompts, in the order a tired person can answer them
- [x] `met_minimum` is recorded, not recomputed, so editing the plan later cannot change it

### Minimum mode

- [x] A switch, not a verdict
- [x] Turning it on touches **no item's status** — asserted in the contract suite and again
      end to end
- [x] The copy says a minimum day is what a real one looks like sometimes

### Habits — four kinds

- [x] Binary, count, duration and **limit**
- [x] A limit inverts: the target is a ceiling, under it is the win
- [x] A bigger number is never a better day for a limit habit — asserted
- [x] Partial completion, with the value that made it partial
- [x] Rest days are their own state, not a skip
- [x] A skip needs a reason; the database refuses one without
- [x] Meeting the user's own minimum continues the streak
- [x] Rest, unscheduled and not-yet-finished days are stepped over, never counted against
- [x] The longest run survives a miss, because what happened still happened
- [x] **The status text is never a scolding** — a test asserts it across every history shape
- [x] Rolling consistency is the number shown; the streak is secondary
- [x] A habit's history starts at its first activity, so days before it existed are not misses

### Goals — measured or judged, never faked

- [x] Motivation, a measurable success statement, target and maintenance dates, milestones
- [x] A measured goal gets a progress bar from readings
- [x] **A judged goal gets none** — the return type has no ratio, so the UI cannot render one
- [x] Completed milestones are never converted into a percentage — asserted end to end
- [x] Descending goals (weight, a time) read as progress, not as loss
- [x] One reading per day; a correction replaces rather than stacks
- [x] A weekly review that changes the goal — pause, drop, done, or continue
- [x] Archiving keeps the readings and reviews attached to it

### Tasks

- [x] Inbox, Today, Upcoming and Someday
- [x] A task with no date is captured, not forgotten
- [x] An overdue task appears in Today rather than disappearing into the past
- [x] Subtasks, one level deep, enforced by a trigger and refused by both adapters
- [x] A recurring task advances the series rather than ending it
- [x] The series stays anchored when a task is finished late
- [x] Energy, context and estimate are shown, because they decide what is doable at 9pm
- [x] Archiving a parent archives its children — no orphans

### The Pomodoro

- [x] Adjustable presets, and a task link
- [x] **Elapsed time is derived, never stored as a countdown**
- [x] A refresh restores the running session with its time intact — the stage's own criterion
- [x] Paused time is not counted as focus
- [x] A pause is recorded as an interruption rather than hidden
- [x] One running session per user, enforced by a partial unique index
- [x] A retried start returns the same session; a **new** start after finishing does not get
      handed the finished one (D50)
- [x] The timer does not stop you mid-sentence — it counts past the planned time and says so
- [x] Completion is announced through a live region, not a sound alone
- [x] A one-line reflection, optional

### Migrations, now applied once

- [x] `public.schema_migrations` records every applied file with a checksum
- [x] A second `db:migrate` applies nothing — asserted through the production runner
- [x] An applied migration that has since been edited fails loudly, by name
- [x] The ledger table is unreachable from the request path, and still has a policy

### Verification

- [x] `npm test` — **564** unit, component and database tests
- [x] `npm run e2e` — **88** end-to-end tests at phone and desktop widths, against a
      production build, including the stage's full acceptance journey in one test
- [x] Format, lint, typecheck and build all clean
- [x] Screenshots captured **and inspected** at 390×844 and 1440×900
- [x] The suite run twice end to end with no flakes

### Fixed because something other than a green test caught it

- [x] The Today screen rendered one day and its actions wrote to another (D51)
- [x] Two fields on one screen shared the label "What got in the way?"
- [x] The focus start token collided with a just-finished session (D50)
- [x] The segmented control overflowed at 320px — a flex item cannot shrink below its content
      without `min-w-0`, which three options made visible for the first time
- [x] Habit consistency read 7% for a habit kept most days, because days before the habit
      existed counted as misses

### Not done, and why

- [ ] **Migrations applied to a hosted database** — still no Supabase project.
- [ ] **Habit schedules are not expanded per day** (D54). The rule is stored and tested; the
      screens do not read it yet.
- [ ] **Tasks have no edit screen** — notes, estimates and recurrence are repository-only.
- [ ] **Week two** — adaptation now has history to read, but nothing reads it.
- [ ] Projects, and linking tasks to goals through the UI.

## Stages 7–17 — not started

Tracked in `docs/PROJECT_LEDGER.md` §8. No item below stage 7 may be ticked before the
stage that builds it has run and been verified.
