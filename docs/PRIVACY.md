# PRIVACY.md

What ARETE collects, why, how long it keeps it, and how a person removes it. The in-app
version of this is **Settings → Privacy**. Security controls are in `THREAT_MODEL.md`.

## Minimum collection

- Onboarding asks only what a module needs, and every question can be skipped. It never asks
  for religion, ethnicity or body weight.
- Health questions are plain yes/no answers used for one thing: deciding what to offer
  (`SAFETY_MATRIX.md`). They are never used to diagnose and never shared.
- Weight is never asked for. It can be entered in Food's settings, if the person chooses to.
- The flexibility check-in does not keep photos (D82). ARETE stores no files.
- A practice reminder (for prayer or another sacred practice) is off unless chosen, holds at
  most 140 characters of the person's own words, and is never sent to analytics.

## Sensitive data

`DATA_FEATURE_INFO` in `src/domain/data-features.ts` marks each part of the account. The
**sensitive** ones — journal, food log, body weight, workouts (pain scores), health answers —
and anything religious are never sent to analytics, never logged, and never named in an
analytics event. Analytics is a no-op today; turning on a real sink will require an explicit
opt-in and the same schemas (`src/analytics/events.ts`).

## Retention

| Data                             | Kept                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Everything the person enters     | Until they delete it — one part at a time, or everything at once                             |
| The audit trail (`audit_events`) | 400 days, then removed by `prune_audit_events()` (to be scheduled with the Supabase project) |
| Demo mode                        | In memory until the server restarts; nothing is written anywhere                             |
| Database backups                 | On the host's schedule; deleted data is never restored into an account from a backup         |

## Deletion and export

- **One part:** Settings → Privacy. Journal, food log, body weight, workouts, flexibility,
  meditation and breathing, focus timer, programmes, health answers, reminder history. Each
  row says what goes and what stays; the part's name is typed to confirm. Implemented as
  `deleteFeatureData` in both adapters (`delete_my_feature()` in SQL).
- **Everything:** Settings → Your data, behind the typed phrase "delete everything".
  `delete_my_account()` removes the auth user and everything cascades from it.
- **Export:** Settings → Your data (everything) or Progress (a date range), as JSON.

Every export and deletion is immediate. Each is recorded in the audit trail as an action and
a date — never what was exported or deleted.
