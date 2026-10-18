# Toolbox by Kaadal — design system

The shared visual language every tool is built from: **the Kaadal brand (Brandkit 2026), set for work.** Solid brand colour, Gambetta titles, near-square controls, hairlines; no textures, gradients or glass. The brand is warmth and precision — "never loud, never distant". The mode is _operate_: someone is here to finish a task, so the brand frames the screen (the burgundy rail, a team's coloured band, a Gambetta title) and stays out of the task itself. The brand kit's source files live outside the repo; its colours, fonts and logo paths are copied in here and nowhere else.

**Every screen is built from `components/ui/*`** (+ `components/masters/*`). Never hand-roll a button, input, card or badge — extend the shared component. A pattern that repeats twice across tools belongs here.

## Color

CSS variables in `app/globals.css`, registered in `@theme inline` so each is a Tailwind utility (`bg-accent`, `text-danger`, `border-border`). **Never a hex value or a raw palette class (`text-red-600`) in a component** — nothing in CI catches one, so review reads for it.

**Three tones.** Light: the page is the brand's paper (`background`), a card a lighter paper (`surface`), what floats or takes typing is white (`surface-raised`). Dark is the same in the brand's ink. Three tones let a card read as a card with only a hairline.

| Token                                                       | Light                     | Dark      | Meaning                                                                 |
| ----------------------------------------------------------- | ------------------------- | --------- | ----------------------------------------------------------------------- |
| `background`                                                | `#f0eeea`                 | `#180b0f` | Page canvas                                                             |
| `surface`                                                   | `#faf8f6`                 | `#20131a` | Cards, tables, the figure band                                          |
| `surface-raised`                                            | `#ffffff`                 | `#2a1c22` | Inputs, secondary buttons, menus, dialogs                               |
| `border`                                                    | `#dcd8d4`                 | `#3a2a31` | Hairlines                                                               |
| `foreground`                                                | `#180b0f`                 | `#f2e8e9` | Primary text, and the ink of the active tab                             |
| `muted`                                                     | `#6b6563`                 | `#a99a97` | Secondary text, captions, labels; placeholders at `/70`                 |
| `accent` / `accent-hover` / `accent-foreground`             | burgundy `#521323`        | blush     | The one action colour: primary buttons, links, active icons, focus halo |
| `success` / `warning` / `danger` / `info` (+ `-foreground`) | olive, ochre, brick, teal | lighter   | Fixed-meaning status — pills, inline messages, alerts                   |
| `shadow-float`                                              | soft, ink-tinted          | deeper    | The one shadow. Means "this is floating" and nothing else               |

- **Burgundy is action.** Tabs and the active row in a list are foreground-on-surface; burgundy is the primary button, links, the active icon and the focus halo. Hover tints are foreground alphas — `bg-foreground/[0.05]` (rows `/[0.025]`, chips `/[0.04]`) — right in both modes by construction. A primary button darkens on hover (`accent-hover`), never lightens.
- **Danger is brick red, never burgundy**, so a destructive message is never mistaken for the brand.
- **Status colours** (`success`/`warning`/`danger`/`info`) for anything with fixed meaning — an Approved pill, a validation error, an over-budget warning.
- Dark `--surface` keeps the luminance of the `#1a1a17` the chart palette was measured on; re-measure before moving it far.

### Brand colours and grounds

The six official colours plus two tints — `brand-ink`, `brand-teal`, `brand-burgundy`, `brand-olive`, `brand-ochre`, `brand-sage`, `brand-blush`, `brand-cream` — are the same in both modes. They are used **only as grounds, swatches and the logo**, never for text on the page.

A **ground** is a solid brand block: the sidebar rail, the phone top bar and drawer, the sign-in screen, a team's band. A `ground-<colour>` utility sets three variables, and everything on the block draws with them: `bg-ground`, `text-on-ground` (and its alphas for muted text, hover tints and hairlines), and `fill-ground-mark` for the wordmark. Each pairs a colour with the text and logo colour the Brandkit approves on it — sage wordmark on burgundy, olive on teal, burgundy on sage and blush, ink on ochre, white on ink and olive. **On a ground, never use `accent`, `foreground` or `border`**: they are page colours.

- The rail is `ground-burgundy dark:ground-teal`.
- **Teams have colours.** `arrangeTools` gives each team a ground by its place in Settings → Teams (`lib/nav/arrange.ts`), so everyone sees a team in the same colour: burgundy, teal, olive, ochre, sage, blush, then round again; Other is ink. Moving a team in Settings moves its colour. `components/ui/ground.ts` maps a team colour to its literal classes.

### Light and dark

Both palettes live in `app/globals.css` only. Dark comes from `data-theme="dark"|"light"` on `<html>` — the switch in the user menu and on the login screen (`components/ui/theme-toggle.tsx`), remembered in a cookie and applied by a blocking inline script before first paint — else from `prefers-color-scheme`. Nothing is stored on anyone's account. `lib/theme.ts` holds the rule as pure functions; an unrecognised cookie means "follow the device".

- **`@custom-variant dark`** teaches Tailwind the same two rules, or `dark:` utilities ignore the switch.
- **The dark token block is written twice** (one per selector — CSS cannot share a block across a media query). Change both, including `--shadow-float`.
- **`color-scheme` is declared beside the tokens**, so date pickers, steppers, selects and scrollbars follow (BUGCATCHER #4).
- **Don't read the cookie in the layout body** — it costs static rendering (BUGCATCHER #6).
- The `themeColor` values in `app/layout.tsx` quote the phone top bar's ground (burgundy, deep teal in dark); move them with it.
- PDFs (`lib/pdf/theme.ts`) deliberately ignore the theme: a document's letterhead is its company's (`PRODUCT.md`). The logo (`components/ui/logo.tsx`: the K mark and the wordmark, paths copied from the brand artwork) uses brand colours, never tokens: the K is burgundy on light, blush on dark; the wordmark takes its ground's mark colour. The tab icon is the K as a tile. The app is "Toolbox by Kaadal".

### The other colour systems

- **`lib/color-hash.ts`** — seven colours picked by hashing a name (avatars, item thumbnails, placeholder tiles), a plain array, not tokens. One set has to sit on white and near-black, so `item-thumb.tsx` passes it as a `--thumb` custom property and lets the mode pick the tint weight; any new surface painting with a hash colour needs the same, checked in both modes.
- **The chart palette**, `--chart-1` … `--chart-8`, assigned by `lib/charts/palette.ts`. **The slot order is a measured accessibility mechanism** (colour-blind separation and dark-mode contrast), never re-ordered by eye, which is why it is not in brand colours. Single-series charts use `--accent`; eight series is the ceiling, the tail folds into "Other"; status colours are never series colours; **no pie or donut, ever** — part-to-whole is a stacked bar, two slices is a meter.

**Charts:** screens use `components/ui/chart/*` and never import Recharts (the wrappers pass colours as CSS variables, so light/dark swap in one file). Thin bars with 4px rounded data-ends from the baseline, gaps between bars and segments, 2px lines with gaps at nulls (a missing value is never drawn as zero), hairline grid in `--border`, axis labels in `--muted`, tooltip on `surface-raised`. Every Reporter chart sits beside its own table, so colour never carries a value alone.

## Typography

**Two faces, as the Brandkit sets them.** Gambetta (`font-display`, medium) for titles: the greeting, page titles, dialog titles and a band's title — large headings only. Everything else is the sans (`font-sans`): **Outfit, standing in for the brand's Gilroy** until a web licence exists, a one-line swap in `app/layout.tsx`. Gambetta's files are in `app/fonts/` (ITF free licence). Use the named scale, not arbitrary sizes:

| Purpose                  | Classes                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| Display (big greetings)  | `font-display text-4xl md:text-6xl font-medium text-balance`     |
| Page Title (`PageTitle`) | `font-display text-3xl md:text-4xl font-medium text-balance`     |
| Dialog Title             | `font-display text-2xl font-medium`                              |
| Section heading          | `text-[15px] font-semibold` (the Brandkit's sans sub-header)     |
| Section Label            | `text-[11px] font-medium uppercase tracking-[0.14em] text-muted` |
| Body                     | `text-sm text-foreground`                                        |
| Body Muted               | `text-sm text-muted`                                             |
| Caption                  | `text-xs text-muted`                                             |

The **Section Label** is the one label style — sidebar groups, table headers, `Figure` labels, `ResultPanel` and `ChartCard` titles. Don't re-embolden it locally. Gambetta is never bold, never below `text-xl`, and never in a table, a form or a button.

**Numbers.** A standalone figure (`Figure`, pipeline counts, the meter) is the sans with `tabular-nums`. Amount **columns in tables** are `font-mono` (Geist Mono) — a column of money in monospace reads as one. References (`IND-0001`, item codes) are mono. **Formatting goes through `lib/format.ts`** on screens and in PDFs — never `new Intl.NumberFormat` in a screen.

## Spacing and radius

**The brand's corners are set on Tailwind's own names** in `app/globals.css` (`@theme`): `rounded-md`/`-lg`/`-xl` are 2px (controls near-square, like the Brandkit's buttons and option rows), `rounded-2xl` 14px (its app cards), `rounded-3xl` 24px (its white panels). So the class names below mean the brand's values; never use an arbitrary radius.

- Controls: `rounded-xl`, `h-11` for full-size fields, `h-8`/`h-10`/`h-12` for buttons.
- Cards, tables, the figure band, empty states: `rounded-2xl`. Dialogs `rounded-3xl`; menus `rounded-xl`; icon chips `rounded-lg`/`rounded-xl`; pills and avatars `rounded-full` (a button is never a pill).
- Page: `mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-10` (`app/(dashboard)/layout.tsx`). Rhythm: `space-y-4` on most screens and in forms, `space-y-8` between the home page's blocks, `space-y-2`/`2.5` between list rows.
- Card padding `p-5`; the welcome card `p-6 md:p-8`; an empty state `p-10`.

## Material — flat and solid

A card at rest has `border-border` and no shadow. **`shadow-float` is the only shadow**, on exactly what floats — menus, dialogs, the phone drawer, a linked card lifted under the cursor. No `shadow-sm`/`shadow-lg`.

**Nothing is translucent.** Bars, menus and dialogs are solid; no `backdrop-blur`. A dialog's backdrop is `bg-brand-ink/50`. Inputs sit on `surface-raised` and focus with a halo (`focus:border-accent focus:ring-4 focus:ring-accent/15`); buttons with `ring-4 ring-accent/25`; on a ground, focus is `ring-on-ground/60`. Badges wear a hairline of their own colour (`ring-1 ring-inset ring-current/10`).

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

- **Relay is the one stated exception**: moving a baton is the product, so it has four namespaced keyframes confined to `app/(dashboard)/relay/`. A stuck trail **breathes rather than blinks** — unmissable and calm.
- **`prefers-reduced-motion` is honoured globally.** Dialogs simply appear; confetti and floats are skipped; the toast still shows. The one opt-out is `Spinner` (`spinner-keeps-turning`) — a stopped spinner looks broken.
- **The theme switch is a view transition, never a global `transition` on colours** — that would fade every hover and focus ring in the app as well. A component's own `transition-colors` on hover is fine. And `::view-transition-*` pseudo-elements are outside `*`, so the reduced-motion block names them again and the switch checks reduced-motion in JavaScript too.

## Loading states

`Spinner` (`components/ui/spinner.tsx`) is the one loading indicator: the fade on a wrapper, the spin on the ring (two animations on one element made the fade loop forever). **Every route gets a `loading.tsx`** rendering `PageLoading`; a widget that fetches its own data inside a fast page wraps in `<Suspense fallback={<Spinner />}>`. An inline spinner is sized by `className` (`size-4 border-2`), never a different icon.

## Icons

`lucide-react`, sized to the text beside them: `size-4` with `text-sm`, `size-5` in buttons, `size-6` in the welcome card's chip. A tool's icon chip is `bg-accent/10 text-accent` — the one place burgundy appears that is not an action. The Brandkit has no icon system; Lucide is the flagged substitute, so icons stay small and quiet.

## Components

- **Built** (`components/ui/`): `attribution` (who did it — every line edit shows its person), `avatar` (`letters={2}` where a small team shares initials), `badge`, `button`, `card` (+ `interactive`), `checkbox`, `choice-chips` (one tap picks from a short fixed list instead of a dropdown — a chosen chip is ink, a `good` one success; Birdwing attendance, Relay's department picker and Reporter's builder still hand-roll theirs and move onto it when next touched), `confirm-dialog` (the one "are you sure", asking why when the record needs a reason), `dialog`, `dropdown-menu`, `empty-state`, `figure` (+ `FigureBand`, `ResultPanel`), `form-message`, `icon-button`, `input`, `label`, `list-toolbar` (the one search / filter / date-range bar every list shares — a plain GET form, params made safe by `lib/list-params.ts`), `ground` (team colour → literal ground classes), `logo` (K mark + `Wordmark`), `page-loading`, `page-title`, `pagination`, `pill` (a plot, a date, a person, a status — small, rounded, the trigger of every chip menu; + `PlotChip`, `PersonName`, `Faces`), `practice-banner` (the strip on every non-production deployment — loud on purpose), `search-select` (one choice out of a long list, found by typing), `section` (+ `FieldRow`), `select`, `spinner`, `table` (+ `TableFoot`/`TableTotalCell`: a totals row over every matched row, never the page), `tabs` (+ `NavTabs`), `textarea`, `theme-toggle`, `tool-nav` (the one tab strip every tool's screens share), `undo-bar` (the line at the foot of the screen after an everyday change, with Undo for five seconds, instead of an "are you sure" before it; Relay and Client Relations still hold their own copies and move onto it when next touched), `upload-button` (a photo or PDF, shrunk in the browser first — `lib/uploads/`), and the `chart/` family.
- **`Dialog`, `DropdownMenu`, `Tabs`** wrap Radix for focus-trapping, Escape and ARIA. `Tabs` switches panels on one page; route navigation in pills is `NavTabs`.
- **`PageTitle`** is the h1/description/back-link every dashboard screen starts with. Don't hand-roll it.
- **`Figure`** (`size`: `sm`/`lg`/`hero` — a screen where every number is the same size never says which is the answer) and **`Section`** exist because a label-over-a-number block had been hand-written thirteen times in four label styles; convert an old copy when next in that screen, not as a sweep.
- **Shared domain components** (`components/masters/`): `item-thumb`, `product-link`, `project-picker`, `site-picker`, `catalogue-picker`, `record-form-dialog`.
- **The sidebar** (`components/layout/sidebar.tsx`): a burgundy ground (deep teal in dark) under the sage wordmark; Overview pinned, then each team as a closed row — chevron, the team's colour swatch, name, a muted count. The team holding the page opens by itself; open tools hang under a hairline beneath the chevron. Opening is instant, never animated. The home page's `tool-grid` shows the same teams, all open.
- **Shell compositions** (`app/(dashboard)/_components/`): `tool-welcome`, `tool-grid` (the same `visibleTools` rule as the sidebar), `operations-pipeline`, `people-overview`, `coming-soon`. **The home page shows only what is real** — a panel returns when a tool can feed it through a money-free read in `lib/overview/queries.ts`.
- **Not built until a real tool needs it:** radio, popover, tooltip (a native `title` does), a responsive table, a notice banner, a sidebar search. **Build the third copy into a shared component, not the first** — four speculative components were deleted with zero importers.
