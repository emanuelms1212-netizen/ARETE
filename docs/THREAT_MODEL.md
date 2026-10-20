# THREAT_MODEL.md

What ARETE protects, from whom, how, and what is still open. Written at stage 13 (the
safety, privacy, accessibility and trust pass) and updated whenever a boundary moves.

**Last reviewed:** 2026-10-20 · **Scope:** the app in `src/`, the schema in
`supabase/migrations/0001`–`0020`, and the Vercel deployment.

## 1. What is worth protecting

| Asset                                     | Why it matters                                          | Where it lives                                                                |
| ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Journal text                              | The most personal thing in the app                      | `daily_plans` (framing), `day_reviews`, `journal_entries`                     |
| Health answers                            | Pregnancy, heart history, heat/cold tolerance, injuries | `onboarding_answers` (step `health`), `health_profile`, `contrast_screenings` |
| Food and body data                        | Can signal disordered eating, pregnancy, illness        | `food_entries`, `meals`, `foods`, `hydration_logs`, `body_metrics`            |
| Training data with pain scores            | Injury history                                          | `workout_sessions`, `workout_logs`, `flexibility_*`                           |
| A religious or sacred practice reminder   | Belief is special-category data                         | `notification_preferences.sacred_*`                                           |
| Safety acknowledgements and the audit log | Evidence of what the person was shown and did           | `safety_acknowledgements`, `audit_events`                                     |
| The account itself                        | Takeover exposes all of the above                       | Supabase Auth                                                                 |

## 2. Who might attack, and how

| Actor                                       | Realistic goal                                      | Main path                                       |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Another signed-in user                      | Read or change someone else's rows                  | Crafted ids in server actions or the export API |
| An unauthenticated visitor                  | Read anything                                       | Direct requests to routes and the API           |
| A script or stuck client                    | Exhaust the export or delete paths                  | Repeated requests                               |
| A malicious page                            | Act as the user (CSRF, clickjacking), inject script | Cross-site forms, framing, injected content     |
| Someone with the person's device or session | Read the journal                                    | An unlocked phone                               |
| Us — the operators                          | Over-collect, leak through analytics or logs        | Telemetry, logs, support tooling                |

## 3. Controls, and how each is proven

### Authentication

- Supabase Auth handles sign-in only; ARETE never sees a password (`src/auth`). Demo mode
  answers with one fixed demo account and needs no credentials.
- Every page, action and route handler takes the user from the session (`getCurrentUser`),
  never from the request body or query. **Proof:** the export route, every `actions.ts` and
  every server `context.ts` call `getCurrentUser()`/`requireUser()` first.

### Authorisation (row-level security)

- Every table has RLS **enabled and forced**, with at least one policy, and every table that
  has a `user_id` scopes its policies to `public.current_user_id()`.
- Every table with a `user_id` is listed in `public.user_owned_tables()`, so export and
  deletion reach it.
- Cross-table ownership (a set on someone else's workout, a log on someone else's reset) is
  refused by security-definer guard triggers.
- **Proof, automated:** `src/persistence/rls.test.ts` — "is enabled and forced on every
  table", "gives every table at least one policy", "lists every table with an owner in
  user_owned_tables()", "scopes every owned table to the signed-in user in its policies",
  plus per-module cross-user tests (read, forge, update, delete, move ownership). The SQL
  adapter runs the whole repository contract _as the `authenticated` role_ under RLS.

### Input validation

- Every server action parses its input with Zod before touching the repository, and returns
  `{ ok: false, message }` rather than throwing on bad input. Dates are checked as ISO dates
  and against allowed windows on the server (`acceptDate`, `acceptRange`).
- The database repeats the rules it can: check constraints for ranges, enums, text lengths,
  and shapes (`notification_cap_range`, `daily_plan_virtue_known`, the audit `detail`
  pattern, and others in `docs/DATA_MODEL.md`).

### Abuse and rate limiting

- `src/lib/rate-limit.ts` limits export (20 per 10 minutes), per-feature deletion (20 per 10
  minutes) and account deletion (5 per hour) per person. The export API answers `429` with
  `Retry-After`. **Limitation:** in memory, per server instance — a speed bump, not a wall.
- Destructive actions need a typed confirmation (the phrase, or the part's name) checked on
  the server, not only by the disabled button.

### Browser-side

- Headers on every response: `Content-Security-Policy` (same-origin scripts, styles, fonts and
  connections plus the Supabase origin; `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that denies
  camera, microphone and location. **Proof:** `e2e/trust.spec.ts` checks the header and that
  no page logs a CSP violation.
- Server actions are POST-only with Next's built-in origin check; there are no GET routes that
  change state. React escapes all rendered text; there is no `dangerouslySetInnerHTML` of user
  content.

### Audit of sensitive actions

- `audit_events` records exports, per-feature deletions, health-answer changes, contrast
  screenings and safety acknowledgements: **what and when, never the content**. `detail` is
  constrained to a short machine word in the database and in both adapters.
- It is append-only for the person (select and insert granted, update and delete not), and it
  goes with the account on account deletion. Retention 400 days (`prune_audit_events()`).
- **Proof:** contract test "the audit trail"; RLS test "keeps the audit trail append-only".

### Logs and analytics

- Analytics is a no-op sink. Event schemas carry ids, counts, durations and enums only; extra
  fields are stripped before the sink; no event names food, weight, injury, health, journal or
  religion, and the module and reminder enums exclude contrast, cold, food and the sacred
  reminder. **Proof:** `src/analytics/analytics.test.ts`.
- Application code logs nothing about users. The only `console` call is a development-only
  warning about an invalid analytics payload.

### Files and photos

- ARETE stores no files or photos. The flexibility check-in deliberately does not keep photos
  (D82). There is no upload endpoint to attack.

### Export and deletion

- Export: everything the account holds, or a date range, as JSON, only the caller's rows.
- Deletion: everything at once (`delete_my_account()`, a cascade from `auth.users`), or one
  part (`delete_my_feature()`, security invoker, subject always `current_user_id()`).
  **Proof:** contract tests "deletes everything, and means it", "leaves nothing behind in the
  export after deleting everything", and "deleting one part of the account".

## 4. Findings from this pass

| #   | Finding                                                                                                                                                                                                                                | Severity | Status                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| F1  | Contrast therapy checked its own screening but not the onboarding answers that block heat and cold; a clean screening plus a clearance tick could start a session for someone who had said they were pregnant or had a heart condition | **High** | Fixed — central `eligibility()`; the onboarding answer wins (D118)                          |
| F2  | The Reset's cold finish could be switched on when cold exposure was blocked by health answers                                                                                                                                          | **High** | Fixed — offered only when the central rules allow it; dropped from targets otherwise (D118) |
| F3  | Two screens read the cold acknowledgement differently (current version vs any version)                                                                                                                                                 | Medium   | Fixed — one rule, current version only                                                      |
| F4  | The memory adapter's "delete everything" left goals, tasks, habits, the journal, mind sessions, onboarding and drafts behind                                                                                                           | **High** | Fixed, and a contract test now checks the export is empty afterwards                        |
| F5  | Analytics schemas allowed a free-string module id and reminder kind, so the sacred reminder or contrast therapy could be named                                                                                                         | Medium   | Fixed — enums that exclude them (D121)                                                      |
| F6  | The focus timer's live region read out the clock every second                                                                                                                                                                          | Medium   | Fixed — announcements every five minutes, the last minute and the end (D123)                |
| F7  | Inline links were distinguished by colour alone (WCAG 1.4.1)                                                                                                                                                                           | Medium   | Fixed — underlined                                                                          |
| F8  | At 200% text the header, the Today rows, the Reset ranges and loading skeletons pushed the page sideways                                                                                                                               | Medium   | Fixed — they wrap                                                                           |
| F9  | No content security policy                                                                                                                                                                                                             | Medium   | Fixed — CSP header (D124)                                                                   |
| F10 | No per-feature deletion, no audit trail, no rate limits                                                                                                                                                                                | Medium   | Fixed — D119, D120, D122                                                                    |

## 5. Open, and who owns it

| Risk                                                                              | Severity | Blocks release?         | Note                                                                                               |
| --------------------------------------------------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Safety rules, contrast screening and stop guidance not reviewed by a clinician    | **High** | **Yes — explicitly**    | Product owner + qualified reviewer. Recorded in `docs/SAFETY_MATRIX.md` and the ledger §7          |
| Nutrition targets not reviewed by a dietitian                                     | **High** | **Yes — explicitly**    | As above                                                                                           |
| The public demo deployment shares one demo account: anyone can change or clear it | Medium   | No (demo data only)     | Memory resets on restart; no real data is ever in demo mode                                        |
| Rate limits are per instance                                                      | Medium   | No, before scale yes    | Move to a shared store (e.g. Postgres or Redis) before more than one instance serves real accounts |
| `script-src 'unsafe-inline'`                                                      | Low      | No                      | Nonce-based CSP once the App Router nonce path is adopted                                          |
| `prune_audit_events()` is not scheduled yet                                       | Low      | Before 400 days of data | Schedule with pg_cron when the Supabase project exists                                             |
| No backup / restore procedure                                                     | Medium   | Before real users       | Depends on the Supabase project                                                                    |
| Screen-reader testing with VoiceOver/TalkBack by a person                         | Medium   | Before broader testing  | Automated axe and keyboard checks pass; a human pass is still needed                               |
| Session theft on an unlocked device                                               | Low      | No                      | An optional app lock for the journal is a later feature                                            |
