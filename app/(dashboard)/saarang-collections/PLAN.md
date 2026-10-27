# Saarang Collections — the rules

The monthly Saarang collection and expense meeting, worked out from eight Zoho exports. Grant `/saarang-collections` (its grant warning: every unit's sold value, every receipt and unpaid invoice, and the expense figures). Migration `0161`, staging only. It replaces the self-hosted "Saarang Collections" page; that page's `Core` is `lib/saarang-collections/core.ts`.

## The founder decisions (2026-10-26, plan.md)

1. **Its own tool, not a Client Relations tab.** Client Relations is scoped — each member sees only their own plots — and this report is every unit's money. It is grant-gated and not scoped: whoever holds the grant sees and edits the whole report, as on the shared claude.ai copy.
2. **Zoho is the source.** The tool reads only the uploaded exports, its typed figures and its rules — nothing from Client Relations or any other tool.
3. **The page's flow and layout, the toolbox's materials.** Summary (tiles, the table, the breakdown under a clicked figure, the meeting view), Reports (the drop zone and eight slots), Rules.

## How it is built

- **The calculations are the page's, ported as they were**: recognition by columns, plot or villa by the units' names, test units left out by their ending, the stale duplicate schedule dropped (a completed one wins, else the first), each correction applied once to the unit's first matching milestone (a blank stage means its first), a unit added by hand counted only while Zoho lacks it, GST on milestone values where set, receipts on the excluded list left out of every payments figure. A report not uploaded leaves its figures `null` — "—" on screen, never ₹0. Two readings are kinder than the page's: spaces inside a cell are squeezed to one, and an amount written "Rs.1,23,456" is read rather than taken as 0.
- **The check** is `scripts/check-saarang-collections.ts` (not CI: the exports are real money and stay outside the repo). Run it on a set and its meeting workbook after any change to `core.ts`. Two differences are the sheets', not ours: the 5 Oct sheet's SUM ranges miss eleven Plot receipts (₹1,01,12,347 collected, ₹2,00,010 unused), and the 21 Oct sheet counts Plot 29's money but not the unit in Total sold.
- **Uploads are kept, never changed** (no update or delete grant). The Summary uses the latest per report; "Updated" means it came within an hour of the newest upload. Two files for one report in one drop: the later counts, and the person is told. An old `.xls` is refused in a sentence — Zoho exports `.xlsx` and CSV, and the toolbox reads no other format (`lib/xlsx.ts`, `lib/csv.ts`).
- **The report date** is the newest as-of date among the payments, sold and milestones exports — never an outstanding export's, which dates its period's end — and only moves forward. When it moves, the collection period resets to the calendar month before it, as the page did; Collection MTD runs from the 1st of the report date's month to it.
- **Typed figures** are the summary's C D G I J K N Q R and the meeting's T for each project, and the whole Phase 3 row. Each saves when the person leaves the cell; a calculated cell can't be typed (the database's CHECK says so).
- **Who did it**: every typed figure, rule change and rule-list row records its person, pinned to the caller by the policies; the audit trigger keeps the history of everything but the uploads, which are their own record.
- **The Excel download** is written by `writeWorkbookBytes` (`lib/xlsx.ts`), no spreadsheet library.
- **Turing reads the kept figures** in `saarang_collection_summary` (`0162`), since it reads tables, not code. Every save that changes an upload, a rule or the period ends with `settled()` in `actions.ts`, which works the Summary out and rewrites them; a typed figure does not, as it is not part of that working. A new figure in `core.ts` fails to compile in `shared.ts` (`KEPT`) until it is kept too, and 0162's CHECK is widened in a new migration. Turing's own copy of the typed cells (`lib/turing/entries/saarang-collections.ts`) follows 0161's CHECK by hand, as the boundary rule keeps it from importing this tool.

## Reads outside itself

Only `profiles` (names). Nothing reads this tool's tables.

## Open

Not in this build: a frozen copy of each meeting's numbers; Total expense from Bills (`villa_cost_facts`) instead of typed; reading Client Relations' own payment schedules once they replace Zoho.
