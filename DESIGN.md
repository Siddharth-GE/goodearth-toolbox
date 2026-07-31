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
(`bg-accent`, `text-danger`, `border-border`, etc.). Light/dark both
handled there via `prefers-color-scheme` — never hardcode a hex value in
a component.

| Token | Meaning |
|---|---|
| `background` | Page canvas |
| `surface` | Cards, inputs, anything sitting on the canvas |
| `surface-raised` | One layer above `surface` — modals, popovers, dropdown panels |
| `border` | Hairlines, card/input borders |
| `foreground` | Primary text |
| `muted` | Secondary text, captions, placeholders |
| `accent` / `accent-foreground` | The one brand action color (green). Primary buttons, active states, links |
| `success` / `warning` / `danger` / `info` (+ `-foreground`) | Fixed-meaning status colors — pills, inline messages, alerts |

`lib/color-hash.ts`'s 7-color palette (used for avatar initials and
Marathon's category badges) is a separate, deliberate system — colors
are picked *by hashing a name*, not by meaning, so it stays a plain JS
array rather than a token. Don't confuse it with the semantic colors
above.

`--gradient-hero-from/via/to` (also in `app/globals.css`) is a third,
purely decorative system — the gradient behind a tool's hero number
(Marathon's `HeroCounter`). Not brand, not semantic, but still a CSS
variable rather than a hardcoded hex in the component, so it's one
place to change rather than a silent exception to "colors are tokens."

## Typography

Geist Sans throughout (already loaded in the root layout). No new font.
A named scale — use these combinations, not arbitrary sizes:

| Purpose | Classes |
|---|---|
| Display (hero numbers, big greetings) | `text-4xl md:text-5xl font-extrabold tracking-tight` |
| Page Title | `text-lg font-bold tracking-tight text-foreground` |
| Section Label | `text-xs font-semibold uppercase tracking-widest text-muted` |
| Body | `text-sm text-foreground` |
| Body Muted | `text-sm text-muted` |
| Caption | `text-xs text-muted` |

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
  wider `max-w-5xl` is the default for anything not kiosk-style).

## Motion

Sparing, on purpose. Two reusable patterns, both in `components/ui/`:

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

## Icons

`lucide-react`. Small, tree-shakeable, line-icon style that matches the
rest of the system. Size icons to match the text they sit next to
(`className="size-4"` inline with text-sm, `size-5` for buttons).

## Interactive primitives

`Dialog`, `DropdownMenu`, `Tabs`, `Tooltip` in `components/ui/` are thin,
Tailwind-styled wrappers around Radix UI's headless primitives
(`@radix-ui/react-*`) — same visual language as everything else, but
correct focus-trapping/ESC/ARIA behavior for free instead of hand-rolled.

`Tabs` is for switching between content panels on the *same page* —
no navigation, no URL change. It is **not** what Marathon's admin nav
needs, since Entries/Members/Groups are separate routes, not panels of
one page. For pill-style *route* navigation, use `NavTabs` (same file,
same visual pill styling, built from `next/link` instead of Radix) —
Marathon's admin nav is the reference implementation.

## Component inventory

Built: `animated-reveal`, `avatar`, `badge` (+ status variants),
`button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `empty-state`,
`input`, `label`, `page-header`, `select`, `table`, `tabs` (+ `NavTabs`),
`tooltip`.

Deliberately not built yet — add only when a real tool needs it, not
speculatively: toast/notification, pagination, textarea, radio, popover,
combobox.

## Status colors in practice

Use `success`/`warning`/`danger`/`info` for anything with fixed meaning
(a Pending/Approved/Rejected pill, a validation error, an over-budget
warning) — never reach for a raw Tailwind color class
(`text-red-600`, `bg-amber-100`) in a screen; that's exactly what these
tokens replace.
