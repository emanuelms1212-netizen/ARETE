# SAFETY_MATRIX.md

Which module does what for whom, where each rule lives, how a person stops, and which claims
ARETE never makes. Stage 13.

**One source of truth.** Every rule below is decided in `src/domain/safety.ts`
(`evaluateSafety`) and composed in `src/domain/eligibility.ts` (`eligibility`). Server contexts
load it once through `src/app/(app)/eligibility.ts`; components only display the result. A
person can see every decision, with its reason, at **Settings → Safety and modules**, and
change the answer behind it there.

**Two rules hold everywhere.** The strictest source wins: an onboarding answer that rules heat
and cold out is not undone by a later screening answer or a clearance tick. And nothing is
inferred from silence: "prefer not to say" asks for an acknowledgement, never a block.

> **Release blocker.** These rules were written by an engineer from the source PDFs and
> mainstream guidance. They are conservative and tested, and they have **not** been reviewed
> by a clinician or a registered dietitian. Launch to real users is blocked until they are
> (ledger §7, THREAT_MODEL §5).

## 1. What each answer changes

Legend: **✕** not offered · **↘** offered in an adjusted form · **!** one step first
(acknowledge or screen) · **·** unchanged.

| Answer (onboarding unless noted)        | Hard training | Loaded stretching | Cold finish (Reset) | Contrast therapy      | Sauna | Calorie targets                               | Fasting | Flexibility programme                             |
| --------------------------------------- | ------------- | ----------------- | ------------------- | --------------------- | ----- | --------------------------------------------- | ------- | ------------------------------------------------- |
| Nothing reported                        | ·             | ·                 | !                   | !                     | ·     | ·                                             | ·       | ·                                                 |
| Pregnant / postpartum                   | ↘             | ↘                 | ✕                   | ✕                     | ✕     | ✕ (no energy target, no deficit)              | ✕       | ·                                                 |
| Prefer not to say (pregnancy)           | ·             | ·                 | !                   | !                     | !     | ·                                             | ·       | ·                                                 |
| Heart condition or fainting history     | ↘             | ·                 | ✕                   | ✕                     | ✕     | ·                                             | ·       | ·                                                 |
| Does not tolerate heat                  | ·             | ·                 | ·                   | ✕                     | ✕     | ·                                             | ·       | ·                                                 |
| Does not tolerate cold                  | ·             | ·                 | ✕                   | ✕ (↘ warm shower)     | ·     | ·                                             | ·       | ·                                                 |
| Waiting on medical clearance            | ↘             | ·                 | ·                   | ·                     | ·     | ·                                             | ·       | ·                                                 |
| Under 18, no guardian agreement         | ·             | ·                 | !                   | ✕                     | ·     | ✕                                             | ✕       | ·                                                 |
| New, or no recent activity              | ↘             | ·                 | ·                   | ·                     | ·     | ·                                             | ·       | ·                                                 |
| Severe injury (onboarding or Train)     | ·             | ✕ for that region | ·                   | ·                     | ·     | ·                                             | ·       | ✕ → see a professional, if the programme loads it |
| Moderate injury                         | ·             | ↘ easier versions | ·                   | ·                     | ·     | ·                                             | ·       | ↘ easier versions                                 |
| Mild injury                             | ·             | ·                 | ·                   | ·                     | ·     | ·                                             | ·       | ↘ easier versions                                 |
| Counting has not helped (Food settings) | ·             | ·                 | ·                   | ·                     | ·     | ↘ numbers hidden, no deficit, no weight trend | ·       | ·                                                 |
| Clinician-prescribed diet (Food)        | ·             | ·                 | ·                   | ·                     | ·     | ✕ (enter the clinician's own)                 | ·       | ·                                                 |
| Contrast screening: any "yes"           | ·             | ·                 | ·                   | ! clinician clearance | ·     | ·                                             | ·       | ·                                                 |

Notes:

- **Under 18** is read conservatively from the birth year: if either onboarding or the Food
  settings say under 18, the person is treated as under 18.
- **Injury flags** come from two places — onboarding and Train's pain flags — and are merged
  in one list for every module.
- **A moderate or severe flag** also keeps the Reset's movement targets gentle.
- **Proof:** `src/domain/safety.test.ts`, `src/domain/eligibility.test.ts` (including the
  contradictions this stage removed), `src/domain/flexibility.test.ts`,
  `src/domain/nutrition.test.ts`, `src/domain/contrast-journal.test.ts`.

## 2. Ways out

Every module that asks the body or mind for effort shows a way to stop, on the screen where
it is needed, written once in `src/domain/stop-guidance.ts` and rendered by `StopGuidance`.

| Module                  | Stop control                                                                                | Guidance shown                                                                    | Modify path                                              |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Workout                 | Per-set pain ≥ 4 stops the exercise; "Stop here" ends the workout and keeps what was logged | Pain · dizzy or faint · chest pain or trouble breathing (open in the stop dialog) | Swap an exercise; easier version next time               |
| Flexibility             | "Stop — sharp, radiating or worsening pain" on screen throughout                            | Pain · dizzy                                                                      | Easier versions; skip a session with a reason            |
| Breathwork              | "Stop here" at any point                                                                    | Dizzy · distress; the four-line notice before every session                       | Slow patterns only (`isConservative`)                    |
| Meditation              | "Stop here" at any point                                                                    | Distress                                                                          | Shorter sessions                                         |
| Journal (daily, weekly) | Nothing is required; every field is optional                                                | Distress, with crisis-line wording                                                | Skip any prompt                                          |
| Food                    | Logging is optional                                                                         | Food or numbers feel stressful                                                    | Hide every number; counting-caution mode                 |
| Contrast therapy        | Stop button on screen the whole time; reason asked after                                    | Dizzy · chest · overheating · too cold; after-stop advice                         | Gentler protocol by default; turn off and delete history |
| Cold finish (Reset)     | Off unless chosen                                                                           | Too cold · dizzy · chest, inside the cold note                                    | Turn it off at any time                                  |

Crisis and support wording names only stable, widely published services: local emergency
numbers, 988 in the US for thoughts of self-harm, and the National Alliance for Eating
Disorders in the US. Chest pain or trouble breathing always says "call your local emergency
number now". **Proof:** `src/domain/eligibility.test.ts` ("stop guidance"), `e2e/trust.spec.ts`.

## 3. Where an explicit acknowledgement is asked for — and nowhere else

To avoid disclaimer fatigue, ARETE asks someone to tick "I have read this" only where the
risk is real and the person is about to choose it:

| Where               | What is acknowledged                | Versioned | Recorded in                                                      |
| ------------------- | ----------------------------------- | --------- | ---------------------------------------------------------------- |
| Reset → cold finish | The cold-water note (`COLD_NOTICE`) | Yes       | `safety_acknowledgements`, `audit_events`                        |
| Contrast therapy    | The screening and the safety notice | Yes       | `contrast_screenings`, `safety_acknowledgements`, `audit_events` |

Everything else states its limits plainly on the screen (the breathwork notice, the
flexibility pain rule, the nutrition safeguards) without asking for a tick. A changed notice
gets a new version, and the old acknowledgement no longer counts.

## 4. Claims ARETE never makes

| Never                                                  | How it is enforced                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Diagnosis ("you have…")                                | Reasons say "You told us…"; claims scan                                                                                        |
| Treatment or cure                                      | Claims scan (`cure`, `treats anxiety/depression/…`)                                                                            |
| Supplement prescribing                                 | Claims scan; the oil-awareness card says so explicitly                                                                         |
| Calorie targets for minors                             | `nutritionSafeguards` via `eligibility`; tested                                                                                |
| Guaranteed results                                     | Claims scan; the flexibility note says results vary                                                                            |
| IQ or intelligence claims for cognitive drills         | Claims scan; `domain/cognitive.ts` says practice does not transfer                                                             |
| Causal claims from correlations                        | Observations need 21 days and 7 per group, and say "does not show that one causes the other"; claims scan for "causes better…" |
| "Clinically/scientifically proven", "detox", "miracle" | Claims scan                                                                                                                    |

The claims scan is `src/trust/claims.test.ts`: it reads every non-test source file, skips code
comments, and fails on any of these words unless the same sentence negates it ("this is not a
diagnosis").
