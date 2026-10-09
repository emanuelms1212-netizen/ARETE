# DESIGN_SYSTEM.md

Quiet Stoic modernism. Ink and charcoal, warm parchment, restrained bronze, stone grey,
one calm success colour.

Stoic here means _restraint_ — in what the app asks for, what it notifies about, and what
it claims. It does not mean marble, columns, laurels or Latin. There are none in this
system and there will be none.

**Source of truth:** `src/design/tokens.ts`. `src/app/globals.css` declares the same values
as CSS custom properties, and `src/design/tokens.test.ts` parses that file and fails if the
two disagree. Neither can drift.

**Rendered:** `/styleguide` — every primitive in every state, both palettes, with the
contrast numbers computed live. It 404s in production builds.

---

## 1. Colour

Fourteen tokens per theme. Dark is its own palette, not an inversion.

| Token         | Light     | Dark      | Used for                          |
| ------------- | --------- | --------- | --------------------------------- |
| `canvas`      | `#F4F1EA` | `#14151A` | Page background                   |
| `surface`     | `#FBF9F4` | `#1C1E24` | Cards, sheets, header             |
| `sunken`      | `#EAE5DA` | `#101116` | Wells, skeletons, inactive track  |
| `ink`         | `#1B1A17` | `#ECE8E0` | Primary text                      |
| `inkMuted`    | `#5C584E` | `#A49E92` | Secondary text                    |
| `line`        | `#DAD3C5` | `#2C3038` | Decorative separators             |
| `lineStrong`  | `#86806F` | `#6E7682` | Stone grey. Control boundaries    |
| `accent`      | `#8A5423` | `#D29B5E` | Restrained bronze. The one accent |
| `accentSoft`  | `#F0E4D5` | `#2A2118` | Selected states                   |
| `onAccent`    | `#F4F1EA` | `#14151A` | Label on a filled accent surface  |
| `success`     | `#2F6155` | `#84B7A9` | Completion                        |
| `successSoft` | `#DDEAE6` | `#172622` | Completion chips                  |
| `warn`        | `#8A3F1F` | `#E0906A` | Safety notices and errors         |
| `focus`       | `#8A5423` | `#D29B5E` | Focus indicator                   |

**Rules.**

- **One accent.** Bronze. If a second accent ever seems necessary, the layout is wrong.
- **`success` is not a reward.** It marks what happened. It never celebrates, and there is
  no colour in this system for failure — a missed day is rendered in the ordinary muted ink
  like any other quiet fact.
- **`warn` is for safety and errors only.** Never for a missed day, a skipped session, or
  being behind on a program.
- **Colour never carries meaning alone.** Every status dot is paired with a word; the
  current nav destination has `aria-current`, a filled chip and a heavier label as well as
  colour.

### Measured contrast

Twenty-four colour pairs are listed in `tokens.ts` with the threshold each must clear, and
every one is asserted in both themes — 48 assertions. Nothing is assumed.

| Threshold       | Applies to                                               | Value |
| --------------- | -------------------------------------------------------- | ----- |
| `text`          | Body text and anything under 18.66px bold / 24px regular | 4.5:1 |
| `largeTextOrUi` | Large text, control boundaries, focus indicators         | 3:1   |

Worst cases as built: `accent` on `accentSoft` at **4.97:1** (light) and `lineStrong` on
`sunken` at **3.14:1** (light). Both clear their threshold.

`line` is the single exempt token: it separates and carries no meaning, so WCAG sets no
ratio for it. A test asserts that every _other_ token appears in at least one verified pair,
so a colour cannot quietly escape the check by never being listed.

## 2. Typography

| Face                  | Where                                       | Why                                                                                          |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Fraunces Variable** | Display: `h1`, metric values, dialog titles | An editorial serif with weight and warmth; it carries the one moment of voice on each screen |
| **Inter Variable**    | Everything else                             | Reads at small sizes on a phone, which is most of the product                                |

Both are self-hosted from `@fontsource-variable/*` and shipped with the app. A PWA should
not need a third-party request to render its own text, and self-hosting keeps the build
working offline and behind a proxy. Only the Latin subset is ever downloaded —
`unicode-range` handles the rest.

| Step        | Size      | Line height | Face     |
| ----------- | --------- | ----------- | -------- |
| `display-1` | 2rem      | 1.12        | Fraunces |
| `display-2` | 1.5rem    | 1.2         | Fraunces |
| `display-3` | 1.1875rem | 1.3         | Fraunces |
| `body-lg`   | 1.0625rem | 1.55        | Inter    |
| `body`      | 0.9375rem | 1.6         | Inter    |
| `body-sm`   | 0.8125rem | 1.5         | Inter    |
| `label`     | 0.75rem   | 1.35        | Inter    |

One `h1` per screen, always `display-1`, always in `PageHeader`.

## 3. Space, radius, shadow

**Spacing** is Tailwind's 4px scale, unchanged — redefining it would have bought nothing.

**Radius:** `sm` 6px (inputs, chips) · `md` 10px (fields, launcher rows) · `lg` 14px (cards)
· `xl` 20px (sheets, dialogs) · `full` (buttons, nav chips, status dots).

**Shadow** says "this floats above the page" and nothing else. Two values:
`raised` for the selected segment of a control, `overlay` for sheets, dialogs and the
command launcher. **Cards have no shadow.** Depth here is a border and a surface change.

## 4. Motion

| Token                                     | Value                            | Used for                  |
| ----------------------------------------- | -------------------------------- | ------------------------- |
| `--duration-fast`                         | 120ms                            | Hover, colour change      |
| `--duration-base`                         | 200ms                            | Fades, ring progress      |
| `--duration-slow`                         | 360ms                            | Sheet and dialog entry    |
| `--duration-breath-in` / `-hold` / `-out` | 4s / 2s / 6s                     | The breathing pacer       |
| `--e-standard`                            | `cubic-bezier(0.2, 0, 0, 1)`     | Entering, settling        |
| `--e-exit`                                | `cubic-bezier(0.4, 0, 1, 1)`     | Leaving                   |
| `--e-breath`                              | `cubic-bezier(0.37, 0, 0.63, 1)` | Breathing, skeleton pulse |

No confetti. No streak flames. No bouncing. Nothing pulses to demand attention — the
skeleton pulse is the one repeating animation in the product, and it exists to say "still
loading", not "look here".

### Reduced motion

Under `prefers-reduced-motion: reduce` every animation and transition collapses to 0.01ms.

The breathing ring is handled separately and deliberately: collapsing its animation would
leave it frozen at an arbitrary scale. Instead the ring **stops and rests at full size**,
and the written cue — which is driven by a separate timer, not by the animation — keeps the
pacing. The practice still works without motion. An end-to-end test asserts the ring's
computed `animation-name` is `none` under reduced motion, and that the cue is still there.

## 5. Components

Everything lives in `src/components/ui`, exported from one index.

| Component                              | Note                                                        |
| -------------------------------------- | ----------------------------------------------------------- |
| `PageHeader`                           | The one `h1`. Eyebrow, title, lede, action, meta            |
| `Section`                              | A titled card. Decides title/hint/body spacing once         |
| `Card`                                 | Surface or sunken; `raised` is opt-in                       |
| `Metric`                               | One number, said plainly. No sparkline, no delta chip       |
| `ListRow` + `StatusDot`                | Interactive **only** when given an `href`                   |
| `Button`                               | `primary` / `quiet` / `ghost`, two sizes, loading, disabled |
| `EmptyState` / `ErrorState`            | One component, so tone cannot drift                         |
| `SafetyNotice`                         | The one surface every risky module must use                 |
| `FormField` + `TextInput` / `TextArea` | Label, hint and error wired to the control                  |
| `SegmentedControl`                     | Real radios in a fieldset — arrow keys come free            |
| `Dialog` / `ConfirmDialog`             | Native `<dialog>`: focus trap, Escape, inertness            |
| `ToastProvider` / `useToast`           | Polite live region, auto-dismiss, max three                 |
| `TimerRing`                            | Geometry only; the number inside is the accessible content  |
| `FocusTimer`                           | Wall-clock driven, so backgrounding cannot drift it         |
| `BreathingRing`                        | Four in, two held, six out                                  |
| `Skeleton` / `SkeletonText`            | The only loading primitive                                  |

### Icons

`src/components/icons` — fourteen icons drawn in the repository, 24px grid, stroked,
`currentColor`, every one `aria-hidden`. No icon package: a dependency would bring a house
style with it, and these needed to be subtle geometric linework.

The ARETE mark is an **open ring** — attention held, with a way out.

## 6. Non-negotiables

A change that breaks one of these is a change to the product, not to the styling.

1. **No control that does nothing.** A `ListRow` without an `href` is not pressable. A
   module that is not built says so in words instead of showing a disabled button.
2. **Visible focus, always.** `:focus-visible` draws a 2px `focus` ring at 2px offset. It is
   never removed, only inset (`.focus-inset`) where a radius demands it.
3. **44px minimum touch target**, at every size of every control.
4. **Four states per screen**: loading, empty, error, success. No screen ships with fewer.
5. **320px to desktop with no horizontal overflow.** Asserted at 320, 390, 768 and 1440.
6. **No shaming copy.** No "failed", "broke", "lost", "streak" about a missed day, and no
   exclamation marks. There is a unit test over every branch of the day description.
7. **One `h1` per screen**, from `PageHeader`.
8. **Semantics before ARIA.** Radios for a segmented control, `<dialog>` for a dialog,
   `<nav>` for navigation. ARIA only where the platform runs out.

## 7. What this system deliberately does not have

Gradients · glassmorphism · gold · marble · decorative shadow · a second accent ·
a "danger" red used for anything other than safety · icon-only buttons without labels ·
progress bars that fill on page load · any animation that loops to attract attention.
