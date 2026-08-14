# Reporter — the rules

**Built and merged, all ten stages** (2026-08-13). This file is what binds anyone touching the tool; the stage-by-stage delivery log and test inventory were trimmed on 2026-08-14 and live in git.

## Founder decisions (binding)

1. A **builder from scratch over any data**, not a fixed shelf of reports.
2. Seven starting points: Project scorecard · Sales & collections · Spend vs budget · Site & procurement activity · Stock & inventory position · Plan vs actual · Design & delivery progress.
3. **Full line-level money, including client rates and margin %** — a deliberate reversal of `0011`'s margin boundary.
4. `/reporter` is **grantable to anyone** in Settings, like every other tool. Granting it grants sight of every vendor rate, every bill amount and the margin on every quoted line in the company. Settings says so in amber beside the checkbox.
5. **Graphs are core, not optional**, and the report must be beautifully designed.
6. **Every filter offers choices, never typing.** Id-backed fields get a `lookup` picker; categorical text fields get a picker of the data's own distinct values (`filterOptions: "distinct"` + `optionsSelect`); a text field with neither is not filterable. `datasets.test.ts` enforces it for every future dataset.
7. **A distinct count counts things, not labels.** Names repeat legitimately — five armchairs are all called "Armchair" — so a `FieldDef` carries `identityPath` to the row's internal id and `count_distinct` counts that. Codes are not identity either; they can be blank. **Every future dataset that counts a name-labelled entity has this trap.**

## The two architectural ideas

**"Any data" is a registry, not SQL from the browser.** Arbitrary SQL cannot be made safe here — not for the injection reason, but because RLS is this app's entire permission model and any SQL runner would be `security definer` and read past every policy. So: a declarative dataset registry plus a spec parser. The browser sends registry _keys_; `parseReportSpec` resolves them against constants and **is the whole validation boundary**. Grouping and aggregation happen in pure TypeScript, not SQL — PostgREST cannot do arbitrary `GROUP BY`, and the alternatives are the definer hole or a pile of RLS-bypassing views. Filters and sorts still push down, so the network cost is the filtered set; a match above `MAX_REPORT_ROWS = 50_000` **refuses with a plain sentence** rather than truncating.

**One charting library, one data shaping, two outputs.** Recharts on screen (`components/ui/chart/*`); the PDF draws the **same tested ChartModel** with react-pdf primitives (`lib/pdf/chart.tsx`). Never a second implementation.

> **The Recharts→SSR→sharp→PNG pipeline this plan originally specified does not work.** `renderToStaticMarkup` of a recharts@3 chart returns an empty wrapper `<div>` — the SVG mounts only in a live browser (verified: 127 characters, no `<svg>`). Planning checked that the APIs exist; frame zero of a chart that draws after mount is still empty. Don't try it again.

## Things that will bite

- **Every embed must name its constraint.** Wider than the known `units`→`plots` trap: `bills.po_id` resolves to three relations, `bills` has four FKs to `profiles`, and `goods_receipts.po_id` and `indent_lines.budget_id` are also ambiguous. A bare embed is HTTP 300 at runtime that `next build` compiles happily. Secondary rule: **never reach `plots` through `units`** — every fact table carries its own `plot_id`.
- **`crm_milestones` and `crm_receipts` stay two datasets, never one join.** A milestone with three receipts fans out to three rows and any `sum(due_amount)` then triples. "Sales & collections" is two blocks on one page. This is the easiest way for Reporter to produce a confidently wrong number.
- **`stock_by_location` has no `project_id`, no `id` and no declared FKs.** Hence `DatasetDef.pageOrder` (paging by id would 400) and `enrich: "stock_names"` (names come from bounded lookups, not embeds). It registers unscoped with an honest note on screen; adding project scope means redefining an RLS-bypassing view — its own migration, its own review.
- **A starter id is a URL path segment.** Hyphens, not colons: a colon read fine to Next's own routing but 404'd on the deployed preview. `starters.test.ts` asserts an id survives a URL untouched.
- **Widening a table policy costs what a view does not.** `/reporter` holders read _every_ column of `purchase_orders`, `bills`, `budgets` — `terms`, `note`, `deletion_note`, `payment_ref`. **The registry is a display decision, not a boundary. The grant is the boundary.**
- **CRM money came in as views, not a widened policy**, because the stronger secret there is prose — `details`, `registration_note`, `note`, `bottlenecks` — not money. Their absence from `crm_*_facts` **is** the boundary.
- **Reporter must never import `lib/business-planning/model.ts`.** A plan's revenue and PBT are not stored; they are recomputed by `runScenario` on every read. Publishing targets through `business_plan_target_facts` is the only route that respects "one tool never imports another tool's code."
- **Never `formatCrore` inside a column that must add up** — a column of rounded crore figures does not tally.

## Chart rules

Form is picked by the data's job, before colour. **No pie or donut** — part-to-whole is a stacked bar, a two-slice pie is a meter. **Dual axes are impossible by construction**: all measures share one scale, and two measures of wildly different magnitude make the parser offer _two charts_ instead. Series ladder: 1–3 direct-labelled, 4 requires labels, 5–6 legend, **8 is the ceiling** — past that the tail folds into "Other", and a ninth hue is never generated. A meter carries two measures: the value, then the limit.

The `--chart-1…8` palette order is an accessibility measurement, not a taste choice — **do not re-order it by eye**; `DESIGN.md` carries the numbers and the two orderings that failed. Single-series and emphasis charts use `--accent`, not slot 1. Status colours stay reserved and never become "series 4".

## Starters are code constants, not seeded rows

`lib/reporter/starters.ts`. A seeded row cannot be corrected under additive-only migrations (`0005` exists because that mistake was made once), a starter must change in lockstep with the registry in the same deploy, and as constants they are testable — `starters.test.ts` asserts every starter round-trips through `parseReportSpec` with **zero loss**, the one automated gate that catches a registry change silently gutting a starting point.

**Saved reports survive field renames** in three layers: `aliases` resolve old keys, unknown keys are _dropped not thrown_ so the report still opens, and `describeSpecLoss` says plainly what was left out. If a whole dataset vanishes the screen says so and offers Delete — never a crash, never a blank table.

## Not built

One chart per report. A page with several charts is a **dashboard composer** — a different product, and the natural next addition once these reports are in use. The true multi-dataset Project scorecard waits on it.
