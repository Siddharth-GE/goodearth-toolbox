# Goodearth Toolbox — design system

The shared visual language every tool is built from. Direction, since
the 2026-09-17 skin: **Aman meets Apple — stone, air, glass,
precision.** Warm, not cold. Minimal, not bare. Aman is the calm: warm
stone neutrals, hairlines, whitespace, spaced small capitals. Apple is
the precision: clear hierarchy, frosted bars, one confident title, and
motion that behaves like a physical thing — a press, a lift, a pop —
and then stops.

The mode is _operate_: someone is here to finish a task. Expression
never obscures the task, the state or a familiar control; the brand
lives in the details, not on top of them.

Every screen is built from `components/ui/*`. Never hand-roll a button,
input, card, or badge — extend the shared component instead. If a
pattern repeats twice across tools, it belongs here, not copy-pasted.

## Color

Defined as CSS variables in `app/globals.css`, registered in
`@theme inline` so every one is a Tailwind utility
(`bg-accent`, `text-danger`, `border-border`, etc.) — never hardcode a
hex value in a component.

### Three tones, not two

The neutrals are warm stone. In light mode the page is **linen**
(`background`), a card is **paper** (`surface`) and anything that floats
or takes typing is **white** (`surface-raised`). Dark mode is the same
idea in warm charcoal. Three tones is what lets a card read as a card
with only a hairline around it — no shadow at rest (see _Material_).

| Token                                                       | Light              | Dark      | Meaning                                                                   |
| ----------------------------------------------------------- | ------------------ | --------- | ------------------------------------------------------------------------- |
| `background`                                                | `#f4f2ee`          | `#141311` | Page canvas, and the sidebar rail (one material)                          |
| `surface`                                                   | `#fcfbf9`          | `#1a1a17` | Cards, tables, the figure band                                            |
| `surface-raised`                                            | `#ffffff`          | `#232220` | Inputs, secondary buttons, menus, dialogs — what floats or takes typing   |
| `border`                                                    | `#e5e1da`          | `#2b2a26` | Hairlines. Floating layers use `border-border/60`, the rail `/60` too     |
| `foreground`                                                | `#1d1c19`          | `#efede8` | Primary text — and the "ink" of the active nav pill                       |
| `muted`                                                     | `#726f69`          | `#9b978f` | Secondary text, captions, labels, placeholders (`/70`)                    |
| `accent` / `accent-foreground`                              | unchanged          | unchanged | The one brand action colour (green). Primary buttons, links, active icons |
| `success` / `warning` / `danger` / `info` (+ `-foreground`) | unchanged          | unchanged | Fixed-meaning status colours — pills, inline messages, alerts             |
| `shadow-float`                                              | soft ambient, warm | deeper    | The one shadow. Means "this is floating" and nothing else                 |

**Nav is ink, accent is action.** Tabs, nav pills and the sidebar's
active row are foreground-on-surface, never green. Green is reserved for
the primary button, links, the active nav _icon_ and the focus halo, so
the eye always finds the one thing to press. Hover and highlight tints
are `bg-foreground/[0.05]` (rows `/[0.025]`, chips `/[0.04]`) — a
foreground alpha is right in both modes by construction, which is why
the old `hover:bg-black/… dark:hover:bg-white/…` pairs are gone.

`--surface` in dark mode is deliberately still `#1a1a17`: the chart
palette below was measured against it.

### Light and dark

Both palettes live in `app/globals.css` and nowhere else. Dark is reached
two ways, in this order:

1. `data-theme="dark"` (or `"light"`) on `<html>` — an explicit choice,
   made with the switch in the sidebar's user menu and on the login
   screen (`components/ui/theme-toggle.tsx`), remembered in a cookie and
   applied by a blocking inline script in the root layout before the page
   paints.
2. `prefers-color-scheme`, for anyone who never touches the switch.

Three things follow from that, and each has bitten already:

- **`@custom-variant dark` in `globals.css` teaches Tailwind the same two
  rules.** Without it `dark:` utilities stay on the browser's media query
  and ignore the switch — a dark page with light badges on it.
- **The dark token block is written out twice**, once per selector,
  because CSS cannot share a declaration block across a media query.
  Change a value in one and change it in the other — including
  `--shadow-float`.
- **`color-scheme` is declared next to the tokens, not as an
  afterthought.** It is what makes the browser's own furniture follow —
  date pickers, number steppers, select menus, scrollbars. The app
  shipped ~30 forms with a white calendar popup on a dark page for want
  of that one line, and no test or build can see it.

`lib/theme.ts` holds the whole rule as pure functions, so the layout's
script and the switch agree on what a valid value is. An unrecognised
cookie means "follow the device", never a guessed colour — someone stuck
in a theme they cannot read cannot find the switch either.

**Don't move the cookie read into the layout body.** It reads tidier and
costs the app static rendering: calling `cookies()` there turns `/login`,
`/_not-found` and `/_global-error` from prerendered into
server-rendered-on-demand — measured, not guessed — and cold starts are
the app's one measured performance problem: warm time-to-first-byte is
~0.2s and a cold start is ~1.0s.

The `themeColor` values in `app/layout.tsx` are quoted from
`--background` and must move with it, or a phone's address bar stops
matching the page.

Two things deliberately do **not** follow the theme: PDFs
(`lib/pdf/theme.ts` is a separate print palette) and the logo
(`components/ui/logo.tsx` is brand artwork).

`lib/color-hash.ts`'s 7-color palette (used for avatar initials, the
item thumbnails in `components/masters/item-thumb.tsx`, and the
catalogue's no-image placeholder tiles) is a separate, deliberate
system — colors are picked _by hashing a name_, not by meaning, so it
stays a plain JS array rather than a token. Don't confuse it with the
semantic colors above, or with Marathon's category badges — those carry
a third, independent palette keyed on a colour name stored in the
database (`category-badge.tsx`, `bib-card.tsx`), which must stay a
static class lookup and does not use `color-hash`.

The palette is fixed, but how it is _applied_ is not: one set of colours
has to sit on a white tile and a near-black one. `item-thumb.tsx` passes
the hash colour in as a `--thumb` custom property and lets the mode pick
the tint weight and lift the text, because at the light recipe the tint
vanished on dark and the blue and indigo codes were close to unreadable.
Adding another surface that paints with a hash colour needs the same
treatment — check it on both, the colour itself will not tell you.

`--gradient-hero-from/via/to` (also in `app/globals.css`) is a third,
purely decorative system — the gradient behind a tool's hero number
(Marathon's `HeroCounter`). Not brand, not semantic, but still a CSS
variable rather than a hardcoded hex in the component, so it's one
place to change rather than a silent exception to "colors are tokens."

### The chart palette — the fourth colour system

`--chart-1` … `--chart-8` (both modes in `app/globals.css`) are the
categorical series colours, assigned by `lib/charts/palette.ts`. **The
slot order is a measured accessibility mechanism, not a taste choice**
— validated on this app's real chart surfaces for colour-blind and
normal-vision separation and for contrast in dark mode, with two other
orderings measured and rejected. Never re-order the list by eye;
re-measure and pick only among passing orders. The rules that ride on
it: single-series and emphasis charts use `--accent` (so most charts
read as Goodearth green); eight series is the ceiling and the tail
folds into "Other"; status colours are **never** issued as series
colours; and no pie or donut, ever — part-to-whole is a stacked bar, a
two-slice pie is a meter.

Chart marks follow one spec, carried by `components/ui/chart/*`: thin
bars with 4px rounded data-ends anchored to the baseline, gaps between
adjacent bars and stacked segments, 2px lines with gaps at nulls (a
missing value is never drawn as zero), hairline grid in `--border`,
axis labels in `--muted`, tooltip on `surface-raised`. **Screens use
those wrappers and never import Recharts directly** — the wrappers pass
colours as CSS-variable tokens, which Recharts hands straight to SVG,
so light/dark swap in one file and the no-hex rule holds. Every chart
in Reporter renders beside its own table, so colour never carries a
value alone.

## Typography

Geist Sans throughout (already loaded in the root layout). **One
typeface, used with more range** — the founder's choice over a second
face for headings (2026-09-17). The calm comes from weight, tracking
and air. A named scale — use these combinations, not arbitrary sizes:

| Purpose                        | Classes                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Display (big greetings)        | `text-4xl md:text-5xl font-semibold tracking-tight text-balance` |
| Page Title (`PageTitle`)       | `text-2xl font-semibold tracking-tight text-balance`             |
| Dialog Title / Section heading | `text-lg font-semibold tracking-tight` / `text-[15px] …`         |
| Section Label                  | `text-[11px] font-medium uppercase tracking-[0.14em] text-muted` |
| Body                           | `text-sm text-foreground`                                        |
| Body Muted                     | `text-sm text-muted`                                             |
| Caption                        | `text-xs text-muted`                                             |

The Section Label is the one label style in the app — sidebar groups,
table headers, `Figure` labels, `ResultPanel` and `ChartCard` titles all
use it. It is lighter and wider than it used to be (medium, not
semibold; `0.14em`, not `widest`) — that is the Aman note, do not
re-embolden it locally.

**Numbers.** A standalone figure (`Figure`, the pipeline counts, the
chart meter) is Geist Sans with `tabular-nums` — digits line up, and it
reads as a headline, not a printout. Amount **columns in tables** keep
`font-mono` — a ledger convention that is worth keeping: a column of
money in monospace reads as a column of money. Both are right; do not
"fix" one into the other. References (`IND-0001`, item codes) are mono.

## Spacing & radius

- Controls (buttons, inputs, selects): `rounded-xl`, `h-11` for
  full-size fields, `h-8`/`h-10`/`h-12` for button sizes.
- Cards, tables, the figure band, empty states: `rounded-2xl`.
- Floating layers (dialogs, the phone drawer): `rounded-3xl`; menus
  `rounded-xl`; icon chips `rounded-lg`/`rounded-xl`; pills and
  avatars `rounded-full`.
- Page padding: the dashboard container is
  `mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-10`
  (`app/(dashboard)/layout.tsx`). Section rhythm: `space-y-4` inside
  forms and on most screens, `space-y-8` between the home page's
  blocks, `space-y-2` / `space-y-2.5` between list rows.
- Card padding: `p-5` (Section, cards), `p-6 md:p-8` for the welcome
  card, `p-10` for an empty state.
- Kiosk-width screens (Marathon's whole layout is one): `max-w-[480px]`
  on the outer shell (`app/marathon/layout.tsx`), `max-w-[220px]` for a
  centered PIN pad (`pin-pad.tsx`). These are deliberate — a phone-width
  kiosk column, not arbitrary numbers — carry them forward for any other
  tool that's genuinely a single-device kiosk rather than a desktop
  dashboard screen.

## Material — hairlines at rest, float only when floating

Depth is carried by hairlines and the three tones, not by elevation. A
card at rest has `border-border` and no shadow. The only shadow in the
system is `shadow-float`, and it appears on exactly the things that
float: dropdown menus, dialogs, the phone drawer, and a linked card
while it is lifted under the cursor. Do not add `shadow-sm`/`shadow-lg`
anywhere; if something needs to look raised, it is either floating
(`shadow-float`) or it is on `surface-raised`.

Sticky bars are frosted glass: `bg-background/80 backdrop-blur-xl` with
a `border-border/60` hairline (the phone top bar; Marathon's
`PageHeader` is the kiosk version). A browser without backdrop-filter
just shows the translucent bar, which still reads.

Inputs sit on `surface-raised` (white on linen) and focus with a soft
halo — `focus:border-accent focus:ring-4 focus:ring-accent/15` — rather
than a hard 2px ring. Buttons focus with `ring-4 ring-accent/25` and no
offset. Badges wear a hairline of their own colour
(`ring-1 ring-inset ring-current/10`) so a tint never floats loose.

## Motion — a vocabulary, not a licence

Motion is a small fixed vocabulary, defined once in `app/globals.css`
and used through the primitives. Nothing else moves. The words:

- **Press** — every `Button` and `IconButton` scales to 0.98 / 0.95 on
  `:active`, over 150ms. A transition on the element, not a keyframe.
- **Lift** — a linked card (`<Card interactive>`) rises 2px, its hairline
  darkens and it picks up `shadow-float`, over 200ms.
- **Pop** — dialogs and menus enter with `pop-in` / `menu-in` (fade +
  scale from 0.96, 200ms) and leave with `pop-out` (160ms). Radix keeps
  the closing element mounted for the exit, so the primitives only need
  `data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out`.
- **Sheet** — on a phone (`max-sm:`) a dialog is a bottom sheet:
  `sheet-in` / `sheet-out`, `max-h-[90dvh]`, scrolls inside, footer
  reachable.
- **Slide** — the phone drawer: `slide-in-left` / `slide-out-left`.
- **Wait** — `Spinner` fades in after 160ms so a fast page never flashes
  a spinner (the fade is on a wrapper, not the ring — see _Loading_).
- **Crossfade** — the theme switch, 220ms via the View Transitions API.

Two easings carry all of it: `ease-out-quint` (everything above) and
`ease-spring` (reserved, unused so far — for a future moment that wants
a hint of overshoot). Durations are 150–280ms; nothing in the shell is
slower than 300ms. Every keyframe is a `--animate-*` entry in
`@theme inline`, so it is a utility, and **every custom shadow, ease
and animate name is also listed in `lib/utils.ts`** — `tailwind-merge`
does not know them otherwise, and `cn("shadow-float", "shadow-none")`
would keep both. `lib/utils.test.ts` pins that.

Don't add motion outside this vocabulary "to make it feel nice". A new
word needs the argument written here first.

**Relay is the one stated exception, and it stays one.** In that tool
moving a baton _is_ the product, and the reward for moving it is the
adoption strategy — a relay nobody enjoys opening tracks nothing. So
Relay gets four keyframes of its own (`relay-breathe`,
`relay-float`, `relay-banner`, `relay-confetti`), all namespaced,
all confined to `app/(dashboard)/relay/`. The one worth copying is
`relay-breathe`: a stuck trail **breathes rather than blinks**, because
the signal has to be unmissable _and_ calm — an alarm that fires on a
third of the board every morning is an alarm everyone learns to ignore.
Don't extend this licence to another tool without the same argument.
Marathon keeps `card-in` (the bib card's entrance) and its
`AnimatedReveal` for the same reason on its own kiosk.

**`prefers-reduced-motion` is honoured globally** (bottom of
`globals.css`), and it covers every word above and every tool: someone
who has asked their operating system for stillness gets it. Dialogs,
menus and the drawer simply appear; confetti, the banner and the points
float are skipped outright rather than merely shortened; the toast still
appears, because they should still learn the push worked. The one
opt-out is `Spinner`, via the `spinner-keeps-turning` class — a spinner
that stops looks like a broken page, and it is a functional signal
rather than decoration.

**The light/dark switch crossfades** (220ms) rather than snapping, via
the View Transitions API — one call in `theme-toggle.tsx`, paced by two
rules in `globals.css`. The browser fades a snapshot of the whole page,
so background, text, borders and the switch's own icon all change
together for no state and no library. A browser without it applies the
change instantly, which is a working switch either way.

Two traps live here. **Don't reach for a `transition` on colours
instead** — it would fade every other colour change in the app, every
hover and every focus ring, and make the whole interface feel soggy.
The press and lift transitions are on transform, border and shadow for
exactly that reason. And **the global reduced-motion block does not
cover this**: it selects `*`, and `::view-transition-*` are
pseudo-elements outside the document tree that `*` never matches. They
are named again in that block, and the switch also checks
reduced-motion in JavaScript before asking for a transition at all.

## Loading states

`Spinner` (`components/ui/spinner.tsx`) — a thin spinning ring in the
accent colour — is the one loading indicator in the app. It waits 160ms
before fading in, so a page that answers quickly never flashes one. The
fade lives on a wrapper `<div>` and the spin on the ring, on purpose:
the reduced-motion rule for `.spinner-keeps-turning` forces a single
`animation-duration`/`iteration-count`, and two animations on one
element would have made the fade loop forever.

This is a functional signal, not decorative motion, so it isn't subject
to the vocabulary above: every tool's route segment gets a `loading.tsx`
that renders `PageLoading` (`components/ui/page-loading.tsx` — the one
centered-spinner layout; `tall` for kiosk routes), and any individual
widget that fetches its own data inside an otherwise-fast page wraps in
`<Suspense fallback={<Spinner />}>` (see the home page) rather than
blocking the whole screen. Add both as a matter of course for every new
tool — don't leave a tool without a `loading.tsx`. For a small inline
spinner (inside a button, a search result list), override the size and
border with `className`, e.g. `<Spinner className="size-4 border-2" />`,
rather than reaching for a different icon.

## Icons

`lucide-react`. Small, tree-shakeable, line-icon style that matches the
rest of the system. Size icons to match the text they sit next to
(`className="size-4"` inline with text-sm, `size-5` for buttons, `size-6`
in the welcome card's chip). A tool's icon chip is `bg-accent/10
text-accent` — the one place green appears that is not an action.

## Interactive primitives

`Dialog`, `DropdownMenu` and `Tabs` in `components/ui/` are thin,
Tailwind-styled wrappers around Radix UI's headless primitives
(`@radix-ui/react-*`) — same visual language as everything else, but
correct focus-trapping/ESC/ARIA behavior for free instead of hand-rolled.
`Dialog` is a centred `rounded-3xl` card on a laptop and a bottom sheet
on a phone (the `max-sm:` overrides in `dialog.tsx`); every Masters
form already benefits. The sidebar's phone drawer uses the raw Radix
dialog with its own slide, not `DialogContent`.

`Tabs` is for switching between content panels on the _same page_ —
no navigation, no URL change. It is **not** what Marathon's admin nav
needs, since Entries/Members/Groups are separate routes, not panels of
one page. For pill-style _route_ navigation, use `NavTabs` (same file,
same ink-pill styling, built from `next/link` instead of Radix) —
Marathon's admin nav is the reference implementation.

## Component inventory

Built: `avatar`, `badge` (+ status variants), `button`, `card`
(+ `interactive`), `checkbox`, `dialog`, `dropdown-menu`, `empty-state`,
`form-message`, `icon-button`, `input`, `label`, `page-loading`,
`page-title`, `pagination`, `select`, `spinner`, `table`, `tabs`
(+ `NavTabs`), `textarea`, and the `chart/` family (`chart-card`,
`chart-theme`, `bar-chart`, `line-chart`, `stacked-bar`, `meter`) — thin
themed wrappers over Recharts (the meter is a CSS bar, deliberately not
Recharts); see "The chart palette" above for the rules they carry.

`PageTitle` vs `PageHeader`: `PageTitle` is the static h1/description/
back-link block every dashboard screen starts with (the back link is an
`ArrowLeft` icon plus label); `PageHeader`
(`app/marathon/_components/page-header.tsx`) is the sticky,
backdrop-blurred bar for kiosk screens with real scroll length
(Marathon). Don't hand-roll either.

Shared domain components live in `components/masters/`: `item-thumb`,
`project-picker`, `site-picker`, `catalogue-picker` and
`record-form-dialog` — the create/edit shell every Masters record uses.

Cross-tool screen compositions live in `app/(dashboard)/_components/`:
`tool-welcome` (the screen every Operations and Management tool opens
on), `tool-grid` (the home page's grouped grid of every tool the person
can open — the same `visibleTools` rule as the sidebar, so a card and a
nav row never disagree), `operations-pipeline`, `people-overview`,
`marathon-live-card`, `coming-soon`. **The home page shows only what is
real** (founder, 2026-09-17): five panels of invented numbers were
deleted rather than restyled. A panel returns when a tool can feed it
truthfully, through a money-free read in `lib/overview/queries.ts`.

**`Figure` and `Section` were the rule working.** A label-over-a-number
block had been hand-written thirteen times across the app and a
card-with-a-heading five times in Business Planning alone, drifting into
four different label styles. Both are now in `components/ui`:

- `Figure` — `{ label, value, hint?, tone?, size? }`. `size` is the
  point of it: `sm` / `lg` / `hero`. A screen where every number is
  `text-sm` has no hierarchy and never says which figure is the answer.
  With `FigureBand` + `FigureBandCell` for a divided row of them, and
  `ResultPanel` for the block a form uses to show what it worked out.
- `Section` — `{ title, note?, aside?, collapsible?, defaultOpen?,
nested? }`, plus `FieldRow` for a group of fields at a column count
  that suits how many there are. `nested` recesses it onto `background`
  for use inside another `Card`.

Only Business Planning uses them so far. The copies in the other tools
are fine where they are; convert one when you are next in it for another
reason, not as a sweep.

**Formatting is not a component.** Money, quantities, percentages and
dates all go through `lib/format.ts`, on screens and in PDFs alike.
Never write `new Intl.NumberFormat` in a screen; that's how the same
price ended up rendering three different ways.

Deliberately not built yet — add only when a real tool needs it, not
speculatively: toast/notification, radio, popover, combobox, a
responsive table (cards on a phone), a shared filter toolbar, a notice
banner, a real sidebar search. The last four are in `TODO.md` as the
options the founder did not pick for the 2026-09-17 skin.

Four were **deleted** once the audit found them with zero importers:
`tooltip`, `item-picker`, `unit-picker`, `vendor-combobox`. Speculative
components rot; the two that were meant to become "a real searchable
combobox in Phase 2" were still plain selects a phase later and unused by
anything. Build the third copy into a shared component, not the first.

## Status colors in practice

Use `success`/`warning`/`danger`/`info` for anything with fixed meaning
(a Pending/Approved/Rejected pill, a validation error, an over-budget
warning) — never reach for a raw Tailwind color class
(`text-red-600`, `bg-amber-100`) in a screen; that's exactly what these
tokens replace. Nothing in CI catches a stray one — `prettier` sorts
the classes and `eslint` has no colour rule — so the review reads for
it; a lint rule is on `TODO.md`'s list.
