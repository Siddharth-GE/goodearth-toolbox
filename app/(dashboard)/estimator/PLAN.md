# Estimator — the rules

**Built 2026-08-19.** Migration `0074`. Grant: `/estimator`.

What a villa costs to build. Works come from the Masters vocabulary (`0073`); this tool adds what they are measured in, what the labour costs, and what they consume — materials directly, or through a named mix several works share. An estimate is a villa and a list of works with quantities; from that the tool computes the material takeoff and the money.

## The founder's decisions

1. **Estimation materials are their own master**, not the items catalogue. The catalogue is design-led — 1,400 light fittings, one raw material — and cement in it would ruin the designer's picker.
2. **Mixes are named and reusable**, and a work's recipe may hold both mixes and direct materials. Change M20 once and every concrete work follows.
3. **Money is in from day one** — material rates, labour rates, totals.
4. **An estimate belongs to a villa and starts as a copy of a template.** Saarang has 43 near-identical villas; nobody builds that list 43 times.
5. **No scheduling.** The site team's workbook also tracks dates and delays per plot; the founder cut that from this build ("this whole build is only estimation"). Relay is where progress lives today, and it deliberately stores no per-activity dates — if scheduling is ever built, that gap is where it goes, and `relay/PLAN.md` already reserves "unit stages" for the house screen.

## The rules everything rests on

- **Every table here is `/estimator`-gated, SELECT included** (`0074`, the `0058` funding_facilities shape). Masters reads are ungated by design, so a table carrying a rate cannot live there — that is why a work's unit and labour rate are in `estimator_work_info` and not on `work_items`. **Works stay money-free in Masters.** Nothing here is read by any other tool, and this tool reads no other tool's tables — only the works vocabulary, `projects` and `units`.
- **A missing rate is `null`, and `null` is never zero.** `formatMoney(null)` prints "—", the calculator returns `null` for any cost it cannot know, and the screens say "not priced". A confident ₹0 in a total is the failure this codebase keeps naming; the nullable return type is the only version of that rule the compiler can enforce.
- **All arithmetic is in `lib/estimator/calc.ts`** — pure, import-free, 30 tests. The per-work cost on the Works tab and the per-line cost on an estimate come from the same `computeLine`, so they cannot disagree.
- **Costs are live, not snapshots.** Lines store quantities only; totals recompute from today's rates. **Accepted cost:** an estimate's total moves when a rate does, and there is no record of what it read last Tuesday. Freezing an estimate is a later, purely additive phase (a snapshot table, or rate columns on the line) and would not rework any of this.
- **A template is an estimate with no villa**, and the database says so: `check (is_template = (unit_id is null))`. The flag can never disagree with the shape. Don't "simplify" it away in either direction.
- **Many estimates per villa are allowed.** Estimation iterates and nothing downstream anchors to an estimate, so there is no official number for the database to arbitrate. If duplicates confuse real use, an archive flag is additive.
- **Deletion is refused, not cascaded.** A material used in a mix or recipe cannot be deleted (RESTRICT) — deactivate it. The delete button only appears where nothing uses the row.
- **No embeds.** The estimates list needs villa names and `units` has two FK paths to `plots` since `0029`, so names are merged through a `Map`. A bare embed compiles, builds, and answers HTTP 300 at runtime (BUGCATCHER #2).

## Things that will bite

- **Changing a work's unit after estimate lines exist** silently changes what every one of those quantities means — 40 "cum" becoming 40 "sqm" is the same number describing a different building. The setup form warns with the line count, but it does not refuse; nothing in the database can tell the difference.
- **`copyTemplateToUnit` is two writes with no transaction** — PostgREST gives no way to wrap them. If the lines fail to land the header is deleted again, so a failure is honest rather than a half-copy. A definer function would make it atomic, at the price of another definer surface; not worth it at this scale.
- **`uom` is free text**, deliberately unlike procurement's eight-value CHECK: estimation needs cum, sqm, rmt, tonne, brass and more, and a migration per unit is the wrong price for a label. Forms offer a datalist of what is already in use. **The arithmetic never converts between units** — a component's quantity is in its own unit, per one unit of its parent, and the screens print "bags per cum" so the meaning is visible.
- **No reference numbers.** An estimate is an internal working document; nothing downstream anchors to it, so it is identified by name and villa. If `EST/SAA/001` is ever wanted, the mint-in-SQL pattern from Indents is additive.
- **A mix with no materials contributes nothing** rather than erroring. The mixes list and the work recipe both flag "nothing in it yet" — that flag is the only thing standing between an empty mix and a quietly cheap estimate.

## Later, if asked

Locked/frozen estimates. Reference numbers. Estimate against actual — the works, POs and bills already exist to compare with, and that comparison is the reason to build this on the shared works list rather than a private one.
