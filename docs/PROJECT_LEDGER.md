# PROJECT_LEDGER.md

The running record of what ARETE is, what has been decided, and what happens next.
Updated at the end of every stage.

**Last updated:** 2026-10-12
**Stage:** 8 of 17 — Train: the plan engine, workout logging and the animated mannequin
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
| Database                          | Postgres. Schema in `supabase/migrations`, 49 tables, RLS on all of them       | —                      |
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
   ↘                                   onboarding schemas, safety rules, plan generator,
   ↘                                   workout plan engine, progression, mannequin kinematics)
   ↘  content                       (exercise library, animation keyframes, practices)
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

| #       | Decision                                                                            | Reason                                                                                                                                                                                                                                                                                                                                                                | Reversible? |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D1      | Rebuild stages 0–2 rather than wait to recover the Codex work                       | Nothing was pushed                                                                                                                                                                                                                                                                                                                                                    | n/a         |
| D2      | npm, with a committed lockfile                                                      | CI needs a lock for `npm ci`                                                                                                                                                                                                                                                                                                                                          | Yes         |
| D3      | TypeScript 6.0.3, not 7.0.2                                                         | `typescript-eslint` throws on TS 7                                                                                                                                                                                                                                                                                                                                    | Yes         |
| D4      | ESLint 9.39.5, not 10.10.0                                                          | `eslint-plugin-react` calls an API removed in ESLint 10                                                                                                                                                                                                                                                                                                               | Yes         |
| D5      | Demo mode default; live mode refuses to start half-configured                       | No fake persistence. Failing loudly beats serving sample data as real                                                                                                                                                                                                                                                                                                 | No          |
| D6      | ~~The demo repository is read-only~~                                                | **Superseded by D20**                                                                                                                                                                                                                                                                                                                                                 | —           |
| D7      | Module screens show an honest placeholder                                           | A greyed-out button still implies a feature                                                                                                                                                                                                                                                                                                                           | No          |
| D8      | No `@vitejs/plugin-react`; `oxc.jsx.runtime` in the Vitest config                   | Fewer peers, native JSX transform                                                                                                                                                                                                                                                                                                                                     | Yes         |
| D9      | `typedRoutes` off                                                                   | Would couple `tsc --noEmit` to build artefacts                                                                                                                                                                                                                                                                                                                        | Yes         |
| D10     | Offline shell only, stated plainly                                                  | Offline sync needs a conflict design first                                                                                                                                                                                                                                                                                                                            | No          |
| D11     | The reset pack ships as 66 days, labelled                                           | Source title says 60, content says 66                                                                                                                                                                                                                                                                                                                                 | No          |
| D12     | No analytics event may carry free text                                              | Journal text is the most sensitive data here                                                                                                                                                                                                                                                                                                                          | No          |
| D13     | Tokens in TypeScript; CSS mirrors them; a test compares                             | A design system documented in prose drifts                                                                                                                                                                                                                                                                                                                            | No          |
| D14     | Contrast computed, not claimed                                                      | 48 assertions across both themes                                                                                                                                                                                                                                                                                                                                      | No          |
| D15     | Self-hosted fonts, not `next/font`                                                  | A PWA should not need a third party to render its own text                                                                                                                                                                                                                                                                                                            | Yes         |
| D16     | Native `<dialog>` for sheets, confirmations and the launcher                        | Focus trap and Escape from the platform                                                                                                                                                                                                                                                                                                                               | Yes         |
| D17     | Real radios for the segmented control                                               | Arrow keys come free and correct                                                                                                                                                                                                                                                                                                                                      | Yes         |
| D18     | Reduced motion rests the breathing ring at full size                                | A 0.01ms collapse would freeze it mid-scale                                                                                                                                                                                                                                                                                                                           | No          |
| D19     | `/styleguide` 404s in production                                                    | One line that cannot be forgotten                                                                                                                                                                                                                                                                                                                                     | Yes         |
| **D20** | **The demo repository is writable, in memory, and says so**                         | D6 kept demo mode read-only to avoid faking durability. With a real contract to satisfy, the honest version is the opposite: demo mode implements the _same_ writes so it exercises the real domain behaviour, and the badge says changes last until the server restarts. The dishonest version is a store that looks permanent and empties on deploy                 | No          |
| **D21** | **Supabase for authentication only; data access is plain SQL to Postgres**          | The SQL the tests prove is the SQL production runs. A PostgREST data layer would only exist in production and could not be exercised against a real database locally                                                                                                                                                                                                  | Yes         |
| **D22** | **The authorization tests run against PGlite, a real Postgres in process**          | "One user cannot read another's data" is worthless unless something tries. PGlite is Postgres 18 compiled to WASM, so policies behave exactly as they will hosted — and it needs no project, no network and no credentials                                                                                                                                            | Yes         |
| **D23** | **A test fixture stands in for Supabase's `auth` schema**                           | The migrations depend on `auth.users` and `auth.uid()`. `supabase/test/0000_auth_shim.sql` is the smallest faithful stand-in, kept in a separate directory so it can never be applied to a real database                                                                                                                                                              | No          |
| **D24** | **One contract suite, both adapters**                                               | They are only interchangeable if they behave identically, and the only way to know is to hold both to the same tests                                                                                                                                                                                                                                                  | No          |
| **D25** | **Both `ENABLE` and `FORCE` row-level security, everywhere**                        | FORCE means the table owner is not exempt either, so a bug in a security-definer function cannot quietly read everything                                                                                                                                                                                                                                              | No          |
| **D26** | **Product rules go in check constraints where they can**                            | No free text in analytics, no unverified attributions, no skip without a reason. Application code can forget; a constraint cannot                                                                                                                                                                                                                                     | No          |
| **D27** | **`DATABASE_URL` that looks like a service-role connection is rejected at boot**    | The service role bypasses every policy. Catching it in environment validation is cheaper than discovering it in an incident                                                                                                                                                                                                                                           | No          |
| **D28** | **Measurements stored metric, converted at the edge**                               | `unit_system` says what to show, never what to store, so switching systems cannot corrupt history                                                                                                                                                                                                                                                                     | No          |
| **D29** | **A small closed recurrence grammar, not RRULE**                                    | Daily, weekly-by-weekday and monthly-by-day cover everything the product needs, and a small grammar can be exhaustively tested and rendered back in plain English                                                                                                                                                                                                     | Yes         |
| **D30** | **A skipped step is a conservative answer, not a missing one**                      | Every step schema supplies its own defaults and the profile uses Zod's `.prefault({})`, so skipping produces a complete, usable, cautious week. The alternative — absent answers the generator checks for everywhere — puts the branch in every call site instead of once in the schema                                                                               | No          |
| **D31** | **"Prefer not to say" raises a safety notice; it never blocks**                     | Blocking someone for declining a personal question teaches them to lie to the form, and a form people lie to is more dangerous than one they leave blank                                                                                                                                                                                                              | No          |
| **D32** | **Safety rules may only tighten**                                                   | Decisions are ranked and rules apply in sequence through `tighten()`, so the strictest answer wins and nothing later can relax it. Two conditions that each reroute something can never combine into permission                                                                                                                                                       | No          |
| **D33** | **The age gate is enforced in the database as well as the generator**               | A trigger rejects a `nutrition_targets` row with calories for a user under 18 without `guardian_confirmed_at`. A later feature that writes targets by another path cannot forget                                                                                                                                                                                      | No          |
| **D34** | **Nothing is written until the user accepts the week**                              | The generated week is a `plan_drafts` row. Reaching review and leaving creates no days, and the contract suite asserts it. A plan a person has edited is a plan they chose                                                                                                                                                                                            | No          |
| **D35** | **The edited draft is stored beside the generated one, not over it**                | The difference between what the engine proposed and what the user kept is the most useful signal this product will collect. Overwriting loses it                                                                                                                                                                                                                      | Yes         |
| **D36** | **Hard caps on week one: four training days, three habits, one quiet day**          | The limit protects the user from their own first-week enthusiasm, which is the single most reliable cause of abandonment in this category                                                                                                                                                                                                                             | Yes         |
| **D37** | **Durations live in `minutes`, never in an item's title**                           | The UI renders both, so a title that names its own duration reads "Mobility · 10 min 10 min". A test asserts no generated title contains one                                                                                                                                                                                                                          | No          |
| **D38** | **The review screen draws its draft in a plain server function, not an action**     | A server action may not revalidate a path during render. `ensureDraftWeek` is the reusable read; `generateDraftAction` wraps it for the client. Found by reading the dev-server log during an otherwise green E2E run                                                                                                                                                 | No          |
| **D39** | **A migration ledger, because the migrations were never replayable**                | `db:migrate` replayed every file on every run and the docs called that safe. A test of the claim failed on the second run: the early migrations create tables unconditionally. `public.schema_migrations` records each file with a checksum, so each applies once and an already-applied file that has since been edited fails loudly by name                         | No          |
| **D40** | **The ledger table is reachable only by the service role**                          | It is deployment infrastructure, not user data. RLS is enabled and forced with a `using (false)` policy, so "nobody reads this through the request path" is stated rather than implied — and the audit that checks every table has a policy still sees it                                                                                                             | No          |
| **D41** | **`ScriptExecutor`, separate from `SqlExecutor`**                                   | `query` speaks the extended protocol and takes one statement; a migration file is many. Deployment-only and parameterless, so it widens no injection surface                                                                                                                                                                                                          | Yes         |
| **D42** | **A habit's streak continues when the user meets their own minimum**                | The minimum is the promise they made themselves; the target is the ambition. Breaking a streak for keeping the promise punishes honesty, and the person reading the number is usually having a bad week                                                                                                                                                               | No          |
| **D43** | **Rest days and unscheduled days are stepped over, never counted against**          | A streak that a planned rest day breaks punishes the schedule the user chose                                                                                                                                                                                                                                                                                          | No          |
| **D44** | **Consistency is the number on display; the streak is secondary**                   | A streak answers "how long since I slipped", which gets more frightening the better it gets. Consistency survives a bad week, and a bad week is when the number is actually read                                                                                                                                                                                      | Yes         |
| **D45** | **`limit` habits invert: the target is a ceiling and lower is better**              | Treating a limit as a target is how an app congratulates someone for a personal best in the thing they are cutting down                                                                                                                                                                                                                                               | No          |
| **D46** | **A goal with no measure gets no progress bar — the type makes it unrepresentable** | `goalProgress` returns a union whose `judged` branch has no ratio at all, so the UI cannot render one by accident. Counting completed milestones and calling the percentage progress rewards making milestones smaller                                                                                                                                                | No          |
| **D47** | **Descending goals are first-class**                                                | Weight, a 10k time, hours on a phone. Without an explicit branch, moving 90 towards a target of 80 reads as negative progress                                                                                                                                                                                                                                         | No          |
| **D48** | **The focus timer stores no countdown**                                             | A session holds when its current segment started and how many seconds earlier segments banked; elapsed is derived. A reload, a second tab and a slept phone all compute the same answer, which is what makes the stage's acceptance criterion hold rather than usually hold                                                                                           | No          |
| **D49** | **One running focus session per user, enforced by a partial unique index**          | Two running timers is not a feature, and without the constraint the UI has to decide which one is real                                                                                                                                                                                                                                                                | No          |
| **D50** | **The start token identifies the attempt, and comes from the client**               | It was derived server-side from the date, task and current minute. Finish a session and start an identical one in the same minute and the token matched the finished row, so the caller was handed a stopped timer as if it had just begun. Found by a cross-project end-to-end failure; a contract test now guards it                                                | No          |
| **D51** | **`resolveCurrentDay` is the single answer to "which day is this screen about"**    | Today rendered the demo's fixed sample day while every action resolved the date from the clock, so a click failed against a day the user had never seen. Passing the date from the client would let a stale tab write to yesterday; one shared server-side function is the fix, and Plan uses it for the same reason                                                  | No          |
| **D52** | **A recurring task is anchored at creation**                                        | Without `recurrence_anchor`, completing an every-Monday task on the Thursday re-anchors the series to Thursday and it walks forward a little each time                                                                                                                                                                                                                | No          |
| **D53** | **Subtasks are one level deep, enforced by a trigger**                              | Arbitrary nesting turns a task list into an outliner, and an outliner is where work goes to be organised instead of done                                                                                                                                                                                                                                              | Yes         |
| **D54** | **A habit's history starts at its first activity, not at the window's edge**        | A habit kept every day since it was created a week ago otherwise reports single-digit consistency, because the twenty-three days before it existed count as misses. The first log stands in for a creation date until habit schedules arrive                                                                                                                          | Yes         |
| **D55** | **The opt-in pack rule is enforced by the query, not by the screen**                | A practice tied to a pack is excluded from `listMindPractices` unless a `user_content_packs` row exists, and `startMindSession` re-checks the same condition. An unchosen pack's practices are absent, not greyed out, and naming one directly is refused. SOURCE_MAP §5 is a product promise, so it lives below the UI                                               | No          |
| **D56** | **The Jewish pack describes its practices and prints no liturgy**                   | The text is public domain, so printing it would be permitted. But an app that mis-transliterates or paraphrases sacred text is worse than one that declines to, so week three points the user to their own siddur and Psalm 16:8 is cited by reference. The provenance note says this explicitly, so a later reader does not mistake the omission for an oversight    | Yes         |
| **D57** | **No hyperventilation protocols in the MVP**                                        | Wim Hof rounds, breath-of-fire and post-over-breathing retention carry a real syncope risk and are not something an app should coach unsupervised. `isConservative` guards the shipped set, and a test asserts every pattern passes it — so adding an aggressive one later fails loudly                                                                               | No          |
| **D58** | **The breathing orb derives its phase from elapsed seconds**                        | A CSS keyframe animation drifts the moment the tab is backgrounded and is wrong on resume. Recomputing from elapsed time means a locked phone picks up where the breath actually is                                                                                                                                                                                   | No          |
| **D59** | **Reduced motion keeps the pacing, it does not remove it**                          | The orb stops scaling; the phase name, the count, the ring fill and the live region all keep working. Someone who has turned motion off still needs to know when to breathe out                                                                                                                                                                                       | No          |
| **D60** | **Cognitive practice produces no score, and the type has no field for one**         | No IQ, no percentile, no single number. A test asserts the module's whole surface never matches `/\biq\b                                                                                                                                                                                                                                                              | percentile  | \bscore\b | brain age/`, and every drill describes what it measures as being "at this task" | No  |
| **D61** | **Only the two implemented drills are offered**                                     | The brief names six; two have a working runner. Six buttons where two do something is the mock button the operating rules forbid, so the other four are recorded as outstanding rather than drawn                                                                                                                                                                     | Yes         |
| **D62** | **Drill items are seeded from the session id**                                      | A reload must not reshuffle the questions mid-drill. Deriving the seed from the session's own id means the same session always generates the same items                                                                                                                                                                                                               | Yes         |
| **D63** | **One running session per kind, not per user**                                      | Breathing before a focus block while a silent timer runs is sensible, not a conflict. The partial unique index is per table                                                                                                                                                                                                                                           | Yes         |
| **D64** | **A reload lands back inside whatever was running**                                 | The Mind screen picks its initial mode from which kind has a running session, computed on the server. Defaulting to the first tab lost the session the user was actually in — the page had it and simply was not showing it                                                                                                                                           | No          |
| **D65** | **The training plan is never stored**                                               | It is a pure function of the saved setup, the safety rules and the logged history. Storing it would create a second copy to fall out of date the moment a set is logged. `generateTrainingPlan` is deterministic and a test runs it twice per fixture and compares                                                                                                    | Yes         |
| **D66** | **A workout snapshots its prescription when it starts**                             | Exercises, targets and the rule behind each are copied into `workout_sessions.snapshot`. Editing the setup mid-workout cannot move the goalposts of the workout in progress, and a reload shows exactly what was prescribed                                                                                                                                           | No          |
| **D67** | **Progression is first-match, conservative and explains itself**                    | Load rises only when every set reached the top of the range, the top RPE was at or under target, and the person ticked "form held". Reps rise one at a time before load. Pain ≥ 4/10 takes ~10% off; any pain at all holds. Two very hard sessions with falling reps deload. Every decision returns the sentence the screen shows                                     | Yes         |
| **D68** | **Training pain flags are separate from onboarding's injury history**               | Onboarding's injuries feed the safety rules; Train's pain flags are current and editable from the Train screen. Both are read: severe excludes every exercise that loads the region (substitutes included), mild or moderate picks the easiest variant and says so                                                                                                    | Yes         |
| **D69** | **A substitution must keep the movement pattern, and only before sets are logged**  | The pattern is the slot's intent. A swap to a different pattern, to equipment the person has not listed, or onto a severely flagged region is refused with the reason. Swapping after sets are logged would split one exercise's history across two                                                                                                                   | Yes         |
| **D70** | **The week is laid out by scoring every ordering**                                  | Six days is 720 orderings, which is nothing. Leg-heavy sessions the day before or the day of tennis, and back-to-back leg days, carry penalties; ties go to the template order, so the result is stable. Someone new gets at most three hard sessions however many days they pick                                                                                     | Yes         |
| **D71** | **The mannequin is angles plus positions, with pinned limbs solved by IK**          | Interpolating joint angles alone lets a planted foot slide and a hand lift off the floor. Pinned limbs (feet in a squat, hands in a push-up) are solved by two-bone inverse kinematics each frame. Every animation is held to a generic validator and to exercise-specific checks — heels down in a squat, no hip sag in a push-up — so a bad drawing fails the build | No          |
| **D72** | **The player moves the figure by writing SVG attributes, not by re-rendering**      | A React render per frame is fine on a laptop and uneven on a mid-range phone. The rAF loop solves the pose and sets twelve lines' coordinates; only the caption goes through state, and only when the step changes. Measured end to end at 4× CPU throttling: 121 frames in 2 s, p95 frame gap 16.7 ms                                                                | Yes         |
| **D73** | **Reduced motion swaps the animation for captioned stills**                         | The same instruction without the movement: one still per captioned step. Anyone can switch to it; it is not only for people whose OS asks                                                                                                                                                                                                                             | No          |
| **D74** | **Finishing a workout completes the day's training commitment**                     | It is the same fact, and the person should not have to record it twice                                                                                                                                                                                                                                                                                                | Yes         |
| **D75** | **A trigger checks that a logged set's workout belongs to the same person**         | RLS checks the row's own `user_id`; a foreign key is checked with the owner's rights, not the caller's. Without the trigger, a set could be attached to someone else's workout id. An adversarial test proves the refusal                                                                                                                                             | No          |
| **D76** | **The workout journey runs in the phone end-to-end project only**                   | The demo is one shared in-memory account with one running workout at a time. Two projects driving it at once would be testing the race, not the feature. Everything read-only runs in both                                                                                                                                                                            | Yes         |

## 3. Data model

49 tables. The full account is in **`docs/DATA_MODEL.md`**; the schema itself is
`supabase/migrations/0001` through `0014`. Stage 8 added `workout_sessions` (a workout as
performed, with the prescription it started from), set-level columns on `workout_logs`
(session, slug, block, distance, pain, form, notes, substitution), the exercise library's
instruction text on `exercises`, and the plan inputs on `training_profile`. Stage 7 added `mind_practices` (the catalogue,
library content) and `user_content_packs` (which packs this account has chosen), plus the
shared player columns on all three session tables. Stage 6 added `goal_measurements`,
`goal_reviews` and `day_reviews`, four habit kinds, task subtasks with energy and
context, the day's intention and minimum mode, and the focus timer's pause state. Stage 5 added `onboarding_progress`,
`health_profile`, `training_profile`, `nutrition_profile`, `mind_profile` and `plan_drafts`,
with row-level security on all of them and `user_owned_tables()` rewritten to cover them —
so export and deletion reach them too.

Five conventions run through all of it: ownership by `user_id` with RLS; local days with the
zone stored beside the date; template / instance / log as separate tables; one unit system in
storage; and `client_token` on every write a retry might repeat.

**Migrations:** 14, applying from zero, proven in `src/persistence/rls.test.ts`.
**Applied once, and proven:** `public.schema_migrations` records every applied file with a
checksum (D39). A test asserts that a second `db:migrate` applies nothing, and that an
already-applied file which has since been edited fails loudly rather than diverging quietly.

## 4. Routes

| Route                     | Kind          | State                                                                                                                                               |
| ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | redirect      | → `/today`                                                                                                                                          |
| `/today`                  | **dynamic**   | Live — the morning framing, the day's commitments with complete/skip/snooze/reorder/quick-add, minimum mode, the focus timer and the evening review |
| `/onboarding`             | **dynamic**   | Live — resumes at the step the user left                                                                                                            |
| `/onboarding/[step]`      | **dynamic**   | Live — eight questions and the week review                                                                                                          |
| `/plan`                   | **dynamic**   | Live — goals, tasks and habits                                                                                                                      |
| `/train`                  | **dynamic**   | Live — setup, the week, why the plan is what it is, start/log/swap/finish a workout, recent workouts                                                |
| `/train/exercises`        | static        | Live — the exercise library by movement                                                                                                             |
| `/train/exercises/[slug]` | **dynamic**   | Live — the animated mannequin where one exists, and the full text instruction always                                                                |
| `/mind`                   | **dynamic**   | Live — meditation, breathwork and cognitive practice                                                                                                |
| `/progress`               | static        | Placeholder                                                                                                                                         |
| `/settings`               | static        | Build info and planned sections                                                                                                                     |
| `/styleguide`             | dev only      | 404s in production                                                                                                                                  |
| `/api/health`             | route handler | Build, version and mode. No secrets                                                                                                                 |

## 5. Commands

| Gate                         | Command                                                  | In CI           |
| ---------------------------- | -------------------------------------------------------- | --------------- |
| Format · Lint · Types        | `format:check` · `lint` · `typecheck`                    | Yes             |
| Unit, component and database | `npm test` — **926 tests**                               | Yes             |
| Build                        | `npm run build`                                          | Yes             |
| End-to-end                   | `npm run e2e` — **122 tests** (4 skipped by design, D76) | Yes             |
| Everything                   | `npm run verify`                                         | —               |
| Migrate / seed / reset       | `db:migrate` · `db:seed` · `db:reset`                    | No — deployment |

## 6. Known limitations

1. **No Supabase project exists.** Everything is proven against an in-process Postgres; the
   migrations have never been applied to a hosted database. This is the one thing still
   blocked on the product owner — see §8. It did not block stage 5.
2. **Repositories exist for days, onboarding, goals, tasks, habits, focus sessions, the
   three Mind kinds, the Train setup and workouts.** The remaining tables have schema, policies, seed and tests; their
   repositories arrive with the modules that use them.
3. **One destination is a placeholder** — Progress.
4. **No sign-in screen.** The auth provider works and onboarding runs; the screen itself still
   waits on the Supabase project (§8), because there is nothing to sign in to without one.
5. **The plan engine generates week one only.** Week two is the first adaptation, and it now
   has completion history to adapt to — but nothing reads it yet.
6. **No programme selection.** Choosing the reset pack or a flexibility programme, with its
   parameters editable and the 60-versus-66-day note shown, is still ahead. The mind step
   offers the packs; starting one does not exist yet.
7. **Four of six cognitive drills are not implemented** (D61). Sustained attention, reaction
   time, recall and spaced retrieval have definitions and a schema but no runner, so they are
   not offered. Mental arithmetic and working memory work end to end.
8. **Habit schedules are not expanded yet.** Every day in the window counts as scheduled from
   the habit's first activity onward (D54); the per-day rule in `habit_schedules` is stored and
   tested but not yet read by the screens.
9. **Offline shell only** — no service worker, no write queue, no sync.
10. **No theme toggle.** The app follows `prefers-color-scheme`; a manual override is still open.
11. **Tasks have no edit screen.** They can be created, scheduled, completed and archived, but
    notes, estimates and recurrence are only settable through the repository.
12. TypeScript and ESLint are each one major version behind their latest release (D3, D4).
13. **Train: what is not there yet.** Nine movements are animated; the rest are text only, and
    say so. Front views exist for the squat and the split squat. Runs are prescribed by time,
    not distance. Loads are shown in kilograms only. Deloads are reactive (D67), not planned
    weeks. The week is the same every week until the setup or the history changes it.
14. **Playwright cannot run on the build machine**: no browser, and the network allowlist
    blocks `cdn.playwright.dev`. The suite runs in CI with Playwright's own Chromium, and is
    run here against a production build by setting `PLAYWRIGHT_CHROMIUM_PATH` to a
    preinstalled one. There is no uncommitted local patch.

## 7. Open risks

| Risk                                                       | Severity | Owner                          | Note                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rights to ship the `Total Flexibility` programme structure | **High** | Product owner                  | Third-party commercial ebook. Now enforced in data: `flexibility_programs.rights_status = 'pending'`, and the seed ships it that way. Either obtain written permission from David Thurin or re-derive the progression                                                      |
| Contrast-therapy safety                                    | **High** | Product + a qualified reviewer | 70–82 °C sauna, 13 °C immersion, no screening in the source. The pack is flagged `requires_safety_acknowledgement`, and `safety_acknowledgements` gates it                                                                                                                 |
| Seed-oil content is contested and copyrighted              | Medium   | Product owner                  | Seeded as `third-party-no-redistribution`. At most one optional labelled note                                                                                                                                                                                              |
| Exercise animations were drawn by an engineer              | Medium   | A coach or physiotherapist     | Nine original keyframe animations, held to kinematic and form checks in tests. They are labelled instructional aids, not form assessment; a qualified reviewer should still look at each before launch                                                                     |
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
4. `npm run db:reset` — applies all fourteen migrations, then seeds content and the demo account.
5. In **Authentication → Providers**, enable email, and one social provider.
6. Set `NEXT_PUBLIC_APP_MODE=live` and start the app.

Until then `NEXT_PUBLIC_APP_MODE=demo` runs the whole product, onboarding included, with no
credentials at all.

### Also waiting on the product owner

The safety rules need a clinical reviewer before real users meet them (§7). The rules are
written, conservative and tested; what is missing is a professional saying so. This is not
blocking stage 6, but it blocks launch.

### Then: stage 9 — flexibility and mobility

Re-read prompt 9 in the pack before starting; in outline it is the flexibility and mobility
programmes with pain-aware adaptation. Two things carry over from stage 8: the mannequin
framework (D71–D73) is ready for mobility movements — a new animation is keyframes plus the
checks that prove it — and the `Total Flexibility` rights question (§7) decides whether the
programme structure can ship or must be re-derived.

Still open from earlier stages, in the order they will bite: the Supabase project (above), the
four unimplemented cognitive drills (D61), tasks having no edit screen, habit schedules not yet
being expanded per day, and the Train items in §6.13.

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
- **Look at the screenshots, do not just take them.** Three defects in stage 5 — duplicated
  copy on two steps, a duplicated duration on every timed item, and a translucent save bar over
  dense content — were invisible to every test and obvious in a picture.
- **Test the claims the documentation makes.** "The migrations are idempotent" had been
  written down for two stages and was false the whole time (D39). The test took ten minutes.
- **Enforce a product promise below the UI.** The opt-in pack rule (D55) is a `where` clause
  and a refusal in the repository, not a screen that declines to render something. A rule that
  lives only in a component is one refactor from being gone.
- **A test that passes alone and fails in the suite is telling you something true.** Three
  times in this stage it was a real defect — a date mismatch between a screen and its actions,
  two fields sharing one label, and a focus token coarse enough to collide — and not once was
  the right fix to loosen the assertion.
- **Prove the drawing, not just the code.** Every mannequin animation passed the kinematic
  validator on the first run; the screenshots still showed what to check next. A figure can be
  geometrically valid and teach the wrong thing, which is why each animation also has tests
  for what the movement is meant to look like.
