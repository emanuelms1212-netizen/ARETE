# PRODUCT_SPEC.md — ARETE

Status: decided. This document is the implementation contract. Where it says "decision", the
question is closed until someone reopens it here and records why.

Working title: **ARETE**. Rename is a one-line change in `src/lib/app-config.ts`.

---

## 1. Primary user

An adult who currently runs their life across five or six apps — a habit tracker, a to-do list,
a timer, a meditation app, a food logger, a notes app for reflection — and keeps none of them
for long, because none of them tell them what today actually is.

They want **one screen in the morning that says what today looks like, and one screen at night
that tells the truth about it.** They are self-directed, not fragile; they want honesty, not
encouragement. They have a body they train, work they need to focus on, food they half-track,
and a mind they'd like to be steadier.

Secondary user, explicitly served but not designed for: someone running a fixed program (the
66-Day Reset) who wants it to adapt when life interferes.

**Not the user:** minors, athletes needing coaching, anyone seeking clinical intervention.

## 2. North star

> **Weeks in which the user completed a real day on at least five days.**

A "real day" is one where the user's own minimum was met — not a perfect day. The metric is
weekly, not daily, because a daily metric punishes normal life. It counts _completion of what
was planned_, not volume, so someone who plans a 10-minute day and does it scores exactly like
someone who plans three hours and does it.

### Supporting metrics (five, no more)

| Metric                       | Definition                                      | Why it earns its place                                 |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Plan-to-actual ratio         | Committed items completed ÷ committed           | Detects over-planning, which is the main failure mode  |
| Return-after-miss rate       | Users who log a day within 48 h of a missed day | Directly measures whether the non-shaming design works |
| Focus minutes per active day | Sum of completed focus sessions                 | The one volume metric worth watching                   |
| Evening review rate          | Days with an evening review                     | Reflection is the loop that makes the rest adapt       |
| Module retention at 4 weeks  | Modules still used 28 days after first use      | Kills features nobody keeps                            |

**Deliberately not tracked as a headline:** streak length. Streaks are shown, never optimised for,
and never gate anything.

## 3. The four loops

| Loop        | The user's sentence               | Screens                  | Data written                                       |
| ----------- | --------------------------------- | ------------------------ | -------------------------------------------------- |
| **Plan**    | "Here is what today is."          | Today, Plan              | `DayPlan`, `TaskInstance`, `HabitInstance`         |
| **Focus**   | "I worked on one thing."          | Today → Focus            | `FocusSession`                                     |
| **Train**   | "I did the session."              | Train, Mind              | `WorkoutSession`, `MobilitySession`, `MindSession` |
| **Reflect** | "Here is what actually happened." | Today → Review, Progress | `DayReview`, `WeekReview`                          |

Every loop writes to the same day record. **A module that cannot show up on Today does not ship.**

## 4. Information architecture

Five primary destinations in a bottom tab bar (thumb-reachable, phone-first). Settings and
profile live behind the avatar in the header — never a sixth tab.

| Tab          | Route       | Answers                                             |
| ------------ | ----------- | --------------------------------------------------- |
| **Today**    | `/today`    | What am I doing right now, and what's left?         |
| **Plan**     | `/plan`     | What are my goals, projects, tasks, habits?         |
| **Train**    | `/train`    | Workout, flexibility, and the body log              |
| **Mind**     | `/mind`     | Meditation, breathwork, cognitive practice, journal |
| **Progress** | `/progress` | What patterns are actually there?                   |

| Behind the avatar                                   | Route                     |
| --------------------------------------------------- | ------------------------- |
| Profile & preferences                               | `/settings`               |
| Programs (66-Day Reset, mobility, meditation packs) | `/settings/programs`      |
| Modules on/off, including opt-in safety modules     | `/settings/modules`       |
| Notifications                                       | `/settings/notifications` |
| Data & privacy (export, delete)                     | `/settings/data`          |
| About, version, licences                            | `/settings/about`         |

**Decision:** Today is a _composer_, not a dashboard of cards linking elsewhere. A habit is
checked on Today. A focus session starts on Today. The evening review opens on Today. The other
tabs are for setup and for looking back.

**Navigation rules:** at most two taps from Today to any action. Back always returns to Today.
Deep-linking works for every route. Desktop renders the same IA as a left rail — no separate
desktop product.

## 5. Journeys

Each journey below is a contract: an implementer should be able to build it without asking
a question. `→` is a screen transition.

### 5.1 First-time onboarding (target: under 3 minutes, skippable at every step)

`/onboarding` → name & timezone → _"What do you want this to help with?"_ (multi-select:
consistency, focus, fitness, flexibility, food awareness, calm, reflection — drives which modules
start enabled) → _"What does a minimum day look like for you?"_ (user picks 1–3 minimums; this is
the "minimum viable day") → optional wake/sleep window (**no default is pre-filled**) → offer
programs (66-Day Reset, mobility, meditation packs — **all off by default, none pre-selected,
none inferred**) → `/today` seeded with a real first day.

**Never asked, never inferred:** religion, ethnicity, body weight (unless the user opens the body
log), diet ideology.

### 5.2 Morning plan (the 90-second ritual)

`/today` opens on the plan state. Shows: date, the minimum day, today's habits, today's scheduled
tasks, today's training session if a program is active, and a single **"Commit to today"** action.
The user can add, remove, or defer anything. Committing freezes the intent — later changes are
recorded as changes, so plan-to-actual stays honest.

Empty state: "Nothing planned yet. Pick one thing." with three suggestions drawn from active goals.

### 5.3 Focus session

Today → tap a task → **Focus**. Duration presets (15 / 25 / 50 / custom) — 25 is a suggestion, not
a default the user must fight. Full-screen timer, no chrome, screen-wake held. Interruptions are
logged with one tap, not punished. On finish: one line — "what moved?" — optional. Session attaches
to the task, and through it to the project and goal.

If the app is closed mid-session, the session resumes from wall-clock time on next open, or is
offered as "ended at HH:MM?" — **never silently lost, never silently completed.**

### 5.4 Workout

Train → today's session (from the active program or ad-hoc) → exercise list with sets/reps →
per-set logging → finish → optional RPE and note. Each exercise has a vector animation and a
plain-language cue written by ARETE. Every exercise offers a **regression** and a **skip with
reason**; a skip with reason feeds the adaptive engine and is not a failure.

Rest timer between sets, optional. Session writes to the day record and to Progress.

### 5.5 Food logging

Train → Food, or Today → Food. **Manual entry only in MVP** — search a small local food list,
recent items, and a free-text entry with optional calories/macros. Fields may be left blank; a
meal logged with no numbers still counts as awareness.
No barcode scanning, no restaurant database, no diet ideology, no "over budget" red states.
Targets are optional and off by default.

### 5.6 Flexibility session

Train → Flexibility → today's day from the active mobility program → warm-up checklist →
movements, one at a time, with a timer for holds and a counter for reps → done.
Pain-aware: **"this hurts"** on any movement ends the movement, offers the regression, and marks
the session adapted rather than failed.

### 5.7 Evening review

Today → **Review** (surfaced after the user's evening hour, never as a nag). Shows the facts of the
day: what was committed, what happened, focus minutes, sessions, food entries. Asks two questions:
**"What actually happened?"** and **"What is tomorrow's one thing?"**
Tone rule: the review never uses the words _failed_, _broke_, _lost_, or _streak_ in copy about a
missed day. A day with nothing done shows "A quiet day." and offers tomorrow.

### 5.8 Weekly review

Progress → Week. Plan-to-actual, focus minutes, sessions by type, habits by day, food-log days,
and **one observation the app is confident about** (e.g. "Focus sessions on days you trained were
40% longer") — or nothing, if nothing is confident. Ends with adjusting next week's minimums.

### 5.9 Missed day

Opening the app after a missed day shows the normal Today screen with one line: _"Yesterday was
quiet. Today is open."_ No red, no broken chain graphic, no recovery flow, no guilt copy.
Programs do not advance on missed days by default — the user chooses "continue where I left off"
or "stay on the calendar" once, in program settings.

### 5.10 Travel day

A day marked **Travel** (one tap on Today) switches to the minimum day, suspends location-bound
sessions (gym, sauna), suggests the bodyweight regression of today's workout, and shifts the
program by one day if the program is set to "continue where I left off". Timezone changes are
detected and the day boundary follows the device, with the previous day closed at its own local
midnight.

### 5.11 Injury / low-readiness day

One tap on Today: **"Not today"** → reason (injury, illness, poor sleep, low energy, no time).
The adaptive engine responds _within_ the day: training drops to mobility or nothing, the minimum
day shrinks to one item, and the program is held rather than advanced. An **injury flag** on a body
region persists until cleared and excludes movements that load that region from all generated
sessions, in every module. There is always a visible **"clear this"** exit.

### 5.12 Starting a program

Settings → Programs → 66-Day Reset → preview of the whole calendar → **the parameter screen**:
wake time, water target, run distances, push-up counts, gym duration, meditation length, reading
pages, social cap, cold exposure on/off. Every value is pre-filled from the source but **every
value is editable before the user starts**, and a "scale to me" control shifts the whole
progression up or down. Starting shows the 60-vs-66-day note.

### 5.13 Meditation / breathwork / cognitive practice

Mind → pick a practice → timer or guided steps → done. Meditation packs (secular and the Jewish
pack) are listed neutrally, alphabetically, with the user choosing.
Cognitive drills show **practice performance over time and nothing else** — no IQ framing, no
"brain age", no transfer claims. A permanent line in the module reads: these drills measure
practice at these drills.

### 5.14 Data export and deletion

Settings → Data → **Export everything** (JSON, immediate, no email) and **Delete everything**
(typed confirmation, immediate, irreversible, no dark patterns).

## 6. Entity relationships

```
User
 └── Goal (why)
      └── Milestone | Project (chunk)
           └── Task ──────────────┐
 └── Habit ─────────────────────┐ │
 └── Program (optional) ────────┤ │
      └── ProgramDay            │ │
                                ▼ ▼
                        Day (one per local date)
                          ├── HabitInstance     (habit × day)
                          ├── TaskInstance      (task × day)
                          ├── FocusSession      → Task
                          ├── WorkoutSession    → Program?
                          ├── MobilitySession   → Program?
                          ├── MindSession       (meditation | breath | cognitive)
                          ├── FoodEntry
                          ├── BodyLog           (optional)
                          └── DayReview
Week
 └── WeekReview
```

**Rules.**
Every session and log attaches to exactly one `Day` and optionally to one `Goal`.
`Day` is keyed by the user's **local** date; the boundary is the device timezone at write time.
Deleting a `Goal` never deletes history — sessions keep an immutable snapshot of their goal title.
Content-pack items (`ProgramDay`, exercises, meditations) carry `source` and `sourceLicense`
(see `SOURCE_MAP.md`) and are never mutated by user edits — edits create a user override.

## 7. Screen-state contracts

Every screen implements four states. No screen ships with fewer.

| Screen      | Loading                             | Empty                                                   | Error                                                     | Success                     |
| ----------- | ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- | --------------------------- |
| Today       | Skeleton day card + 3 row skeletons | "Nothing planned yet. Pick one thing." + 3 suggestions  | "Couldn't load today." + Retry + last known day if cached | Committed day with progress |
| Plan        | Skeleton list                       | "No goals yet." + Add goal                              | Retry, list preserved                                     | Goals → projects → tasks    |
| Train       | Skeleton session card               | "No program active." + Browse programs + Ad-hoc session | Retry                                                     | Today's session             |
| Mind        | Skeleton grid                       | "Nothing chosen yet." + Browse practices                | Retry                                                     | Practice list               |
| Progress    | Skeleton charts                     | "Not enough data yet — check back after a few days."    | Retry                                                     | Charts + one observation    |
| Focus timer | — (instant)                         | —                                                       | Timer keeps running; sync retries in background           | Running / paused / finished |
| Review      | Skeleton                            | "A quiet day." + tomorrow's one thing                   | Retry, answers preserved locally                          | Saved                       |
| Settings    | Skeleton                            | —                                                       | Retry                                                     | Forms                       |
| Onboarding  | —                                   | —                                                       | Step-level retry, answers preserved                       | → Today                     |

**Global:** `error.tsx` per segment, `global-error.tsx` at the root, `not-found.tsx`, and a
skeleton convention (`<Skeleton />`) used everywhere. Errors show what failed and what to do —
never a stack trace, never a bare "Something went wrong."

## 8. Notification strategy

**Default: two notifications per day, maximum. Both can be turned off. None on the first day.**

| Notification        | Default                        | Rule                                                         |
| ------------------- | ------------------------------ | ------------------------------------------------------------ |
| Morning plan        | Off until the user sets a time | Once, at the user's chosen hour                              |
| Evening review      | Off until the user sets a time | Once, at the user's chosen hour, skipped if already reviewed |
| Focus session ended | On                             | Only while a session is running                              |
| Program day ready   | Off                            | At most one per day                                          |

**Never sent:** streak-at-risk, guilt reminders, re-engagement pushes after inactivity,
notifications between 22:00 and the user's wake hour, or more than one notification per hour.
Two consecutive ignored notifications of the same kind auto-mute that kind and say so in-app.

## 9. Scope

### MVP (13 feature groups)

1. Auth (email + one social provider) and account deletion
2. Onboarding with the minimum-viable-day definition
3. Today: composer, commit, progress, day marking (travel / not-today)
4. Habits with schedules and minimums
5. Goals → projects/milestones → tasks, with recurrence
6. Focus timer with history and task attachment
7. Meditation and breathwork with optional packs
8. Cognitive practice with practice-only metrics
9. Manual food and macro logging
10. Adaptive workout sessions with vector exercise animations
11. Flexibility programs with pain-aware adaptation
12. Reset program engine (editable templates, 66-day flagship)
13. Evening + weekly review, Progress, quiet notifications, export/delete

### Explicitly out of scope for MVP

Apple Health / Google Fit / wearables · social features, sharing, leaderboards · calendar write
access · barcode scanning and restaurant nutrition databases · computer-vision form scoring ·
voice or live coaching · photorealistic avatars · AI chat coach · multi-user or coach accounts ·
payments · full offline sync (see §12) · native app store builds.

### Non-goals (never, not "later")

Diagnosis, treatment, or clinical claims · promises of IQ growth or cognitive transfer ·
a single correct diet · assuming religion from identity or location · streak-based punishment ·
engagement-maximising notifications · selling or sharing user health data.

## 10. Analytics

Client-side event definitions live in `src/analytics/events.ts` with a Zod schema per event.
MVP ships a **no-op sink** — events are typed and emitted, and go nowhere until the user opts in.

Events: `onboarding_step_completed`, `day_committed`, `habit_completed`, `task_completed`,
`focus_session_started|completed|abandoned`, `workout_session_completed`, `mobility_session_completed`,
`mind_session_completed`, `food_entry_created`, `day_marked` (travel|not_today),
`day_review_completed`, `week_review_completed`, `program_started|adjusted|paused`,
`module_enabled|disabled`, `notification_muted`, `data_exported`.

**Never in an event payload:** journal text, review text, food descriptions, body measurements,
goal titles, or any free text the user typed. Events carry IDs, counts, durations and enums only.

## 11. Privacy

Journal entries, reviews, body logs and food notes are the most sensitive data in the app.

- Row-level security scoped to the user on every table; no cross-user reads, ever.
- No third-party analytics, ad SDKs, or session-replay tools. Ever.
- Free text is never sent to any third party, never used for training, never in logs.
- Export is complete and immediate. Delete is complete and immediate.
- The privacy note is one screen of plain English, linked from onboarding, not a wall of legalese.

## 12. Offline behaviour — stated honestly

MVP ships **an installable PWA with an offline app shell**, not offline sync.

| Works offline                        | Does not work offline           |
| ------------------------------------ | ------------------------------- |
| App shell, navigation, static assets | Loading data not already cached |
| A running focus timer                | Syncing writes made offline     |
| Reading the currently-loaded day     | Anything requiring auth refresh |

When offline, the app **says so** with a persistent, quiet banner and disables write actions
rather than accepting them and losing them. Full offline write queues are a post-MVP project
with its own conflict-resolution design. `docs/OFFLINE_STRATEGY.md` holds the detail.
**The app must never pretend a write succeeded.**

## 13. Accessibility

Target: WCAG 2.2 AA.

Semantic HTML first, ARIA only where semantics run out · every interactive element reachable and
operable by keyboard, visible focus ring · 4.5:1 text contrast in both themes, verified, not assumed ·
touch targets ≥ 44 × 44 px · `prefers-reduced-motion` respected — exercise animations fall back to
a static illustration plus text cues · timers announce state changes via a live region ·
no information carried by colour alone · full support at 200% text zoom and in landscape ·
safe-area insets honoured on notched devices.

## 14. Tone

Calm, plain, and specific. Short sentences. No exclamation marks. No emoji in product copy.
No "crush it", "beast mode", "no excuses". No marble columns, no togas, no Latin mottoes.

Stoic here means: attend to what is in your control, look at what happened without flinching,
begin again. It shows up as _restraint_ — in what the app asks for, what it notifies about, and
what it claims.

Quotes: verified public-domain sources only, with the work cited. Anything not verifiable is
labelled an original paraphrase or dropped. **Never invent an attribution.**
