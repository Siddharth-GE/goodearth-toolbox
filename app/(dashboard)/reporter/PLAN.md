# Reporter — the rules

A report builder over a dataset registry — columns, pickers-only filters, two-level grouping, measures, sort, subtotals — rendering as a KPI band, a chart, a table, CSV and a PDF on the shared letterhead. Grant `/reporter`. Migrations `0054`–`0056`.

## Founder decisions (binding)

1. **A builder over any data**, not a shelf of fixed reports — with seven starting points (Project scorecard · Sales & collections · Spend vs budget · Site & procurement activity · Stock & inventory position · Plan vs actual · Design & delivery progress).
2. **Full line-level money, including client rates and margin %** — a deliberate reversal of `0011`'s margin boundary. `/reporter` is grantable to anyone, and granting it shows every vendor rate, bill amount and margin; Settings says so in amber.
3. **Graphs are core**, and the report must be beautifully designed.
4. **Every filter offers choices, never typing** — a `lookup` picker for id fields, the data's own distinct values for categorical text; otherwise not filterable. `datasets.test.ts` enforces it.
5. **A distinct count counts things, not labels** — five armchairs are all "Armchair", so a field carries `identityPath` to the row's id. Every dataset counting a name-labelled entity has this trap.

## The two architectural ideas

- **"Any data" is a registry, not SQL from the browser.** Any SQL runner would be `security definer` and read past every policy. The browser sends registry keys; `parseReportSpec` resolves them against constants and **is the whole validation boundary**. Grouping and aggregation run in pure TypeScript; filters and sorts push down; over `MAX_REPORT_ROWS` (50,000) it refuses in a plain sentence rather than truncating.
- **One data shaping, two outputs.** Recharts on screen (`components/ui/chart/*`); the PDF draws the **same tested ChartModel** with react-pdf primitives (`lib/pdf/chart.tsx`). Server-rendering Recharts to an image does not work — it renders an empty wrapper, because the SVG mounts only in a live browser. Don't try again.

## Things that will bite

- **Every embed names its constraint** — `bills.po_id` resolves to three relations, `bills` has four FKs to `profiles`, `goods_receipts.po_id` and `indent_lines.budget_id` are ambiguous too. And never reach `plots` through `units`; every fact table has its own `plot_id`.
- **`crm_milestones` and `crm_receipts` stay two datasets, never a join** — a milestone with three receipts would triple every `sum(due_amount)`.
- **`stock_by_location` has no `project_id`, no `id`, no FKs** — hence `pageOrder` and `enrich: "stock_names"`. It registers unscoped, saying so on screen.
- **A starter id is a URL segment**: hyphens, not colons (a colon 404'd on the deployed preview).
- **The registry is a display decision, not a boundary; the grant is.** Widened policies let `/reporter` read every column of `purchase_orders`, `bills`, `budgets`. CRM money comes through views because there the secret is prose, and its absence is the boundary.
- **Never import `lib/business-planning/model.ts`** — plan figures reach Reporter only as published targets through `business_plan_target_facts`.
- **Never `formatCrore` inside a column that must add up.**

## Charts

The rules are `DESIGN.md`'s. Reporter-specific: **dual axes are impossible by construction** — all measures share one scale, and two of wildly different size make the parser offer two charts. Series: 1–3 direct-labelled, 4 needs labels, 5–6 a legend, 8 the ceiling with the tail folded into "Other". A meter carries two measures, the value then the limit. Every chart sits beside its table.

## Starters are code constants, not seeded rows

`lib/reporter/starters.ts` — a seeded row cannot be corrected under additive-only migrations, and a starter must change with the registry in the same deploy. `starters.test.ts` asserts each round-trips through `parseReportSpec` with zero loss. **Saved reports survive renames**: `aliases` resolve old keys, unknown keys are dropped not thrown, `describeSpecLoss` says what was left out, and a vanished dataset offers Delete — never a crash.

## Not built

One chart per report. Several charts on a page is a **dashboard composer** — a different product, and the next natural addition; the true multi-dataset Project scorecard waits on it.
