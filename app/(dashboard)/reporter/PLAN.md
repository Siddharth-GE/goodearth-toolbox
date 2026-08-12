# Reporter — build notes

**Stages 1–2 are built** (2026-08-12, `feature/reporter`): the rename (`0052`),
and the full builder pipeline over one dataset — registry, `parseReportSpec`,
the pure aggregation engine and the three screens. Stages 3–10 below are still
to come. Read this before touching the tool.

Planned with the founder on 2026-08-11. Ten stages, each shippable on its own.

## Context

The **Dashboard** tool has never been built — it is a sidebar entry and a
"Coming Soon" page. It becomes **Reporter** with a new icon, and the empty space
underneath becomes a real **report builder**: pick a data set, choose columns,
filters, grouping and sorting, see it as a chart and a table on a properly
designed page, save it by name, and download it.

Founder decisions taken during planning (all binding):

1. A **builder from scratch over any data**, not a fixed shelf of reports.
2. Seven starting-point reports: Project scorecard · Sales & collections · Spend
   vs budget · Site & procurement activity · Stock & inventory position · Plan vs
   actual · Design & delivery progress.
3. **Full line-level money, including client rates and margin %.**
4. `/reporter` is **grantable to anyone** in Settings, like every other tool.
5. **Graphs and charts are core, not optional**, and the report must be
   beautifully designed.
6. **PDF export moves to a later stage.** CSV comes early.
7. **Plan vs actual gets built properly**: Business Planning gains a project link
   and publishes its numbers so Reporter can put actuals beside them.
8. **Every filter offers choices, never typing** (2026-08-12, on seeing Stage
   2): id-backed fields get a `lookup` picker fed from masters, categorical
   text fields get a picker of the data's own distinct values
   (`filterOptions: "distinct"` + the dataset's `optionsSelect`), and a text
   field with neither is not filterable. Dates keep the date picker, numbers a
   number box. `datasets.test.ts` enforces it for every future dataset.

**The consequence to say out loud before the money stages ship:** after Stages 6
and 7, _granting `/reporter` grants sight of every vendor rate, every bill
amount, and the margin on every quoted line in the company._ One grant, per
decision 4. Settings' copy must say so next to the checkbox. This is the widest
permission change the app has made; it is the founder's call, recorded here so it
is never a surprise.

---

## Two architectural ideas

### 1. "Any data" is a registry, not SQL from the browser

Arbitrary SQL from the browser **cannot** be made safe here — not for the usual
injection reason, but because **RLS is this app's entire permission model**, and
any SQL runner would have to be `security definer` and would read past every
policy in the schema.

So: a **declarative dataset registry** plus a **spec parser**. The browser sends
registry _keys_; the server resolves them against constants. After
`parseReportSpec`, every string in a spec is provably a key that exists in
`DATASETS`. That parser is the whole validation boundary — the same shape as
`lib/business-planning/inputs.ts`, whose `parsePlanInputs` guards a jsonb column
the database cannot check.

**Grouping and aggregation happen in pure TypeScript, not SQL.** PostgREST cannot
do arbitrary `GROUP BY`; the SQL alternatives are a `security definer` SQL runner
(the hole above) or a pile of RLS-bypassing views (the `AUDIT.md` SEC-02 hazard,
multiplied). TypeScript also puts the arithmetic behind a leadership report where
`npm test` can cover it — the same reasoning that put `runScenario` in
`lib/business-planning/model.ts` rather than in SQL.

Filters and sorts still push down to PostgREST, so the network cost is the
_filtered_ set. `fetchAll` pages to completion. A `count: "exact", head: true`
probe runs first, and a match above `MAX_REPORT_ROWS = 50_000` **refuses with a
plain sentence** rather than silently truncating.

### 2. Charts use Recharts — one library, and it reaches the PDF too

**This reverses an earlier draft of this plan, which argued for hand-rolled SVG.
That argument was wrong on its central claim** and is recorded here so it is not
re-litigated: a chart library was said to be unable to reach the PDF. It can.

Verified during planning:

- **`recharts@3.10.1` declares React 19 support** (`react: ^19.0.0` in its peer
  deps). This app is React 19.2.4 / Next 16.
- **`react-dom/server` exports `renderToStaticMarkup`**, so a Recharts chart can
  be rendered to an SVG string on the server.
- **`sharp` accepts SVG buffers as input and is already a dependency** of this
  project, so that SVG rasterises to PNG without adding anything.
- `@react-pdf/renderer` already embeds PNG/JPEG — the Selections PDF does exactly
  this with private-bucket design views (`lib/budgets/quote.ts:71-109`).

So the PDF path is: **Recharts → `renderToStaticMarkup` → SVG → `sharp` → PNG →
react-pdf `<Image>`.** One chart implementation, two outputs.

The second argument for hand-rolling — "pure geometry is testable, a library is
not" — was also overstated. What needs testing is the **data shaping** that feeds
the chart (which series exist, which palette slot each gets, how nulls behave),
and that is a pure function either way. Recharts' own rendering does not need our
tests.

What this costs: about 250 lines of themed wrappers instead of roughly 900 lines
of scales, nice-tick algorithms, axis rendering, label-collision avoidance,
tooltip positioning and responsive resize handling — all of it solved, tested
code we would otherwise be writing and maintaining ourselves.

CLAUDE.md's "no new libraries without proven need" is a bar, not a ban. Two
explicit requests for charts clear it. Recharts is added to `package.json`,
imported only from `"use client"` components under `app/(dashboard)/reporter/`
and `components/ui/chart/`, so Next code-splits it to the Reporter route and no
other tool's bundle grows.

```
lib/charts/palette.ts   PURE  slot assignment, screen tokens, print hexes
lib/charts/series.ts    PURE  ReportResult -> chart series (the shaping that IS tested)
components/ui/chart/*         themed Recharts wrappers ("use client")
lib/pdf/chart.tsx             SSR -> sharp -> PNG for the PDF — Stage 9
```

**Three known Stage-9 details, flagged now rather than discovered then:** CSS
variables do not resolve inside a detached SVG string, so the PDF render passes
the **literal print hexes** from `lib/pdf/theme.ts` (which already refuses to
read app CSS variables, for the same reason); `ResponsiveContainer` does not work
server-side, so the PDF render uses a fixed width and height, which is what paper
wants anyway; and `sharp` rasterises text with the fonts available to it, not
Geist, so the axis and label typeface must be checked on a real PDF before Stage
9 is called done.

What Recharts is **not** used for: the `meter` form and the KPI tiles. Those are
a CSS bar and the existing `Figure` component — they were never chart-library
work.

---

## Chart forms, and what is deliberately excluded

The form is picked by the data's job, before colour.

| Job                           | Form                                                    | Colour job               |
| ----------------------------- | ------------------------------------------------------- | ------------------------ |
| A single headline number      | `Figure` at `hero` — **not** a one-bar chart            | ink                      |
| A handful of headline numbers | `FigureBand` KPI row                                    | ink                      |
| Compare magnitude by category | `bar` (column), `hbar` for long names / many categories | sequential, one hue      |
| Trend over time               | `line`; `area` for a single series                      | accent, or 1 categorical |
| Tell distinct series apart    | `line` multi-series, `stacked` bar                      | **categorical**          |
| One series is the point       | **emphasis** — accent hue, rest gray                    | accent + gray            |
| Part-to-whole                 | `stacked` bar (horizontal for long names)               | categorical              |
| One ratio against a limit     | `meter` — spend vs budget (a CSS bar, not Recharts)     | same-ramp track          |

**No pie or donut.** Part-to-whole is a stacked bar; a two-slice pie is a meter.
This is a deliberate exclusion, written into the registry comments so nobody adds
one later "for variety".

**Dual-axis charts are impossible by construction.** All measures on one chart
share one scale. Two measures of wildly different magnitude (a count beside a
crore figure) make the parser flag it and the UI offer _two charts_ instead. This
is the single most common charting mistake and the spec shape prevents it rather
than warning about it.

**Series ladder:** 1–3 comfortable and direct-labelled; 4 requires direct labels;
5–6 legend; **8 is the ceiling** — past that the tail folds into "Other". A ninth
hue is never generated.

---

## The chart palette

New CSS variables in `app/globals.css` (`--chart-1` … `--chart-8`), registered in
`@theme inline` like every other token — DESIGN.md forbids a hardcoded hex in a
component, and this is a fourth deliberate palette alongside the semantic status
colours, `lib/color-hash.ts`, and the hero gradient. Its comment must say which
of the four it is.

**Validated during planning** against this app's real chart surface (`--surface`:
`#ffffff` light, `#1a1a17` dark). The ordering is the accessibility mechanism,
not a taste choice — this one leads with the green family so it sits with the
brand, and clears **every gate in both modes**:

| Slot | Hue        | Light     | Dark      |
| ---- | ---------- | --------- | --------- |
| 1    | aqua-green | `#1baf7a` | `#199e70` |
| 2    | yellow     | `#eda100` | `#c98500` |
| 3    | magenta    | `#e87ba4` | `#d55181` |
| 4    | green      | `#008300` | `#008300` |
| 5    | violet     | `#4a3aa7` | `#9085e9` |
| 6    | red        | `#e34948` | `#e66767` |
| 7    | blue       | `#2a78d6` | `#3987e5` |
| 8    | orange     | `#eb6834` | `#d95926` |

Light: worst adjacent colour-blind ΔE **9.1** (≥8 target), worst normal-vision ΔE
**19.6** (≥15 floor). Dark: **8.4** and **19.3**, all eight ≥3:1 contrast. Three
light slots sit below 3:1 on white, which triggers the **relief rule** — visible
direct labels _or_ a table view. **Reporter satisfies that by construction: every
chart is a view of a table that is always on the same page.** Worth stating,
because it means the accessibility obligation is designed in rather than
remembered.

Two orderings were rejected after measuring — leading with green and moving red
beside it dropped colour-blind separation to a warning, and separating them then
failed the normal-vision floor outright in both modes. **Do not re-order this
list by eye**; re-measure and choose only among passing orders.

Other roles: **single-series and emphasis charts use the brand accent**
(`--accent`), not slot 1 — so the majority of Reporter's charts read as Goodearth
green regardless of the categorical order. Sequential ramps are one hue,
light→dark. Status colours (`success`/`warning`/`danger`/`info`) stay
**reserved** — never "series 4" — and always ship with a label, never colour
alone.

Recharts consumes these as **tokens, not hexes** — `fill="var(--chart-1)"`,
`stroke="var(--border)"` — because Recharts passes colour props straight through
to SVG attributes, which resolve CSS variables normally in the DOM. So
DESIGN.md's "never hardcode a hex in a component" rule holds with the library in
place, and light/dark swap in one file.

`lib/pdf/theme.ts` gets a parallel **print** palette of literal hexes. It
deliberately does not import app CSS variables (react-pdf cannot read them, and
neither can a detached SVG string handed to `sharp`), exactly as the existing
`pdf` theme already does, and is validated against paper white.

---

## What a report page looks like

A report is a **composed page**, not a raw grid. Top to bottom:

1. `PageTitle` — the report's name, and a one-line description of what it counts.
2. `FigureBand` — the KPI row, built from the report's own totals. One `hero`
   figure (the answer), the rest `lg`/`sm`. `Figure` already renders
   `font-mono tabular-nums`, so columns align.
3. **The chart card** — `Card` on `surface`, hairline grid in `--border`, axis
   labels in `--muted`, recessive chrome. Marks per the spec: thin bars with 4px
   rounded data-ends anchored to the baseline, a 2px surface gap between adjacent
   bars and stacked segments, 2px lines, ≥8px markers, selective direct labels
   (never a number on every point).
4. **The table** — grouped rows, subtotals per group, a grand total, sticky
   header, `tabular-nums` on every numeric column.

**Interaction:** crosshair + tooltip on line/area, per-mark tooltip on
bar/stacked/meter, hit targets larger than the marks, filters in one row above
the chart. Legend present for ≥2 series; ≤4 series are also direct-labelled, so
identity is never carried by colour alone. `prefers-reduced-motion` is already
honoured globally and no chart entrance animation is added.

**Reuse over invention** — `Figure`, `FigureBand`, `ResultPanel`, `Section`,
`FieldRow`, `Card`, `Table`, `Select`, `Checkbox`, `Tabs`, `EmptyState`,
`Pagination`, `Badge`, `Dialog`, `components/masters/project-picker`,
`record-form-dialog`. DESIGN.md notes only Business Planning uses `Figure` and
`Section` so far; Reporter becomes the second tool, which is the rule working.
Nothing hand-rolled, no raw colour classes, all formatting through
`lib/format.ts` — and **never `formatCrore` inside a column that must add up**
(its own docstring: a column of rounded crore figures does not tally).

**One chart per report in v1.** A page with several charts is a _dashboard
composer_ — a different product, and a natural later addition once these reports
are in use.

---

## Modules

```
lib/reporter/datasets.ts    PURE — the registry, and the whitelist
lib/reporter/spec.ts        PURE — parseReportSpec(): THE BOUNDARY
lib/reporter/aggregate.ts   PURE — grouping, aggregation, subtotals, totals
lib/reporter/derive.ts      PURE — line value, GST, margin arithmetic
lib/reporter/starters.ts    PURE — the seven starting points, as constants
lib/reporter/queries.ts     server-only — the ONLY file touching Supabase
lib/reporter/actions.ts     server-only — save / rename / delete, ActionState
lib/charts/{palette,series}.ts         PURE — see above
components/ui/chart/*                  themed Recharts wrappers ("use client")
lib/csv.ts                  PURE, shared — csvCell/csvRow/safeFilename/csvResponse
lib/pdf/chart.tsx + lib/reporter/report-document.tsx   Stage 9
```

```ts
export const REPORT_SCHEMA_VERSION = 1;
export const MAX_REPORT_ROWS = 50_000;

export type ReportSpec = {
  schemaVersion: number;
  dataset: string; // a key of DATASETS
  columns: string[]; // keys of that dataset's fields
  filters: { field: string; op: Op; value: unknown }[];
  groupBy: string[]; // <= 2, groupable only
  measures: { field: string; agg: Aggregate }[];
  sort: { field: string; dir: "asc" | "desc" }[];
  limit: number;
  chart: {
    type: "bar" | "hbar" | "line" | "area" | "stacked" | "meter";
    category: string; // must be one of groupBy
    measures: string[]; // 1..8, order = palette slots; one shared scale
    emphasis?: string; // highlight one, gray the rest
  } | null;
};

/** The only way untrusted JSON becomes a ReportSpec. Never throws:
 *  aliases resolved first, unknowns dropped, numbers clamped. */
export function parseReportSpec(raw: unknown): ReportSpec;
/** Plain-English list of what was dropped, for the screen to show. */
export function describeSpecLoss(raw: unknown, parsed: ReportSpec): string[];
```

A `FieldDef` carries `label`, `type` (`text|number|money|date|bool`), a display
`path`, an optional `filterColumn` and `sortColumn` (absent = that field can
_never_ reach a filter or an `.order()`), `groupable`, legal `aggregates`, and
`aliases` — old keys that still resolve, which is how a rename stays
non-breaking for saved reports.

A `DatasetDef` carries a literal `source`, a **hand-authored `select` constant**
(never composed at runtime), `projectField`, `dateFields[]`, and `money`.

Two guards beyond the whitelist: free-text `contains` values go through
`cleanSearch` (`lib/masters/paged.ts`) before `.ilike()` — PostgREST's `,()`
delimiters are the injection surface that actually exists; and column, filter,
group and measure counts plus `limit` are all capped, so a spec is bounded.

**Request flow.** The builder writes the working spec to `?spec=<base64url>`; the
Server Component decodes, calls `parseReportSpec`, then `runSpec()` in
`queries.ts`, which calls `requireTool("/reporter")` **first**, probes the count,
`fetchAll`s with `dataset.select`, and hands rows to the pure `runReport`. No
browser Supabase client is introduced. A report link is shareable and
bookmarkable, and a hand-edited URL is just another untrusted input hitting the
parser.

---

## Datasets

Every embed **names its constraint**. Wider than the known `units`→`plots` trap:
`bills.po_id` resolves to three relations, `bills` has four FKs to `profiles`,
`goods_receipts.po_id` and `indent_lines.budget_id` are also ambiguous. A bare
embed is HTTP 300 at runtime that `next build` compiles happily. Secondary rule:
**never reach `plots` through `units`** — every fact table carries its own
`plot_id`; the `units` dataset itself writes `plots!units_plot_id_fkey(...)`, the
form already load-bearing at `lib/client-relations/queries.ts:220`.

| Key                   | Source                                           | Money                 | Project scope                | Stage |
| --------------------- | ------------------------------------------------ | --------------------- | ---------------------------- | ----- |
| `indent_lines`        | `indent_lines` + `indents!inner`                 | no                    | `indents.project_id`         | 2     |
| `po_lines`            | `purchase_order_lines` + `purchase_orders!inner` | **yes**               | `purchase_orders.project_id` | 6     |
| `bills`               | `bills`                                          | **yes**               | `project_id`                 | 6     |
| `budget_report_lines` | new view                                         | **yes, incl. margin** | via `units`                  | 6     |
| `crm_milestones`      | new view `crm_milestone_facts`                   | **yes**               | `project_id`                 | 7     |
| `crm_receipts`        | new view `crm_receipt_facts`                     | **yes**               | `project_id`                 | 7     |
| `goods_receipt_lines` | `goods_receipt_lines` + `goods_receipts!inner`   | no                    | `goods_receipts.project_id`  | 8     |
| `stock`               | `stock_by_location`                              | no                    | none — see note              | 8     |
| `selection_lines`     | `selection_lines` + `selections!inner`           | no                    | via `units`                  | 8     |
| `relay_chains`        | `pusher_chain_state`                             | no                    | `project_id`                 | 8     |
| `units`               | `units`                                          | no                    | `project_id`                 | 8     |
| `plan_targets`        | new view `business_plan_target_facts`            | **yes**               | `project_id`                 | 10    |

**`crm_milestones` and `crm_receipts` stay two datasets, never one join.** A
milestone with three receipts fans out to three rows and any `sum(due_amount)`
then triples. "Sales & collections" is two blocks on one page. This is the
easiest way for Reporter to produce a confidently wrong number, so it goes in the
registry comments.

**`stock_by_location` has no `project_id`** and no declared FKs, so it registers
unscoped in v1 with an honest note on screen, and item names come from a bounded
`items` lookup in `queries.ts`. Adding project scope means redefining an
RLS-bypassing view — its own migration, its own review, not a line buried here.

Scoping is registry-driven: `projectField` names a field whose `filterColumn` is
a real path, and where that path crosses an embed the `select` uses `!inner` so
the predicate is pushed down (the reason is already commented at
`lib/inventory/stock-queries.ts:289`). `dateFields` lets the user choose _which_
date to range on — a bill's `invoice_date` and `paid_at` are different questions.

---

## Database

Five migrations, each additive, each re-runnable, each applied via the management
API **before** the code needing it merges. After each: `npm run db:types`, types
committed with the migration. _(Numbers shifted by one on 2026-08-12:
`0053` went to the construction-stages master, which the founder asked for on
seeing Stage 2. Numbers here are the plan's, and the next free number at build
time always wins.)_

**`0052_reporter_rename.sql`** — add `/reporter` to both `user_apps_app_known`
and `role_apps_app_known` (re-listing the full set from `0047:31-37`;
`/management-dashboard` stays, inert, per the additive-only rule). Move any
holder with `insert … on conflict do nothing` then `delete`, both tables —
almost certainly zero rows, but correct on a restore, exactly `0047`'s reasoning.
Then a `0047`-style **`raise exception` proof** that no policy anywhere mentions
`/management-dashboard`; the greps say none does, so assert it rather than trust
it.

**`0054_reports.sql`** — the saved-report table, shaped like
`0048_business_plans.sql` (a spec is only ever read and written whole):

```sql
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  dataset text not null,          -- denormalised out of spec, for the list page
  schema_version int not null default 1,
  spec jsonb not null default '{}'::jsonb,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Plus the shared `audit_row` and `set_updated_at` triggers. RLS: select/insert/
update gated on `has_app('/reporter')` — a saved report holds a _spec_, no money
and no names; money appears only when it is run, through normal RLS. Delete is
narrowed to `is_admin() or created_by = auth.uid()`, the `"recorded bills
deletable by recorder"` precedent (`0025:561`).

**`0055_reporter_money.sql`** — ships alone. `0025:470` already names the
sanctioned move for a third consumer: **widen the qual, never add a policy** (two
permissive policies OR together and nobody reading `pg_policies` would see it).
Policies are renamed too, because `0047` is right that a surface half-labelled
with the old consumer is one nobody trusts at a glance:

- `purchase_orders`, `purchase_order_lines` → `has_app('/purchase-orders') or has_app('/reporter')`
- `bills`, `labour_contracts` → `has_app('/bills') or has_app('/reporter')`
- `budgets`, `budget_lines`, `item_margins` → `has_app('/budgets') or has_app('/reporter')`
  — **a deliberate reversal of `0011:203`'s "margin boundary"**, on the founder's
  explicit second-pass decision that Reporter shows margins. The migration header
  must say so in those words, so the next reader does not mistake it for drift.
- `po_billing_totals` is **not** touched: with `purchase_order_lines` readable,
  ordered totals derive in `lib/reporter/derive.ts` and billed totals come from
  the `bills` dataset. One fewer surface.

Plus the reporting view `budget_report_lines` (`security_barrier`, qual
`has_app('/budgets') or has_app('/reporter')`) exposing `quantity`, `unit_cost`,
`margin_pct`, `client_rate`, statuses and dates, joined to `budgets` for
`unit_id` and `approved_at`.

Note what widening a **table** policy costs that a view does not: `/reporter`
holders can read _every_ column of those tables — `terms`, `note`,
`deletion_note`, `payment_ref`. Acceptable given what has just been made visible,
but stated plainly: **the registry is a display decision, not a boundary. The
grant is the boundary.**

**`0056_reporter_crm_facts.sql`** — CRM money **as views, not a widened policy**,
because `0050:497-507` says the stronger reason those tables are gated is not
money but `details`: notes about a family's bank and why they are stalling. Two
views, `crm_milestone_facts` and `crm_receipt_facts`, joining
`client_payment_milestones` / `client_receipts` to `client_engagements` for
`project_id` and `unit_id`, qual `has_app('/client-relations') or
has_app('/reporter')`. **`details`, `registration_note`, `note` and `bottlenecks`
do not appear. That omission is the boundary.**

**`0057_business_plan_targets.sql`** — declared by _Business Planning_, so the
coupling points the right way (the `0045` precedent). Adds a nullable
`business_plans.project_id references projects(id)` and a
`business_plan_targets` table (headline revenue / cost / PBT / peak funding plus
monthly rows), written by Business Planning's own `savePlan` action from its own
engine. Reporter reads only `business_plan_target_facts`, qual
`has_app('/business-planning') or has_app('/reporter')`.

This exists because **Reporter must not import `lib/business-planning/model.ts`**
— `0048` gave `business_plans` no FK to anything on purpose ("a plan is for land
you have not bought"), and the plan's revenue and PBT are not stored at all, they
are recomputed by `runScenario` on every read. Publishing targets is the only
route that respects "one tool never imports another tool's code."

---

## Screens

```
app/(dashboard)/reporter/page.tsx                 list: starters + saved
app/(dashboard)/reporter/new/page.tsx             dataset picker -> blank builder
app/(dashboard)/reporter/[reportId]/page.tsx      THE generic report page
app/(dashboard)/reporter/run/page.tsx             unsaved spec, from ?spec=
app/(dashboard)/reporter/{[reportId],run}/csv/route.ts     Stage 4
app/(dashboard)/reporter/{[reportId],run}/pdf/route.ts     Stage 9
app/(dashboard)/reporter/PLAN.md
+ loading.tsx in every route segment (shared Spinner, house rule)
```

`[reportId]` accepts a `reports.id` uuid **or** a `starter:*` id — one screen, one
code path, resolved by `getReport(id)`.

Client components in `_components/`: `report-builder` (owns spec state, writes
`?spec=`), `dataset-picker`, `column-picker`, `filter-rows` (ops narrowed by
field type), `group-measure`, `sort-rows`, `chart-picker` (form + measures +
emphasis, with the two-scales warning), `report-chart`, `report-table`,
`report-toolbar`, `save-report-dialog`.

Chart wrappers live in `components/ui/chart/` — `bar-chart`, `line-chart`,
`stacked-bar`, `meter`, `chart-card`, plus a shared `chart-theme.ts` holding the
axis/grid/tooltip/legend props every chart passes to Recharts — because they are
shared UI, not Reporter's private code, and a second tool will want a sparkline
within a release or two. Each is a thin themed wrapper: Recharts supplies the
mechanics, `chart-theme.ts` supplies the house style (hairline grid in
`--border`, `--muted` axis labels, thin marks with rounded data-ends, a 2px
surface gap between bars and stacked segments, tooltip on `surface-raised` with
`rounded-xl`), so no screen ever passes raw Recharts styling props.

---

## The seven starters are code constants, not seeded rows

`lib/reporter/starters.ts`, ids `starter:project-scorecard`,
`starter:sales-collections`, `starter:spend-vs-budget`,
`starter:site-procurement`, `starter:stock-position`, `starter:plan-vs-actual`,
`starter:design-delivery` — **each shipping with its chart already configured**,
so a starting point opens as a designed page rather than a blank grid.

Because: a seeded row cannot be corrected under additive-only migrations
(`0005_remove_catalogue_seed_demo.sql` exists because that mistake was already
made once); a starter must change in lockstep with the registry in the same
deploy; and as constants they are **testable** — `starters.test.ts` asserts every
starter round-trips through `parseReportSpec` with **zero loss**, the one
automated gate that catches a registry change silently gutting a starting point.
Starters are read-only; "Save a copy" inserts a `reports` row.

**Saved reports survive field renames** in three layers: `aliases` resolve old
keys (the intended path, one array entry per rename); unknown keys are _dropped,
not thrown_, so the report still opens; and `describeSpecLoss` says plainly what
was left out. If the whole dataset vanishes, the screen says so and offers
Delete — never a crash, never a blank table.

---

## Delivery — ten shippable stages

Each stage: one push to `feature/reporter` → preview URL → browser test →
sign-off. Migration applied before its code merges. Smoke-tested as the **probe
account holding only the relevant grant** — an admin passes every check and never
sees grant bugs.

| #      | What ships                                                                                                                                                                                                                                                                                     | Browser check                                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **The rename, alone.** `0052`; `lib/tools.ts` → `{name:"Reporter", href:"/reporter", icon:"FileChartColumn"}`, `FileChartColumn` into `TOOL_ICONS`, `LayoutDashboard` out (an unused import fails lint, and CI stops at the first failure); folder `management-dashboard/` → `reporter/`; docs | Sidebar says Reporter with the new icon; Settings shows a Reporter checkbox; grant to the probe, probe sees it; remove it, probe doesn't                                                                                                                    |
| **2**  | **One dataset, table on screen.** Registry (`indent_lines` only), `spec.ts`, `aggregate.ts`, `derive.ts`, `queries.ts`, builder screens, `built: true`. Chosen because `indents`/`indent_lines` are already readable by all authenticated — **zero RLS risk**, full pipeline exercised         | Pick columns, filter by project, group by item, sort, see subtotals and a grand total — as the probe holding only `/reporter`                                                                                                                               |
| **3**  | **Charts.** Add `recharts`; `--chart-1…8` tokens light+dark; `lib/charts/{palette,series}.ts`; `components/ui/chart/*` themed wrappers; the chart card; KPI band via `FigureBand`; chart picker in the builder                                                                                 | Bar, line, stacked and meter all render; hover tooltips; switch a report between forms; check light **and** dark; check on a phone; confirm the Reporter route is the only bundle that grew                                                                 |
| **4**  | **CSV.** `lib/csv.ts` + tests, Selections route refactored (must be byte-identical), two routes                                                                                                                                                                                                | Download, open in Excel, no mangled characters, no formula rows; Selections' existing CSV unchanged                                                                                                                                                         |
| **5**  | **Saved reports.** `0054`, `actions.ts`, list screen, the money-free starters (Site & procurement, Design & delivery)                                                                                                                                                                          | Save, reopen, rename, "Save a copy" of a starter, be refused deleting someone else's                                                                                                                                                                        |
| **6**  | **The money — ships alone.** `0055`; register `po_lines`, `bills`, `budget_report_lines`; starter: Spend vs budget                                                                                                                                                                             | Probe with only `/reporter` sees rates, bill amounts **and margin**; probe with only `/indents` sees no rates anywhere; probe with only `/reporter` still cannot open `/purchase-orders`; then press one real write button on Purchase Orders on production |
| **7**  | **Sales & collections.** `0056`, two CRM datasets, starter                                                                                                                                                                                                                                     | Totals reconcile against Client Relations' own screens for one villa — if they don't, the fan-out bug is present                                                                                                                                            |
| **8**  | **The rest.** `goods_receipt_lines`, `stock`, `selection_lines`, `relay_chains`, `units`; starters: Project scorecard, Stock position                                                                                                                                                          | Open every one of the five new datasets by hand — a bad `select` is invisible to lint, types, tests and build                                                                                                                                               |
| **9**  | **PDF.** `lib/pdf/chart.tsx` — `renderToStaticMarkup` → `sharp` → PNG → react-pdf `<Image>`; print palette (literal hexes) in `lib/pdf/theme.ts`; `report-document.tsx`; two routes                                                                                                            | The same report on screen and on paper, chart included, and they match; **check the rasterised axis/label typeface on a real PDF** — `sharp` will not have Geist                                                                                            |
| **10** | **Plan vs actual.** `0057`, Business Planning gains the project field and publishes targets, Reporter reads the view, starter                                                                                                                                                                  | Set a plan's project, save, see planned vs real side by side                                                                                                                                                                                                |

---

## Tests (`npm test` — pure logic, no DB, no browser)

| Module                   | What the tests lock down                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `datasets.test.ts`       | Every `filterColumn`/`sortColumn` appears in that dataset's `select`. **Every embed names its constraint** (regex: no bare relation after `(`; `plots` never embedded without `!units_plot_id_fkey`). `!inner` wherever `projectField` crosses an embed. No duplicate keys. No money field on a `money:false` dataset. _The only automated gate that would have caught the four dead Client Relations screens._    |
| `spec.test.ts`           | Unknown dataset → safe empty spec. Unknown field dropped, alias resolved. Hostile strings (`"rate); drop table bills"`, `"*"`, `"a,b"`, `"__proto__"`, 10 kB of junk) never survive. Illegal op for a type dropped. `limit` clamped, `groupBy` capped at 2, chart measures capped at 8. A chart whose `category` is not in `groupBy` is dropped, not rendered wrong. A v1 spec still parses after v2 adds a field. |
| `aggregate.test.ts`      | All six aggregates. **Nulls skipped, not zeroed** — an unpriced line and a free line are different things. Grand total equals the sum of subtotals. Two-level grouping. Empty input → empty result, not a crash.                                                                                                                                                                                                   |
| `derive.test.ts`         | Line value = `quantity × rate × (1 + gst/100)` at **full precision, rounded only at display** (`lib/purchase-orders/math.ts`'s rule). A null rate propagates null, never 0.                                                                                                                                                                                                                                        |
| `charts/series.test.ts`  | `ReportResult` → chart series: the shaping Recharts is handed. Nulls stay null (a gap in the line), never 0. A single data point produces a valid series. Empty input produces an empty chart, not a crash. Meter clamps over-100%. Measures of wildly different magnitude are flagged for two charts rather than seated on one scale.                                                                             |
| `charts/palette.test.ts` | Slot assignment follows entity order, **never rank** — a filter that drops a series must not repaint the survivors. Slot 9 folds into "Other". Status colours are never issued as a series.                                                                                                                                                                                                                        |
| `starters.test.ts`       | Every starter round-trips through `parseReportSpec` with zero loss; every dataset exists; every chart is valid for its grouping; ids unique and stable.                                                                                                                                                                                                                                                            |
| `csv.test.ts`            | `=`/`+`/`-`/`@` prefixed with `'`; quotes doubled; null → empty; embedded newlines and commas survive; BOM present; `safeFilename` strips path separators. Written **before** the Selections refactor, so that change is provably a no-op.                                                                                                                                                                         |

Not covered by `npm test` and therefore **verified by opening the page**:
`queries.ts`, `actions.ts`, the chart renderers, `report-document.tsx`, every
route handler, every screen. Every registry entry gets opened by hand before its
stage merges — CLAUDE.md is explicit that a bad `select` compiles fine and the
tests never touch a database.

---

## Documentation to update as we go

- **`CLAUDE.md` contract table** — a Reporter row listing everything it reads.
- **`CLAUDE.md` `pusher_chain_state` paragraph** — a _third_ consumer; a sixth
  redefinition must check Reporter as well as Client Relations.
- **`CLAUDE.md` money section** — "money stays confined" now has a named
  exception: `/reporter` reads PO, bill, budget and margin money by founder
  decision, via widened quals (never a second policy).
- **`CLAUDE.md`** — `recharts` is the first new runtime dependency in a while;
  note that it is the charting library, is confined to the Reporter route's
  bundle, and that charts reach the PDF by rasterising through `sharp` rather
  than by a second implementation.
- **`DESIGN.md`** — the chart palette as the fourth deliberate colour system, the
  validated slot order and why it must not be re-ordered by eye, the chart mark
  specs, `components/ui/chart/*` in the component inventory, and the rule that
  screens use those wrappers rather than importing Recharts directly.
- `STATUS.md`, `TODO.md`, and this file.

## Verification, end to end

1. `npm test` green, then `gh run list` green — a successful push is not a green
   build, and CI stops at the first failure.
2. Preview URL per stage, opened as the **probe account** with only `/reporter`.
3. Every chart checked in **light and dark**, and on a phone.
4. Every dataset opened by hand at least once (the PostgREST embed trap).
5. Stage 6's four-way grant matrix — the one that proves the money boundary moved
   exactly where intended and nowhere else.
6. After each deploy touching server actions, press one real write button on
   production.
