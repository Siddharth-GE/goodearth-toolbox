# plan.md — the new skin: "stone and glass"

_Written by Fable, 2026-09-17; approved by the founder the same day. Built on `feature/skin`. Tick each step here as it lands; a lower tier writes any deviation as a question at the bottom, never into the code. The Google Chat round-two plan this file replaces is in git history (commit d26a263 and before); its two open steps are the founder's and are recorded in `lib/google-chat/PLAN.md`._

## Context

The founder wants the toolbox's look and feel reimagined: **minimal yet responsive, subtle expression and effects — Aman meets Apple.** Aman is quiet warm luxury: stone and linen neutrals, air, hairlines, calm. Apple is precision: clarity, frosted materials, big confident headlines, gentle physical motion (press, lift, pop), rounded continuous corners.

Three founder decisions set the scope (2026-09-17):

1. **A new skin everywhere** — colours, type, spacing, every shared primitive, the shell, login, welcome screens and home. Layouts stay where they are. Not chosen: phone-first restructuring of lists, a real sidebar search, the structural tidy-up (heading sweep, filter bar, notice banner, missing `loading.tsx`). Those go to `TODO.md` as later options.
2. **The home page shows only what is real.** The five panels with invented numbers are removed, not restyled.
3. **One typeface.** Geist stays; the Aman calm comes from lighter weights, spaced small capitals and whitespace, not a second font.

Why this is cheap for the size of the change: the primitives in `components/ui/*` have near-100% adoption (zero raw palette classes outside the documented Marathon exception, zero raw `<select>`, one raw `<table>`), and every colour is a token in `app/globals.css`. Restyling ~25 files changes every screen. The mode is **Operate** — expression never obscures the task; brand lives in precise details.

## The direction, committed

**Palette — restrained.** Warm stone neutrals and the one Goodearth green for actions. In light mode the page is linen, cards are paper, and the raised layer is white — three tones, so a card reads as a card without a shadow. Dark mode is the same idea in warm charcoal. Status colours and the measured chart palette do not change.

**Type — one face, more range.** Page titles grow from `text-lg` to `text-2xl`, semibold, tight. Small-capital labels get lighter and wider (`text-[11px] font-medium tracking-[0.14em]`). Figures move from monospace to Geist Sans with tabular numerals, as Apple does — and the hero step gets bigger.

**Material — hairlines at rest, float only when floating.** Cards lose their shadow; a hairline border and the tonal step do the work. Shadow appears only on things that actually float (menus, dialogs, the phone drawer), and it is soft and ambient. Sticky bars are frosted glass.

**Nav is ink, accent is action.** Tabs and nav pills stop being green; the active one is ink on paper. Green is reserved for the primary button, links and the active icon — so the eye always finds the one thing to press.

**Motion — a small defined vocabulary, nothing else.** Press (buttons scale to 0.98), lift (linked cards rise 2px with the float shadow), pop (dialogs and menus scale from 0.96 with a fade; on a phone a dialog rises as a bottom sheet), slide (the phone drawer), and a spinner that waits 160ms before appearing so fast pages never flash. All timed by two easing tokens. The global reduced-motion block already covers every one of these because they are CSS animations and transitions. Relay's licence stays exactly as it is.

## Steps

Branch `feature/skin` off `staging`. One commit per step, plain-English message, the committing model's own co-author line, pushed. Every step ends with "open the page" in light and dark, at desktop and 390px. Nothing here touches a query, an action, a policy or a migration. Run `npm run format && npm run lint && npm run typecheck && npm test` before every commit; `npm run build` before the commit of steps 1, 5 and 7.

### [x] 1. `[Opus]` Tokens and motion vocabulary — `app/globals.css`, `app/layout.tsx`, `lib/utils.ts`

- Light block (`:root`): `--background #f4f2ee` (linen), `--surface #fcfbf9` (paper), `--surface-raised #ffffff`, `--border #e5e1da`, `--foreground #1d1c19`, `--muted #726f69`. `--accent`, status and chart tokens unchanged.
- Both dark blocks (`[data-theme="dark"]` and the media-query copy — **keep them identical**): `--background #141311`, `--surface #1a1a17` (unchanged — the chart palette was measured on it), `--surface-raised #232220`, `--border #2b2a26`, `--foreground #efede8`, `--muted #9b978f`.
- New token in `:root` and both dark blocks: `--shadow-float` (light: `0 12px 40px -12px rgb(29 28 25 / 0.18), 0 1px 2px rgb(29 28 25 / 0.06)`; dark: `0 16px 48px -12px rgb(0 0 0 / 0.6), 0 1px 0 rgb(255 255 255 / 0.04)`).
- New entries in `@theme inline` so they become utilities: `--shadow-float: var(--shadow-float)`, `--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-spring: cubic-bezier(0.2, 0.9, 0.3, 1.08)`, and `--animate-pop-in`, `--animate-pop-out`, `--animate-fade-in`, `--animate-fade-out`, `--animate-menu-in`, `--animate-sheet-in`, `--animate-sheet-out`, `--animate-slide-in-left`, `--animate-slide-out-left`, each `name 200–280ms var(--ease-out-quint) both` (pop/menu 200ms, fade 160ms, sheet/slide 280ms; the `-out` variants 160ms).
- Keyframes, next to `card-in`: `pop-in` (opacity 0→1, `scale(0.96) translateY(6px)`→none), `pop-out` (reverse), `fade-in/out`, `menu-in` (opacity + `scale(0.96)` with `transform-origin: var(--radix-dropdown-menu-content-transform-origin)`), `sheet-in/out` (translateY 100%→0), `slide-in-left/out-left` (translateX -100%→0). Relay's four keyframes and `card-in` untouched.
- Reduced motion: no change needed — the existing `*` rule zeroes every animation and transition above. Verify by toggling the OS setting.
- `app/layout.tsx` viewport `themeColor`: `#f4f2ee` light, `#141311` dark (they are quoted from globals.css and must match — the phone's address bar is the check).
- **`lib/utils.ts`: `tailwind-merge` does not know the custom names** — measured: `twMerge("shadow-float shadow-none")` keeps both, so a caller's `shadow-none` could never override. Replace `twMerge` with `extendTailwindMerge({ extend: { theme: { shadow: ["float"], ease: ["out-quint", "spring"], animate: ["pop-in", "pop-out", "fade-in", "fade-out", "menu-in", "sheet-in", "sheet-out", "slide-in-left", "slide-out-left"] } } })`. Add `lib/utils.test.ts` (pure logic) asserting `cn("shadow-float", "shadow-none") === "shadow-none"`, `cn("ease-out-quint", "ease-linear") === "ease-linear"`, `cn("animate-pop-in", "animate-none") === "animate-none"`, and that `cn("px-2", "px-4")` still gives `px-4`.
- **Open:** every page still reads; nothing but colour has moved. Dark: open a date field (BUGCATCHER #4).

### [x] 2. `[Sonnet]` Controls — `button`, `input`, `select`, `textarea`, `checkbox`, `label`, `icon-button`, `badge`, `form-message`

- `button.tsx` base: `rounded-xl font-medium transition-[transform,background-color,border-color,opacity,box-shadow] duration-150 ease-out-quint active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-accent/25` (drop the ring offset). Primary `bg-accent text-accent-foreground hover:bg-accent/90`; secondary `bg-surface-raised text-foreground border border-border hover:border-foreground/20`; ghost `text-foreground hover:bg-foreground/[0.05]`. Sizes unchanged.
- `input`/`select`/`textarea`: `bg-surface-raised border-border h-11 rounded-xl px-3.5 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none placeholder:text-muted/70`. Select keeps no placeholder rule; textarea keeps `py-2.5` and no height.
- `checkbox`: `rounded-md border-border accent-accent focus-visible:ring-4 focus-visible:ring-accent/25`.
- `icon-button`: hover `bg-foreground/[0.05]`, `transition-[background-color,color,transform] active:scale-95`.
- `badge`: `font-medium tracking-wide ring-1 ring-inset ring-current/10`; tints unchanged.
- `label`, `form-message`: unchanged.
- **Open:** `/masters/items` → New item (every control kind); `/settings/people`; `/login` fields.

### [x] 3. `[Sonnet]` Surfaces and text blocks — `card`, `table`, `figure`, `section`, `empty-state`, `page-title`, `tabs`, `pagination`, `spinner`, `page-loading`, `chart/chart-card`, `chart/meter`

- `card.tsx`: `border-border bg-surface rounded-2xl border` — **no `shadow-sm`**. New optional prop `interactive?: boolean` → `transition-[transform,border-color,box-shadow] duration-200 ease-out-quint hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-float`. `Section`'s `nested` keeps `bg-background` and drops the now-meaningless `shadow-none`.
- `table.tsx`: header cells take the new label style (`text-[11px] font-medium tracking-[0.14em] uppercase text-muted py-3`); `TableRow` gets `transition-colors hover:bg-foreground/[0.025]`; cells `py-3.5`.
- `figure.tsx`: label = new label style; value `tabular-nums` (drop `font-mono`), sm `text-sm font-semibold`, lg `text-xl font-semibold tracking-tight`, hero `text-3xl font-semibold tracking-tight`. `FigureBand` → `rounded-2xl`. `ResultPanel` title = new label style.
- `page-title.tsx`: h1 `text-2xl font-semibold tracking-tight text-balance`; description `mt-1 max-w-prose`; back link uses lucide `ArrowLeft` (`size-3.5`) instead of the "←" character, `inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors`.
- `tabs.tsx`: pill base `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors`; inactive `text-muted hover:text-foreground hover:bg-foreground/[0.05]` (no border); active `bg-foreground text-background`. Same for `TabsTrigger` via `data-[state=active]`.
- `empty-state.tsx`: `p-10`, icon in a `size-10 rounded-full bg-foreground/[0.04]` chip.
- `spinner.tsx`: `size-8 border-2`, plus `animate-fade-in [animation-delay:160ms] opacity-0 [animation-fill-mode:forwards]` so it never flashes on a fast load; `.spinner-keeps-turning` stays (the spin and the fade are two animations on one element — write both in one `animation` shorthand via arbitrary `[animation:...]` if the utilities fight, and keep the reduced-motion opt-out working). Inline uses (`size-4 border-2`) still override.
- `chart-card.tsx`, `meter.tsx`: title label = new label style. Nothing else in `chart/`.
- `section.tsx`: card padding `p-5`; heading `text-[15px] font-semibold tracking-tight`.
- `pagination.tsx`: no change beyond what Button gives it.
- **Open:** `/indents/list` (table, tabs, pagination), a Business Planning plan (Section, Figure, ResultPanel), `/reporter/run` (chart card), `/relay/court` (FigureBand, cards — Relay's own motion must be unchanged).

### [x] 4. `[Opus]` Float layers — `dialog.tsx`, `dropdown-menu.tsx`

- Dialog overlay `bg-black/30 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out`. Content: `bg-surface-raised border-border/60 rounded-3xl p-6 shadow-float` + `data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out`; **on phones a bottom sheet**: `max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:data-[state=open]:animate-sheet-in max-sm:data-[state=closed]:animate-sheet-out`. Title `text-lg font-semibold tracking-tight`.
- Dropdown content: `bg-surface-raised/95 backdrop-blur-xl border-border/60 rounded-xl p-1 shadow-float animate-menu-in`; items `rounded-lg data-[highlighted]:bg-foreground/[0.05]`.
- **Open at 390px and desktop:** `/masters/vendors` → New vendor (a long form in the sheet scrolls, Cancel and Save reachable), the sidebar user menu, ESC and backdrop-click still close, OS reduced-motion → everything appears instantly.

### [ ] 5. `[Opus]` The shell — `components/layout/sidebar.tsx`, `app/(dashboard)/layout.tsx`

- Rail: `w-60 bg-background border-r border-border/60` (tonal, page-coloured — the content canvas and rail are one material, cards are the second).
- Brand block: logo + `Goodearth` in `text-sm font-semibold tracking-tight`, `Toolbox` in `text-muted`.
- **Remove the decorative search box.** It is a control that does nothing; the founder did not choose real search. (Recorded in `TODO.md` as a later option.)
- Nav rows: `h-9 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground hover:bg-foreground/[0.05]`; active `bg-foreground/[0.06] text-foreground` with the icon in `text-accent`. Group labels = new label style.
- User footer: same hover idiom; avatar 28.
- Phone bar: `bg-background/80 backdrop-blur-xl border-b border-border/60`.
- Drawer: overlay fade, content `rounded-r-3xl shadow-float` with `data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left`.
- Layout container: `mx-auto max-w-6xl px-5 py-6 md:px-10 md:py-10`.
- **Open:** every breakpoint (resize from 1400 → 390), dark, drawer open/close/navigate, admin and probe account (probe sees one tool; "No tools assigned yet" if none).

### [ ] 6. `[Sonnet]` Home shows only what is real — `app/(dashboard)/page.tsx`, `app/(dashboard)/_components/*`

- **Delete** `kpi-row.tsx`, `budget-vs-actual.tsx`, `pending-approvals.tsx`, `recent-purchase-orders.tsx`, `activity-feed.tsx` (all static invented data). Remove the "Toolbox / Overview" breadcrumb.
- Rename `management-vision.tsx` → `tool-grid.tsx`: renders **every group** the person can see (`visibleTools`, same rule as the sidebar, in the sidebar's group order), group label above each grid, `Card interactive` per tool (icon chip `size-10 rounded-xl bg-accent/10 text-accent`, name `text-sm font-semibold`, description muted, unbuilt = `Badge neutral` "Coming soon" and a plain card). Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Keep the rule that a built tool links only when the person holds it.
- Greeting: `text-4xl md:text-5xl font-semibold tracking-tight text-balance`, date muted below.
- `operations-pipeline.tsx`: keep every number and comment; the five stages become `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6` (no horizontal scroll on a phone), stage number `text-[11px] tabular-nums text-muted`, value `text-2xl font-semibold tracking-tight tabular-nums`, sub-line loses `font-mono`.
- `people-overview.tsx` and `marathon-live-card.tsx`: restyle values to `tabular-nums` sans; sit side by side in `grid md:grid-cols-2 gap-5` under the pipeline. `Suspense` fallbacks keep their heights.
- Order: greeting → tool grid → pipeline → people + Marathon.
- **Open:** as admin and as the probe account. Confirm no panel shows a number the app did not compute.

### [ ] 7. `[Sonnet]` Welcome screens and sign-in — `app/(dashboard)/_components/tool-welcome.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `login/verify`, `forgot-password`, `reset-password`, `components/login-form.tsx` and siblings

- `ToolWelcome`: icon chip `size-12 rounded-2xl bg-accent/10 text-accent`; intro `text-base leading-relaxed text-muted max-w-prose`; buttons `w-full sm:w-auto` so they are thumb-sized on a phone; `FigureBand` under it unchanged in structure. Still counts only, never rupees.
- Sign-in: **no card**. A centred `max-w-sm` column on the canvas: logo `size-12`, title `text-2xl font-semibold tracking-tight`, muted line, the form, the "or" rule, Google button. Same on verify/forgot/reset. `login/page.tsx` must keep no `searchParams` prop (static prerender — BUGCATCHER #6).
- **Open:** `/login` light and dark and at 390px; after `npm run build`, `.next/prerender-manifest.json` still lists `/login`.

### [ ] 8. `[Haiku]` Mechanical sweep — exact-string replacements only, no component conversions

Trivially checkable diffs, applied with a find-and-replace and reviewed by Opus before commit:

- `text-muted text-xs font-semibold tracking-widest uppercase` → `text-muted text-[11px] font-medium tracking-[0.14em] uppercase` (the raw copies in `inventory/`, `purchase-orders/`, `relay/`, `selections/`, and any left in `app/(dashboard)/_components/` and `components/`).
- `hover:bg-black/[0.04] dark:hover:bg-white/[0.06]` and the `0.03/0.04`, `0.02/0.03` cousins → `hover:bg-foreground/[0.05]` (one idiom; foreground-alpha is right in both modes automatically). Same for `data-[highlighted]:` variants. Files: `relay-nav.tsx`, `report-builder.tsx`, and whatever `grep -rn "bg-black/\[0.0" app components` still finds after steps 2–5.
- `font-mono` on a displayed number (not a code or reference) → `tabular-nums`: Relay's `baton-card`/`timer-dial` labels and any left in `app/(dashboard)/_components/` — **check each is a number, leave references like `IND-0001` and the reporter's column codes alone**.
- Run `npm run format` after (the Tailwind class sorter reorders every string).
- **Open:** `/inventory/receive`, `/relay/court`, `/reporter/run` — nothing moved except label weight.

### [ ] 9. `[Fable]` Review, rulebook, ship

- Review the full diff against `DESIGN.md`, `SECURITY.md` (no query, action, policy or public path touched), `BUGCATCHER.md` (#4 dark furniture, #6 static login).
- **Rewrite `DESIGN.md`** from the built world: direction sentence ("Aman meets Apple — stone, air, glass, precision. Warm, not cold. Minimal, not bare."), the three-tone surface rule, typography table (Page Title `text-2xl font-semibold tracking-tight`; Section Label `text-[11px] font-medium uppercase tracking-[0.14em] text-muted`; figures are sans tabular), "nav is ink, accent is action", "hairlines at rest, float only when floating", the motion vocabulary replacing "one payoff per flow" (Relay's exception and the reduced-motion rule carried forward verbatim), the new tokens, `Card interactive`, the `tailwind-merge` extension rule (a new custom shadow/ease/animate name must be declared in `lib/utils.ts` or callers cannot override it). `PRODUCT.md` brand commitment line updated. Component inventory: ManagementVision → ToolGrid; five home widgets deleted.
- `TODO.md`: add the three unpicked options (phone-first lists, real search, structural tidy) and a cheap guard rail (an ESLint `no-restricted-syntax` rule against raw palette classes) as later items.
- `STATUS.md`: one line under Platform — the skin, date, "home shows real counts only".
- Merge `feature/skin` → `staging`; the founder vets on staging.goodearthkannur.org; **then** `master`, confirm the Vercel Production row matches `git rev-parse --short origin/master`, press one real write button.

## What is deliberately untouched

- **Marathon** (`app/marathon/`): the kiosk shell, `PageHeader`, `AnimatedReveal`, `card-in`, the category-badge colours. It inherits the new tokens and nothing else. Founder did not pick the edges wave.
- **Relay's motion** (`relay-*` keyframes, `celebrate.tsx`, `baton-card`, `timer-dial`): untouched except the label-string sweep.
- **PDFs** (`lib/pdf/theme.ts`): a separate print palette.
- **Chart palette, `lib/color-hash.ts`, `--gradient-hero-*`**: the four colour systems stay four; nothing reordered.
- **Every query, action, policy, view, route and `PUBLIC_PATHS`.**
- **Theme mechanics**: the blocking inline script, the cookie, `lib/theme.ts`, the 220ms view-transition crossfade.

## Risks and how each is handled

| Risk                                                                                                                                                               | Handling                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwind-merge` does not know `shadow-float`, `ease-out-quint`, `animate-*` custom names (measured 2026-09-17: `twMerge("shadow-float shadow-none")` keeps both). | Step 1 extends it in `lib/utils.ts` and pins the behaviour in `lib/utils.test.ts`.                                                            |
| The chart palette was measured on `#ffffff` light surface.                                                                                                         | New light `--surface` is `#fcfbf9` (ΔE under 1); dark surface unchanged. Charts render on `bg-surface` cards — open `/reporter/run` and look. |
| `prettier-plugin-tailwindcss` reorders every edited class string; CI fails on `format:check` first.                                                                | `npm run format` before every commit.                                                                                                         |
| Frosted bars (`backdrop-blur`) on older site phones.                                                                                                               | Solid `bg-background/80` fallback is the same class — a browser without backdrop-filter shows a slightly translucent bar, still readable.     |
| Bottom-sheet dialogs: a long Masters form must scroll inside the sheet and keep its footer reachable.                                                              | `max-h-[90dvh] overflow-y-auto` on content; check `/masters/vendors` New vendor at 390px.                                                     |
| Dropping `shadow-sm` from `Card` makes `Section nested`'s `shadow-none` a no-op and may flatten `marathon-live-card` (it carried its own `shadow-sm`).             | Leave Marathon's card alone; remove the dead class in Section.                                                                                |
| The theme crossfade snapshots the whole page; new transitions run on transform/opacity, not colour.                                                                | No `transition-colors` added to anything that did not already have it; the crossfade stays the only colour fade.                              |
| Figures switch from mono to sans: column alignment in tables.                                                                                                      | `tabular-nums` keeps digit widths equal; compare `/reporter/run` table before and after.                                                      |
| Static prerender of `/login`.                                                                                                                                      | No `cookies()`/`headers()`/`searchParams` added; check `.next/prerender-manifest.json` after `npm run build`.                                 |

## Verification

CI: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run check:actions`, then `gh run list` after the push — a successful push is not a green build.

Browser checklist for the founder, on staging, **light then dark, laptop then phone**:

1. `/login` — sign in; the page has no box around it, the fields glow green softly when tapped.
2. Home — your name, your tools grouped, the pipeline counts; nothing with a sample number.
3. The sidebar — no search box; the current tool is ink, its icon green; on the phone the menu slides in from the left and closes when you tap a tool.
4. `/indents` welcome, then "All indents" — table rows tint on hover, tabs are ink pills, the page title is bigger.
5. `/masters/items` → New item — the dialog pops in; on the phone it rises from the bottom and scrolls.
6. `/reporter/run` a saved report — the chart and its table look right on both themes.
7. `/relay/court` — a cold trail still breathes; nothing else about Relay has changed.
8. Dark mode: open a date field and a dropdown — both dark (BUGCATCHER #4).
9. Turn on "reduce motion" in the phone's settings — everything appears instantly; the spinner still turns.
10. Sign in as the probe account — only Inventory shows, home and sidebar agree.

## Resolved before the build

- The Google Chat round-two plan gave up the `plan.md` slot on 2026-09-17: it was built and merged to staging (PRs #70–#72); its two open steps — the founder's service-account key and the staging vet — are written into `lib/google-chat/PLAN.md`. Both pieces of work remain separate merges to `master`.

## Questions for the tier above

_(A lower tier writes here and stops; it does not improvise.)_
