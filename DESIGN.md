# Goodearth Toolbox — design system

The shared visual language every tool is built from. Direction: **Apple
meets Google meets Notion, with the editorial quality of kaadal.co.in**
— confident headlines, card-based sections, generous whitespace, quiet
motion. Warm, not cold. Minimal, not bare.

Every screen is built from `components/ui/*`. Never hand-roll a button,
input, card, or badge — extend the shared component instead. If a
pattern repeats twice across tools, it belongs here, not copy-pasted.

## Color

Defined as CSS variables in `app/globals.css`, registered in
`@theme inline` so every one is a Tailwind utility
(`bg-accent`, `text-danger`, `border-border`, etc.) — never hardcode a
hex value in a component.

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
  Change a value in one and change it in the other.
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
the app's known performance problem (`AUDIT.md` PERF-01).

Two things deliberately do **not** follow the theme: PDFs
(`lib/pdf/theme.ts` is a separate print palette) and the logo
(`components/ui/logo.tsx` is brand artwork).

| Token                                                       | Meaning                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `background`                                                | Page canvas                                                               |
| `surface`                                                   | Cards, inputs, anything sitting on the canvas                             |
| `surface-raised`                                            | One layer above `surface` — modals, popovers, dropdown panels             |
| `border`                                                    | Hairlines, card/input borders                                             |
| `foreground`                                                | Primary text                                                              |
| `muted`                                                     | Secondary text, captions, placeholders                                    |
| `accent` / `accent-foreground`                              | The one brand action color (green). Primary buttons, active states, links |
| `success` / `warning` / `danger` / `info` (+ `-foreground`) | Fixed-meaning status colors — pills, inline messages, alerts              |

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

Geist Sans throughout (already loaded in the root layout). No new font.
A named scale — use these combinations, not arbitrary sizes:

| Purpose                               | Classes                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| Display (hero numbers, big greetings) | `text-4xl md:text-5xl font-extrabold tracking-tight`         |
| Page Title                            | `text-lg font-bold tracking-tight text-foreground`           |
| Section Label                         | `text-xs font-semibold uppercase tracking-widest text-muted` |
| Body                                  | `text-sm text-foreground`                                    |
| Body Muted                            | `text-sm text-muted`                                         |
| Caption                               | `text-xs text-muted`                                         |

## Spacing & radius

- Controls (buttons, inputs, selects): `rounded-xl`, `h-11` for
  full-size fields, `h-10`/`h-12` for button sizes.
- Cards and anything larger: `rounded-2xl`.
- Page padding: `px-5`. Section rhythm: `space-y-4` inside forms,
  `space-y-2` / `space-y-2.5` between list rows.
- Kiosk-width screens (Marathon's whole layout is one): `max-w-[480px]`
  on the outer shell (`app/marathon/layout.tsx`), `max-w-[220px]` for a
  centered PIN pad (`pin-pad.tsx`). These are deliberate — a phone-width
  kiosk column, not arbitrary numbers — carry them forward for any other
  tool that's genuinely a single-device kiosk rather than a desktop
  dashboard screen (most future tools won't be; the `(dashboard)` shell's
  wider `max-w-6xl` is the default for anything not kiosk-style — see
  `app/(dashboard)/layout.tsx`).

## Motion

Sparing, on purpose. Two reusable patterns, both currently used only by
the Marathon kiosk and so living in `app/marathon/_components/` (they
move back to `components/ui/` only if a second kiosk-style tool
appears):

- **`PageHeader`** — the sticky `bg-background/95 backdrop-blur` +
  hairline-border treatment for a screen's title/tabs + primary action
  (Exit, Back). Use on any screen with real scroll length. Short screens
  (PIN entry, login) don't need it.
- **`AnimatedReveal`** — wraps content that appears/disappears based on
  state (a live preview, a validation warning) so it animates in via a
  height transition instead of popping and shoving the rest of the page
  around. Always give it a `min-w-0` content wrapper internally (already
  handled) — an unconstrained CSS grid item will happily blow out the
  page's width rather than wrap text, a real bug this project hit once.

One `@keyframes card-in` (fade + scale, ~200ms) exists in
`globals.css` for a single "payoff" moment per flow — the one point in a
screen that deserves delight (a successful save, a completed action).
Don't add a second one to the same flow, and don't add motion anywhere
else "to make it feel nice" — restraint is the point.

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

**`prefers-reduced-motion` is honoured globally** (bottom of
`globals.css`), and it covers every tool, not just Relay: someone who
has asked their operating system for stillness gets it. Confetti, the
banner and the points float are skipped outright rather than merely
shortened; the toast still appears, because they should still learn the
push worked. The one opt-out is `Spinner`, via the
`spinner-keeps-turning` class — a spinner that stops looks like a broken
page, and it is a functional signal rather than decoration.

**The light/dark switch crossfades** (220ms) rather than snapping, via
the View Transitions API — one call in `theme-toggle.tsx`, paced by two
rules in `globals.css`. The browser fades a snapshot of the whole page,
so background, text, borders and the switch's own icon all change
together for no state and no library. A browser without it applies the
change instantly, which is a working switch either way.

Two traps live here. **Don't reach for a `transition` on colours
instead** — it would fade every other colour change in the app, every
hover and every focus ring, and make the whole interface feel soggy.
And **the global reduced-motion block does not cover this**: it selects
`*`, and `::view-transition-*` are pseudo-elements outside the document
tree that `*` never matches. They are named again in that block, and the
switch also checks reduced-motion in JavaScript before asking for a
transition at all.

## Loading states

`Spinner` (`components/ui/spinner.tsx`) — a large spinning ring in the
accent color — is the one loading indicator in the app. This is a
functional signal, not decorative motion, so it isn't subject to the
"one moment of delight" restraint above: every tool's route segment
gets a `loading.tsx` that renders `PageLoading`
(`components/ui/page-loading.tsx` — the one centered-spinner layout;
`tall` for kiosk routes), and any individual widget that fetches its own
data inside an
otherwise-fast page wraps in `<Suspense fallback={<Spinner />}>`
(see `MarathonLiveCard` on the Overview page) rather than blocking the
whole screen. Add both as a matter of course for every new tool, the
same way every tool already reuses `components/ui/*` — don't leave a
tool without a `loading.tsx`. For a small inline spinner (inside a
button, a search result list), override the size/border with
`className`, e.g. `<Spinner className="size-4 border-2" />`, rather
than reaching for a different icon.

## Icons

`lucide-react`. Small, tree-shakeable, line-icon style that matches the
rest of the system. Size icons to match the text they sit next to
(`className="size-4"` inline with text-sm, `size-5` for buttons).

## Interactive primitives

`Dialog`, `DropdownMenu` and `Tabs` in `components/ui/` are thin,
Tailwind-styled wrappers around Radix UI's headless primitives
(`@radix-ui/react-*`) — same visual language as everything else, but
correct focus-trapping/ESC/ARIA behavior for free instead of hand-rolled.

`Tabs` is for switching between content panels on the _same page_ —
no navigation, no URL change. It is **not** what Marathon's admin nav
needs, since Entries/Members/Groups are separate routes, not panels of
one page. For pill-style _route_ navigation, use `NavTabs` (same file,
same visual pill styling, built from `next/link` instead of Radix) —
Marathon's admin nav is the reference implementation.

## Component inventory

Built: `avatar`, `badge` (+ status variants), `button`, `card`,
`checkbox`, `dialog`, `dropdown-menu`, `empty-state`, `form-message`,
`icon-button`, `input`, `label`, `page-loading`, `page-title`,
`pagination`, `select`, `spinner`, `table`, `tabs` (+ `NavTabs`),
`textarea`, and the `chart/` family (`chart-card`, `chart-theme`,
`bar-chart`, `line-chart`, `stacked-bar`, `meter`) — thin themed
wrappers over Recharts (the meter is a CSS bar, deliberately not
Recharts); see "The chart palette" above for the rules they carry.

`PageTitle` vs `PageHeader`: `PageTitle` is the static h1/description/
back-link block every dashboard screen starts with; `PageHeader`
(`app/marathon/_components/page-header.tsx`) is the sticky,
backdrop-blurred bar for kiosk screens with real scroll length
(Marathon). Don't hand-roll either.

Shared domain components live in `components/masters/`: `item-thumb`,
`project-picker`, and `record-form-dialog` — the create/edit shell every
Masters record uses.

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
  that suits how many there are. `nested` recesses it for use inside
  another `Card`, because `surface` and `surface-raised` are the same
  white in light mode and a card on a card would be told apart by
  nothing but its border.

Only Business Planning uses them so far. The copies in the other tools
are fine where they are; convert one when you are next in it for another
reason, not as a sweep.

**Formatting is not a component.** Money, quantities, percentages and
dates all go through `lib/format.ts`, on screens and in PDFs alike.
Never write `new Intl.NumberFormat` in a screen; that's how the same
price ended up rendering three different ways.

Deliberately not built yet — add only when a real tool needs it, not
speculatively: toast/notification, radio, popover, combobox.

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
tokens replace.
