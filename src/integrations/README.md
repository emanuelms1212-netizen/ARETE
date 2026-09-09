# Integrations

External services live here, each behind an interface owned by `src/domain` or
`src/persistence`, so that no UI file ever imports a vendor SDK directly.

Nothing is wired up yet. This directory exists so that the first integration has
an obvious home and does not end up imported from a component.

| Planned                    | Stage    | Notes                                                  |
| -------------------------- | -------- | ------------------------------------------------------ |
| Supabase (Postgres + Auth) | 4        | Behind `DayRepository` and an `AuthProvider` interface |
| Push notifications         | 12       | Quiet by default; see PRODUCT_SPEC §8                  |
| Analytics provider         | post-MVP | Only behind explicit user opt-in; see `src/analytics`  |

Deliberately absent, and to stay absent: ad SDKs, session replay, third-party
trackers of any kind.
