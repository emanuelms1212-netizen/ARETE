# REPO_HEALTH.md

State of the repository at the end of stage 2, with every claim tied to a command that was
actually run on 2026-09-09.

## Where the repository started

| Item | Finding |
| --- | --- |
| Contents of `main` | `README.md` (one line: "# Project") and `.gitignore`. Nothing else |
| Commits | 1 — "Initial commit: empty scaffold" |
| Branches | `main` and `build/prompt-pack-v1`, both at the same commit |
| `package.json` | Absent |
| Lockfile | Absent |
| Tests, CI, migrations, design system | None |
| Uncommitted work from the earlier Codex session | **None reachable.** Never pushed |

Every command the previous stage reported as blocked — dev, build, lint, typecheck, unit,
E2E — was blocked for the same reason: there was no `package.json`.

## What runs now

| Command | Result | Detail |
| --- | --- | --- |
| `npm install` | Pass | 459 packages, clean install from an empty `node_modules` |
| `npm run format:check` | Pass | "All matched files use Prettier code style" |
| `npm run lint` | Pass | No errors, no warnings |
| `npm run typecheck` | Pass | `tsc --noEmit`, strict |
| `npm test` | Pass | 7 files, **37 tests** |
| `npm run build` | Pass | 9 routes; 8 static, `/api/health` dynamic |
| `npm run dev` | Pass | Serves `/today` |
| `npm run e2e` | Pass | **14 tests**, phone and desktop projects |

### Where the E2E suite was run, and why it matters

The Linux workspace on this machine has **no browser and cannot download one** —
`cdn.playwright.dev` is blocked by the network allowlist ("Connection blocked by network
allowlist", HTTP 403). The suite was therefore executed in a separate Linux environment with
Chromium already present, against the same source tree and the same production build.

Two consequences, both recorded rather than papered over:

1. `npm run e2e` **cannot be run on this machine as configured.** It runs in CI, where
   `npm run e2e:install` fetches Chromium normally. Anyone working locally behind the same
   allowlist should expect the same block.
2. The run surfaced a real configuration bug, now fixed: the `phone` project used
   Playwright's `iPhone 14` descriptor, which defaults to **WebKit**, while
   `e2e:install` installs **only Chromium**. In CI that project would have failed to launch.
   The phone project is now Chromium at a 390 × 844 touch viewport.

## What failed during the stage, and how it was resolved

| Failure | Cause | Resolution |
| --- | --- | --- |
| `eslint` crashed with `contextOrFilename.getFilename is not a function` | `eslint-plugin-react`, bundled inside `eslint-config-next`, calls an API removed in ESLint 10 | Pinned ESLint to 9.39.5. Recorded as ledger decision D4 |
| `typescript-eslint does not support TS 7.0` on any lint run | TypeScript 7 is released; typescript-eslint has not shipped support | Pinned TypeScript to 6.0.3. Recorded as D3 |
| Vitest could not parse TSX | Next requires `jsx: "preserve"` in tsconfig; Vitest had no JSX transform | `oxc.jsx.runtime: 'automatic'` in `vitest.config.mts`. No extra plugin needed (D8) |
| `git clone` into the connected folder failed | The sandbox cannot unlink files there, and git needs to remove its own lock files | The working repository lives in a scratch checkout; the tree is mirrored into the connected folder. See "Known friction" below |
| Playwright browser download | Blocked by the network allowlist | Ran the suite in an environment that already had Chromium |

## Missing configuration

| Missing | Needed by | Blocking now? |
| --- | --- | --- |
| Supabase project, URL and keys | Stage 4 | No — demo mode is self-sufficient |
| Hosting target and deploy pipeline | Stage 4+ | No |
| CI secrets | None yet; CI runs entirely on public inputs | No |
| Push credentials for this machine | Pushing the branch | **Yes, for `git push` only** |

## Security review

| Check | Result |
| --- | --- |
| Secrets in the tree | None. `.env.example` holds placeholders and empty values only |
| `.gitignore` covers `.env*` | Yes, with `!.env.example` |
| Server-only variables prefixed `NEXT_PUBLIC_` | None — `SUPABASE_SERVICE_ROLE_KEY` is deliberately unprefixed |
| Production identifiers committed | None |
| Third-party analytics, ad SDKs, session replay | None, and none permitted |
| Security headers | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` denying camera, microphone and geolocation |
| `x-powered-by` | Disabled |
| `/api/health` payload | Name, version, mode, stage, timestamp. No hostnames, no credentials |
| Free text in analytics payloads | Structurally impossible — asserted across every event schema by a test |
| `npm audit` | Not run — the network allowlist blocks the advisory endpoint from this machine. CI should run it |

## Known friction on this machine

`git` cannot operate inside the connected folder: the sandbox refuses to unlink files there,
and git needs to remove its own lock files. The working repository therefore lives in a
scratch checkout, and the tree is mirrored into the connected folder so that the files are
on disk where the user expects them.

One consequence: a partial `.git` directory from the failed clone attempt remains inside the
connected folder — `config.lock` and a stray temporary file. They are harmless for commits
but should be deleted by hand.

## Next reversible action

Stage 3 — the design system and application shell. It touches presentation only: no data
model, no schema, no migration, nothing that cannot be reverted with `git revert`.
