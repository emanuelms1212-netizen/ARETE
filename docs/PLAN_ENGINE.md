# PLAN_ENGINE.md

How onboarding's answers become a first week, and why the engine refuses some of what it
is asked for.

**Source of truth:** `src/domain/onboarding.ts` (what is asked), `src/domain/safety.ts`
(what is refused), `src/domain/plan-generator.ts` (what is produced).
**Proof:** `src/domain/safety.test.ts` and `src/domain/plan-generator.test.ts` — 112 tests
across nine personas.

---

## 1. The shape

```
answers  →  OnboardingProfile  →  SafetyReport  →  DraftWeek  →  (user edits)  →  real days
   Zod          typed, with        what may not      7 days,        review          daily_plans
   per step     conservative       be suggested,     every item     screen          + items
                defaults           and why          carries a
                                                    `because`
```

Three properties hold at every arrow:

**Nothing is written until the user agrees.** The generated week is a `plan_drafts` row, not
a plan. `acceptDraft` is the only thing that creates `daily_plans`, and the contract suite
asserts that reaching review and leaving writes no days.

**Every item explains itself.** `PlanItem.because` is non-optional, and a test fails any item
whose reason is shorter than fifteen characters or contains `undefined`. The review screen
puts it behind "Why is this here?" rather than in front of the user, because a reason you can
ask for is reassurance and a reason you cannot dismiss is noise.

**The generator is pure.** `generateFirstWeek(profile, { startDate, timeZone })` takes no
clock, no database and no randomness. The same answers produce the same week, which is what
makes nine personas testable at all.

## 2. Nine questions, each skippable

`ONBOARDING_STEPS` — `intent`, `schedule`, `training`, `health`, `food`, `mind`, `age`,
`minimum`, `review`. Eight ask something; the ninth shows the result.

Each step has its own Zod schema, and the combined profile uses `.prefault({})` rather than
`.default({})`, so **a skipped step parses to its own field defaults instead of being
absent**. Skipping is therefore a first-class answer, not a hole the generator has to check
for: the `skipped` persona produces a complete, conservative, perfectly usable week.

Every step states why it is being asked (`STEP_RATIONALE`), and every step can be left
entirely (`Do this later` in the header, `Skip this` beside Continue). Onboarding is not a
wall.

The order is deliberate. `minimum` is last and is the one that matters: _on the day everything
goes wrong, how many things still have to happen for it to count?_ Most people should answer
one.

## 3. Safety: rules that only tighten

`evaluateSafety` returns a decision per module across seven of them: `cold_exposure`,
`contrast_therapy`, `sauna`, `loaded_mobility`, `high_intensity`, `calorie_targets`,
`fasting`.

A decision is one of `allowed`, `requires_acknowledgement`, `rerouted` or `blocked`, ranked in
that order. Rules apply in sequence and may only move a module **up** the ranking — the
strictest answer wins and nothing later can relax it. This is why two conditions that each
reroute something cannot combine into permission.

| Answer                        | Effect                                                                      |
| ----------------------------- | --------------------------------------------------------------------------- |
| Pregnant or postpartum        | Heat, cold and fasting blocked; loaded mobility and high intensity rerouted |
| Heart condition or fainting   | Cold immersion and sauna blocked                                            |
| Does not tolerate heat / cold | Treated separately — one does not imply the other                           |
| Severe injury                 | Loaded mobility blocked; moderate injury reroutes to easier versions        |
| Awaiting medical clearance    | Week one stays light until the user says it is confirmed                    |
| Under 18 without guardian     | Calorie targets and fasting blocked                                         |
| **Prefer not to say**         | `requires_acknowledgement` — **deliberately not blocked**                   |

That last row is a product decision. Blocking someone for declining a personal question
teaches them to lie to the form, and a form people lie to is worse than no form. The honest
response to "I would rather not say" is a safety notice, not a locked door.

The age gate is enforced twice: in the generator, and in the database. A `nutrition_targets`
row with calories set, for a profile whose `birth_year` makes the user under 18 and whose
`guardian_confirmed_at` is null, is rejected by a trigger. Application code can forget.

## 4. What the generator will not do

Three limits are hard-coded, against the user's own enthusiasm:

| Limit                 | Value                                                    |
| --------------------- | -------------------------------------------------------- |
| Training days, week 1 | **4 maximum**, whatever the answers say                  |
| Habits tracked        | **3 maximum** — a list of twelve goals is none           |
| Quiet days            | **At least one**, and it is labelled as part of the plan |

Training days start from experience (`new` 2, `returning` 3, `consistent` 3, `experienced` 4),
are capped by the days the user said they are actually free, and are spread by `spreadDays()`
so they do not fall back to back. Meditation length comes from stated experience, not
ambition: `new` 5 minutes, `some` 10, `regular` 15.

Every day gets a **minimum version** — one item that still counts when the day is against
you. It is chosen in the order `mind`, `review`, `food`, `focus`, `mobility`, `workout`, so a
thirty-minute workout is never the smallest thing on a day that also contains a five-minute
sit. A test asserts exactly that.

Durations live in `PlanItem.minutes` and never in the title, so a row cannot read
"Mobility · 10 min 10 min". A test asserts no generated title contains a duration.

## 5. The review screen

The last screen before anything is saved shows the whole week: notes about what week one is
for, counts at a glance, the habits, and every day with every item. Each item can be removed,
demoted or promoted to the day's minimum, and each can be asked why it is there.

What the user saves is what they edited — `acceptDraftAction` stores the edited draft as a
new `plan_drafts` row _before_ accepting it, so the week the user agreed to and the week the
engine originally proposed are both on record. The difference between them is the most
interesting signal this product will ever collect, and it would be lost by overwriting.

## 6. Where it is persisted

| Table                 | Holds                                                         |
| --------------------- | ------------------------------------------------------------- |
| `onboarding_progress` | Current step, completed steps, skipped steps, completion time |
| `onboarding_answers`  | The raw answers, exactly as given                             |
| `health_profile`      | Pregnancy, cardiovascular, temperature tolerance, injuries    |
| `training_profile`    | Experience, equipment, session length, days available         |
| `nutrition_profile`   | Logging goal, calorie-number preference, units, allergies     |
| `mind_profile`        | Meditation experience, chosen packs                           |
| `plan_drafts`         | Generated and edited weeks, before acceptance                 |

Raw answers are kept _and_ projected into the typed profile tables. The raw row is what the
user said; the typed rows are what the engine reads. Keeping both means a later change to how
an answer is interpreted does not require re-asking the question.

## 7. Known gaps

- **The engine generates week one only.** Week two onward is adaptation, which needs
  completion history to adapt to — stage 6 and beyond.
- **No programme selection yet.** Choosing the reset pack or a flexibility programme, with
  its parameters editable and the 60-versus-66-day note shown, is still ahead. The content
  packs are seeded and the mind step already offers them.
- **Contrast therapy is scheduled only if asked for**, and only where safety allows, but the
  pack itself still carries an unresolved safety review (`PROJECT_LEDGER.md` §7).
- **No repositories for `habits`, `habit_schedules` or `tasks`.** The draft's habits are
  stored on the draft; turning them into recurring schedules arrives with the screens that
  manage them.

## The training plan (stage 8)

The first-week generator above decides _that_ there is a training session on a day. The Train
plan engine (`src/domain/workout-plan.ts`) decides _what is in it_, from the setup saved on the
Train screen. It is pure and deterministic, and nothing it produces is stored (ledger D65).

1. **Shape.** The goal and the number of days (2–6) pick a template — full-body A/B/C,
   upper/lower, runs with strength, or strength with court conditioning. Someone new gets at
   most three hard sessions; the rest become easy movement.
2. **Arrangement.** With tennis days, every ordering of the week is scored and the lowest
   penalty wins: leg-heavy sessions the day before or the day of a match cost most, back-to-
   back leg days cost a little. Ties keep the template order.
3. **Exercises.** Each slot names movement patterns with fallbacks ("a pull-down, else a
   row"). The library is filtered by equipment, severe flags and the avoid list; difficulty
   targets experience (accessories one step lower); a sore region gets the easiest variant.
   A pattern nothing can fill is left out and listed under "Why this plan".
4. **Dosage.** Sets, reps or time, rest and RPE come from goal, experience and role. Warm-up
   and cool-down are fixed. Nothing logged in two weeks takes a set off.
5. **Fit.** Sessions are trimmed to the minutes available — accessory sets, then accessories,
   then a primary set, then the second cool-down and warm-up items. The first main exercise
   never goes. The minimum version is the first warm-up item and the first main exercise.

At the start of a workout, `buildWorkout` adapts the session to readiness (low: a set fewer,
one RPE easier; high: unchanged) and runs `decideProgression` per exercise against the logged
history. The result is snapshotted on the workout (D66). The progression rules are in
`src/domain/progression.ts` and summarised in ledger D67.
