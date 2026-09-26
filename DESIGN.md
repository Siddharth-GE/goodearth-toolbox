# Goodearth Toolbox — design system

The shared visual language every tool is built from. Direction since the 2026-09-17 skin: **Aman meets Apple — stone, air, glass, precision.** Warm, not cold; minimal, not bare. Aman is the calm — warm stone neutrals, hairlines, whitespace, spaced small capitals. Apple is the precision — clear hierarchy, frosted bars, one confident title, and motion that behaves like a physical thing and then stops. The mode is _operate_: someone is here to finish a task, and the brand lives in the details, never on top of the task.

**Every screen is built from `components/ui/*`** (+ `components/masters/*`). Never hand-roll a button, input, card or badge — extend the shared component. A pattern that repeats twice across tools belongs here.

## Color

CSS variables in `app/globals.css`, registered in `@theme inline` so each is a Tailwind utility (`bg-accent`, `text-danger`, `border-border`). **Never a hex value or a raw palette class (`text-red-600`) in a component** — nothing in CI catches one, so review reads for it.

**Three tones.** Light: the page is linen (`background`), a card is paper (`surface`), what floats or takes typing is white (`surface-raised`). Dark is the same in warm charcoal. Three tones let a card read as a card with only a hairline.

| Token                                                       | Light              | Dark      | Meaning                                                             |
| ----------------------------------------------------------- | ------------------ | --------- | ------------------------------------------------------------------- |
| `background`                                                | `#f4f2ee`          | `#141311` | Page canvas and the sidebar rail                                    |
| `surface`                                                   | `#fcfbf9`          | `#1a1a17` | Cards, tables, the figure band                                      |
| `surface-raised`                                            | `#ffffff`          | `#232220` | Inputs, secondary buttons, menus, dialogs                           |
| `border`                                                    | `#e5e1da`          | `#2b2a26` | Hairlines; floating layers and the rail use `border-border/60`      |
| `foreground`                                                | `#1d1c19`          | `#efede8` | Primary text, and the ink of the active nav pill                    |
| `muted`                                                     | `#726f69`          | `#9b978f` | Secondary text, captions, labels; placeholders at `/70`             |
| `accent` / `accent-foreground`                              |                    |           | The one action colour (green): primary buttons, links, active icons |
| `success` / `warning` / `danger` / `info` (+ `-foreground`) |                    |           | Fixed-meaning status — pills, inline messages, alerts               |
| `shadow-float`                                              | soft ambient, warm | deeper    | The one shadow. Means "this is floating" and nothing else           |

- **Nav is ink, accent is action.** Tabs, nav pills and the active sidebar row are foreground-on-surface, never green; green is the primary button, links, the active nav icon and the focus halo. Hover tints are foreground alphas — `bg-foreground/[0.05]` (rows `/[0.025]`, chips `/[0.04]`) — right in both modes by construction.
- **Status colours** (`success`/`warning`/`danger`/`info`) for anything with fixed meaning — an Approved pill, a validation error, an over-budget warning.
- Dark `--surface` stays `#1a1a17`: the chart palette was measured against it.

### Light and dark

Both palettes live in `app/globals.css` only. Dark comes from `data-theme="dark"|"light"` on `<html>` — the switch in the user menu and on the login screen (`components/ui/theme-toggle.tsx`), remembered in a cookie and applied by a blocking inline script before first paint — else from `prefers-color-scheme`. Nothing is stored on anyone's account. `lib/theme.ts` holds the rule as pure functions; an unrecognised cookie means "follow the device".

- **`@custom-variant dark`** teaches Tailwind the same two rules, or `dark:` utilities ignore the switch.
- **The dark token block is written twice** (one per selector — CSS cannot share a block across a media query). Change both, including `--shadow-float`.
- **`color-scheme` is declared beside the tokens**, so date pickers, steppers, selects and scrollbars follow (BUGCATCHER #4).
- **Don't read the cookie in the layout body** — it costs static rendering (BUGCATCHER #6).
- The `themeColor` values in `app/layout.tsx` quote `--background`; move them with it.
- PDFs (`lib/pdf/theme.ts`) and the logo (`components/ui/logo.tsx`) deliberately ignore the theme.

### The other colour systems

- **`lib/color-hash.ts`** — seven colours picked by hashing a name (avatars, item thumbnails, placeholder tiles), a plain array, not tokens. One set has to sit on white and near-black, so `item-thumb.tsx` passes it as a `--thumb` custom property and lets the mode pick the tint weight; any new surface painting with a hash colour needs the same, checked in both modes.
- **Marathon's category badges** — a third palette keyed on a colour name stored in the database, a static class lookup (`category-badge.tsx`, `bib-card.tsx`).
- **`--gradient-hero-*`** — decorative, behind Marathon's hero number; still a variable, not a hex.
- **The chart palette**, `--chart-1` … `--chart-8`, assigned by `lib/charts/palette.ts`. **The slot order is a measured accessibility mechanism** (colour-blind separation and dark-mode contrast), never re-ordered by eye. Single-series charts use `--accent`; eight series is the ceiling, the tail folds into "Other"; status colours are never series colours; **no pie or donut, ever** — part-to-whole is a stacked bar, two slices is a meter.

**Charts:** screens use `components/ui/chart/*` and never import Recharts (the wrappers pass colours as CSS variables, so light/dark swap in one file). Thin bars with 4px rounded data-ends from the baseline, gaps between bars and segments, 2px lines with gaps at nulls (a missing value is never drawn as zero), hairline grid in `--border`, axis labels in `--muted`, tooltip on `surface-raised`. Every Reporter chart sits beside its own table, so colour never carries a value alone.

## Typography

Geist Sans throughout — **one typeface, used with range** (founder's choice over a second heading face). The calm comes from weight, tracking and air. Use the named scale, not arbitrary sizes:

| Purpose                        | Classes                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Display (big greetings)        | `text-4xl md:text-5xl font-semibold tracking-tight text-balance` |
| Page Title (`PageTitle`)       | `text-2xl font-semibold tracking-tight text-balance`             |
| Dialog Title / Section heading | `text-lg font-semibold tracking-tight` / `text-[15px] …`         |
| Section Label                  | `text-[11px] font-medium uppercase tracking-[0.14em] text-muted` |
| Body                           | `text-sm text-foreground`                                        |
| Body Muted                     | `text-sm text-muted`                                             |
| Caption                        | `text-xs text-muted`                                             |

The **Section Label** is the one label style — sidebar groups, table headers, `Figure` labels, `ResultPanel` and `ChartCard` titles. Don't re-embolden it locally.

**Numbers.** A standalone figure (`Figure`, pipeline counts, the meter) is Geist Sans with `tabular-nums`. Amount **columns in tables** are `font-mono` — a column of money in monospace reads as one. References (`IND-0001`, item codes) are mono. **Formatting goes through `lib/format.ts`** on screens and in PDFs — never `new Intl.NumberFormat` in a screen.

## Spacing and radius

- Controls: `rounded-xl`, `h-11` for full-size fields, `h-8`/`h-10`/`h-12` for buttons.
- Cards, tables, the figure band, empty states: `rounded-2xl`. Dialogs and the phone drawer `rounded-3xl`; menus `rounded-xl`; icon chips `rounded-lg`/`rounded-xl`; pills and avatars `rounded-full`.
- Page: `mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-10` (`app/(dashboard)/layout.tsx`). Rhythm: `space-y-4` on most screens and in forms, `space-y-8` between the home page's blocks, `space-y-2`/`2.5` between list rows.
- Card padding `p-5`; the welcome card `p-6 md:p-8`; an empty state `p-10`.
- A genuine single-device kiosk uses Marathon's widths: `max-w-[480px]` shell, `max-w-[220px]` PIN pad.

## Material — hairlines at rest, float only when floating

A card at rest has `border-border` and no shadow. **`shadow-float` is the only shadow**, on exactly what floats — menus, dialogs, the phone drawer, a linked card lifted under the cursor. No `shadow-sm`/`shadow-lg`.

Sticky bars are frosted glass: `bg-background/80 backdrop-blur-xl` with a `border-border/60` hairline. Inputs sit on `surface-raised` and focus with a halo (`focus:border-accent focus:ring-4 focus:ring-accent/15`); buttons with `ring-4 ring-accent/25`. Badges wear a hairline of their own colour (`ring-1 ring-inset ring-current/10`).

## Motion — a vocabulary, not a licence

Defined once in `app/globals.css`, used through the primitives. Nothing else moves.

- **Press** — `Button`/`IconButton` scale to 0.98/0.95 on `:active`, 150ms.
- **Lift** — `<Card interactive>` rises 2px, darkens its hairline, takes `shadow-float`, 200ms.
- **Pop** — dialogs and menus fade and scale in from 0.96 (`pop-in`/`menu-in`, 200ms), out with `pop-out` (160ms).
- **Sheet** — on a phone a dialog is a bottom sheet (`sheet-in`/`sheet-out`, `max-h-[90dvh]`, scrolls inside).
- **Slide** — the phone drawer.
- **Wait** — `Spinner` fades in after 160ms, so a fast page never flashes one.
- **Crossfade** — the theme switch, 220ms, via the View Transitions API.

Easing `ease-out-quint` (`ease-spring` is reserved); 150–280ms, nothing slower than 300ms. Every keyframe is a `--animate-*` utility, and **every custom shadow, ease and animate name is listed in `lib/utils.ts`**, or `tailwind-merge` keeps both of two conflicting classes (`lib/utils.test.ts` pins it). A new word needs the argument written here first.

- **Relay is the one stated exception**: moving a baton is the product, so it has four namespaced keyframes confined to `app/(dashboard)/relay/`. A stuck trail **breathes rather than blinks** — unmissable and calm. Marathon keeps its bib card's entrance on its own kiosk.
- **`prefers-reduced-motion` is honoured globally.** Dialogs simply appear; confetti and floats are skipped; the toast still shows. The one opt-out is `Spinner` (`spinner-keeps-turning`) — a stopped spinner looks broken.
- **Never add a `transition` on colours** — it would fade every hover and focus ring. And `::view-transition-*` pseudo-elements are outside `*`, so the reduced-motion block names them again and the switch checks reduced-motion in JavaScript too.

## Loading states

`Spinner` (`components/ui/spinner.tsx`) is the one loading indicator: the fade on a wrapper, the spin on the ring (two animations on one element made the fade loop forever). **Every route gets a `loading.tsx`** rendering `PageLoading` (`tall` for kiosk routes); a widget that fetches its own data inside a fast page wraps in `<Suspense fallback={<Spinner />}>`. An inline spinner is sized by `className` (`size-4 border-2`), never a different icon.

## Icons

`lucide-react`, sized to the text beside them: `size-4` with `text-sm`, `size-5` in buttons, `size-6` in the welcome card's chip. A tool's icon chip is `bg-accent/10 text-accent` — the one place green appears that is not an action.

## Components

- **Built** (`components/ui/`): `attribution` (who did it — every line edit shows its person), `avatar`, `badge`, `button`, `card` (+ `interactive`), `checkbox`, `dialog`, `dropdown-menu`, `empty-state`, `figure` (+ `FigureBand`, `ResultPanel`), `form-message`, `icon-button`, `input`, `label`, `logo`, `page-loading`, `page-title`, `pagination`, `practice-banner` (the strip on every non-production deployment — loud on purpose), `search-select` (one choice out of a long list, found by typing), `section` (+ `FieldRow`), `select`, `spinner`, `table`, `tabs` (+ `NavTabs`), `textarea`, `theme-toggle`, `tool-nav` (the one tab strip every tool's screens share), and the `chart/` family.
- **`Dialog`, `DropdownMenu`, `Tabs`** wrap Radix for focus-trapping, Escape and ARIA. `Tabs` switches panels on one page; route navigation in pills is `NavTabs`.
- **`PageTitle`** is the h1/description/back-link every dashboard screen starts with; **`PageHeader`** (`app/marathon/_components/`) is the kiosk's sticky bar. Don't hand-roll either.
- **`Figure`** (`size`: `sm`/`lg`/`hero` — a screen where every number is the same size never says which is the answer) and **`Section`** exist because a label-over-a-number block had been hand-written thirteen times in four label styles; convert an old copy when next in that screen, not as a sweep.
- **Shared domain components** (`components/masters/`): `item-thumb`, `product-link`, `project-picker`, `site-picker`, `catalogue-picker`, `record-form-dialog`.
- **Shell compositions** (`app/(dashboard)/_components/`): `tool-welcome`, `tool-grid` (the same `visibleTools` rule as the sidebar), `operations-pipeline`, `people-overview`, `marathon-live-card`, `coming-soon`. **The home page shows only what is real** — a panel returns when a tool can feed it through a money-free read in `lib/overview/queries.ts`.
- **Not built until a real tool needs it:** toast, radio, popover, tooltip (a native `title` does), a responsive table, a shared filter toolbar, a notice banner, a sidebar search. **Build the third copy into a shared component, not the first** — four speculative components were deleted with zero importers.
