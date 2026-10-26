# The team's additions (asked 2026-10-26) `[Opus plans, builds and independently reviews]`

**The ask:** the team's list across the Estimator, Supervisors, Indents, Bills and Inventory, plus "a person must always know what is sitting on their plate". **Settled with the founder, 2026-10-26:**

- several rows of one work on an estimate, each with its own name, mix, materials and labour;
- a stage's owner comes from its work category's lead, and can be changed on one villa;
- an advance is suggested against each bill, and a person confirms it;
- extra material from site means a return from a villa to a store;
- an indent picks a stage instead of a work;
- a labour bill with no work order is a miscellaneous one;
- Additional or Rework labour takes a typed name instead of a Masters work;
- "My plate" is a page plus a bell, with no new pushes.

**Six pull requests, in this order**, each merged to `staging` and vetted there before the next. Migrations take the next free number across every branch, and each one gets an independent Opus review before `db:apply`.

## A. Quick wins — Estimator mixes and rate book, labour in halves, search, miscellaneous labour bills

Built on `feature/team-additions`, `0155` on staging. An independent Opus review found nothing serious, and its five smaller findings are fixed:

- the villa filter also finds a PO made for one of the villa's units;
- a mix copy whose materials fail is taken back;
- Turing's head counts take two decimals up to 999, and "0.00" counts as none;
- a filter value like `constructor` is refused;
- the no-work-order wording is the same on every screen.

- [x] **Duplicate a mix:** a Duplicate button on the mix page copies its materials under "<name> (copy)" and opens the copy.
- [x] **The rate book moves onto `ListToolbar`:**
  - search also finds a work by a material or mix inside it;
  - filters by category, and by Not set up / Used but not priced / Set up, not priced / Labour only / Priced.
- [x] **Labour in decimals** (`0155`): `labour_logs.masons/helpers/others` are numeric (two places, ≥ 0). The count fields, `lib/supervisors/labour.ts`, its test and Turing's fields follow. No view reads the columns, and Send to Bill already summed them as numeric.
- [x] **Search and filters — the audit's call:**
  - Receive's PO finder gains vendor and villa;
  - the Estimator's villa list gains search, project and state;
  - Bills' cash requests gain status and week.
  - Left as they are: Bills → Labour already filters by project, villa, contractor and date. Contractors is rebuilt in B. Contracts only redirects to work orders. Client Relations' Dues filters by project and overdue. Masters' own search forms work.
- [x] **Miscellaneous labour:** the no-work-order bill already existed as "NMR — a muster roll", with an optional contractor; it is now offered and shown as "Labour, no work order — miscellaneous or a muster roll". No migration.
- [ ] [Founder] Vet on staging:
  - Estimator → Mixes → a mix → **Duplicate**: the copy opens with the same materials.
  - Estimator → Rate book: search "cement" lists the works using it; Category and Show narrow the list.
  - Supervisors → a villa → Add labour, daily wages, **0.5** helpers: it saves and shows 0.5. Send it to a bill in Bills → Labour: the half day is billed at half the rate.
  - Inventory → Receive: pick a vendor or a villa in the finder.
  - Estimator → Villas: search a villa, pick Show → Not started.
  - Bills → Cash requests: filter by status.
  - Bills → New bill → "Labour, no work order": pick the contractor, add lines, save.

## B. Bills and contractors — migration (money: reviewed before apply)

- [ ] **Contractor number:** `vendors.contractor_no` (CON/001…) is given automatically when a vendor is marked a contractor, and existing contractors are backfilled in name order. It shows in Masters, on bills, on work orders and on the ledger.
- [ ] **Each contractor's bill count:** `bills.vendor_seq` is set by the database when a bill is made, and existing bills are backfilled by date. Shown as "Bill 4 to this contractor" on the bill and its print.
- [ ] **The contractor's ledger:** Bills → Contractors → one contractor. It lists advances, bills (with their count), recoveries and payments by date, with a running balance, and filters by project and company. The summary lists contractors only and gains company and search.
- [ ] **Advances suggested:**
  - an approved bill's settlement panel opens with the recovery filled in: the outstanding advance, oldest first, up to what the bill owes;
  - adding a bill to a cash request shows the advance and the net;
  - a person always confirms. No schema change.
- [ ] **Additional work and Rework by name:**
  - new column `labour_logs.custom_name`;
  - `work_item_id` may be empty only for Additional or Rework, and then a name is required (CHECK);
  - the stage-start trigger skips a log with no work, and Send to Bill uses the name;
  - every reader of `labour_logs.work_item_id` is checked for the empty case.
- [ ] **A PO bill from a delivery:**
  - pick the delivery, and its invoice number, date and not-yet-billed lines fill the bill (`bills.goods_receipt_id`);
  - the database refuses billing a PO line beyond what was received, checked only when a line's quantity rises, so today's bills stand.

## C. The Estimator — several rows per work — migration

- [ ] Drop `unique (estimate_id, work_item_id)` on estimate lines and add a row `label`. Adding a work already on the estimate adds another row, and **Duplicate row** copies a row with its quantity, measurements, materials and labour.
- [ ] A work not set up in the rate book can be priced on the row: the row asks for the work's unit (saved for the work) and a labour rate, then takes a mix or materials of its own.
- [ ] Re-key by line instead of by work:
  - `estimate-view.ts`, `getEstimateVariations`, `applyEstimateOverrides`;
  - Make official: line costs per line, takeoff still one row per work and item;
  - the copy functions, and the SketchUp import (it fills a work's first unlabelled row);
  - `estimate_work_facts` sums per work (its manifest row changes).

  Indents, Inventory and Supervisors keep reading the same shapes.

## D. Stage owners, and indents by stage — migration

- [ ] **Stage owners:**
  - `site_category_owners` (work category → person) is set on Supervisors → Sequence;
  - `site_stages.owner_id` overrides it on one villa's stage;
  - a stage's owner is the override, else the category's lead;
  - the villa page, board and look ahead show the owner, and Mine includes stages I own.
- [ ] **Indents by stage:**
  - the indent records a stage (`indents.work_group_id`), and its pull offers every work's materials in that stage;
  - each line records the work it came from (`indent_lines.work_item_id`), backfilled from the indent's work;
  - the Estimator's approvals key on the line's work;
  - old indents keep their work, and Turing's indent entries take the stage.

## E. My plate — the shell, likely no migration

- [ ] A **My plate** page and a bell with a count in the sidebar. They read through `lib/overview/`, the shell's sanctioned reader of other tools' queries, with each read wrapped so one tool's failure shows as a note.
- [ ] **Level 1, tools you hold** (work nobody owns):
  - indents waiting your approval;
  - lines waiting the estimator;
  - approved indents with no PO;
  - POs awaiting delivery;
  - site requests;
  - bills waiting your approval;
  - approved bills unpaid;
  - a cash request to release;
  - item requests.
- [ ] **Level 2, what is yours:**
  - stages you own or on villas you run: starting within 7 days, due, late;
  - design steps you are on, and design actions you own;
  - Client Relations actions you own;
  - Relay batons you hold;
  - your indents sent back.
- [ ] Each line opens the screen where it is done. Lean: counts and names, never rupees.

## F. Return from a villa to a store — migration (reviewed before apply)

- [ ] Inventory → **Return from site:** a villa, a store, items and quantities, and a reason.
  - The villa's reached-site total goes down and the store's stock goes up.
  - Never more than reached that villa.
- [ ] **The rate:**
  - returned material goes back into the batches it was issued from, newest issue first, so it keeps their rate;
  - material that reached the villa straight from a PO delivery comes back as a batch at that delivery's rate.

  `stock_by_location` and `batch_on_hand` follow (manifest rows).

# Turing, the admins' assistant `[Opus drafted; Fable's review of T1 waived by the founder, 2026-10-24]`

**The founder's ask** (2026-10-24): "a Claude inside, working with us in the toolbox" — admin-only, general purpose: talk about anything, drop in files, read every tool, build interactive docs and dashboards, and fill data across **every operation**. Settled with them the same day:

- admins only;
- each admin's conversations are private to them;
- what goes into Turing is sent to Anthropic, and each use costs money — both accepted;
- no spending cap in the app: the founder's Anthropic account and its API credits are the limit.

**Next session — start here:** T1 and all of T2's batches are merged into staging, each waiting on the founder's look (the checklists below). Turing now reaches every tool but Settings. What is left is the founder's: the vets, and a production key for Turing when it ships.

## The shape

- **Admins only, the way Settings is.** In `lib/tools.ts`, left out of `GRANTABLE_TOOLS`; every query, action and route calls `requireUser` + `requireAdmin`; every Turing table's policies are `(select is_admin())`. Never grantable, so neither `_app_known` CHECK changes. It opens on the chat, as Settings opens on its list — no welcome screen.
- **First in the sidebar** (founder): its own row above Overview and the teams in `components/layout/sidebar.tsx`, shown to admins only, never under a team — Settings → Teams cannot move it.
- **No new way in.** The admin's own session and the RLS-scoped client — no admin client, no key of ours handed to anyone, no MCP door. Turing sees exactly what the admin sees, and can do exactly what the admin could do by hand.
- **General purpose.** One system prompt says who Goodearth is, what each tool is for (from `lib/tools.ts`), and how Turing works; beyond that it is Claude — drafting, explaining, checking, planning — with the toolbox's reads always at hand.
- **Claude reads and proposes; a person saves.** No tool the model can call writes anything. A change is a proposal the admin sees as a table, edits, and saves with a press (T2).
- **No web.** No web search or fetch, and Turing's pages cannot call out, so a dropped file carrying hidden instructions has no way to send data anywhere.
- **One new library, `@anthropic-ai/sdk`** — the server's only way to call Claude. `ANTHROPIC_API_KEY` from the founder's Anthropic account, in Vercel through `scripts/vercel-env.ts`, Preview first, never logged. `claude-opus-5-5`, effort `medium` throughout (a page is built inside the chat's turn), streamed, with the server-side refusal fallback; system prompt and tool list cached. Read the `claude-api` skill's TypeScript tool-use pages before writing the loop.
- **When the credits run out**, Turing says so in a sentence — "Turing's credits have run out; top up the Anthropic account" — never a raw error. Each turn's tokens are kept with it.
- **Files** dropped on the chat, 4 MB each (the body limit), each uploaded once to Anthropic's Files API and referred to by id after, so the stored conversation stays small. PDFs and photos go as they are; an `.xlsx` is read into text by `lib/xlsx.ts` (moved out of `scripts/read-xlsx.ts`) and goes as text, as do `.csv` and `.txt`. The original is kept in the admin's own folder of the private `turing-files` bucket.

## The one rule change — waived by the founder, built in T2

Fable's review waived by the founder, 2026-10-24 ("Waive, build it now"); an independent Opus review stands in. Turing acting in every tool means calling each tool's own save. Today no module may import a tool's code except `lib/overview/`, for reads. The proposal: **`lib/turing/` becomes the second sanctioned exception — it may call another tool's server actions, and only from a person's Save.**

- **Why not the alternatives.** Writing the tables directly skips each tool's rules (numbering, approvals, notifications); copying those rules into Turing drifts; a "From Turing" step on every tool's form is a build per tool, and one tool at a time.
- **Why it is safe.** An action already checks `requireTool`, validates, and returns `ActionState`; Turing calling it after the admin's Save is the admin pressing that tool's button. Nothing new is reachable.
- **What it costs.** CLAUDE.md's one-principle paragraph names the exception; `scripts/check-boundaries.ts` allows `lib/turing/` to import `lib/<tool>/actions.ts` only — never queries, never screens — and still refuses everything else.
- **The weak spot.** Most actions take `FormData`, so Turing fills the same fields the tool's form sends; a renamed field breaks Turing silently. Each catalogue entry (T2) carries a pure test of the fields it sends, and its action's refusal comes back as the result line, word for word. (Supervisors' schedule actions take typed objects, so the first batch is checked by the compiler.)

## The build — one pull request each, vetted on staging

- [x] **T1. Claude in the toolbox** `[Opus; Fable's review waived by the founder: "skip the review and build it", 2026-10-24]`
  - Built 2026-10-24 on `feature/turing`; `0151` applied to staging, types regenerated. Two independent Opus reviews stood in for Fable: one of `0151` before it was applied (five fixes taken — a file or page can only hang on its owner's own conversation, pages are never changed in place, the page bucket takes `text/html` with a charset), one of the code (nine fixes taken — an unfinished exchange is left out of every replay instead of patched, one answer at a time per conversation through `0152`, a cut-off page answer says so instead of retrying, steps a paragraph apart, a total order when a read spans pages, the tripwire widened and a frame that loads twice closed, secrets left out of what Turing reads). Trial `scripts/trials/turing.sql`, proven against two broken copies. Settled while building: a page reads its data afresh every time it opens, so Reload is the refresh and nothing is stored; Turing's own tables are left out of what it can read, so a shared page can never read one admin's chats; Dexter's headers stay where they are — Turing's sandbox is its own (`lib/turing/page-rules.ts`), stricter, and a downloaded page carries the same policy as a tag; `fetch_rows` is the code's read, `read_rows` stays direct.
  - [x] [Founder] The API key: a Default-workspace key, in Vercel's Preview environment (2026-10-24).
  - [x] [Founder] Pages ship with the risk left (SECURITY.md, _Turing_) — the founder's "merge", 2026-10-24, given the choice of merging without pages.
  - [ ] [Founder] Vet T1 on staging (merged as #145, 2026-10-24).
  - Migration (the next free number across every branch): `turing_conversations`, `turing_messages` (the API's content blocks as jsonb, tokens in and out), `turing_files`, `turing_pages` (title, owner, recipe), buckets `turing-files` and `turing-pages`; one policy per command; conversations and files their owner's only, pages shared among admins; revokes per SECURITY.md.
  - `app/api/turing/route.ts`: POST, streams the reply; `maxDuration` at the plan's ceiling (check Vercel's first). Behind the proxy — not in `PUBLIC_PATHS`.
  - **Reads**, argument checks pure and tested in `lib/turing/read-rules.ts`: `list_tables`, `describe_table`, `read_rows` (a table or view, its columns, filters `eq neq gt gte lt lte in ilike is`, order, ≤ 500 rows; `fetchAll` for a count or up to 5,000). Names are checked against `lib/turing/schema.generated.ts`, written from `database.types.ts` by `npm run db:types` and pinned by a test, so a new column reaches Turing on the next types run. No embeds (BUGCATCHER #2). The prompt says a cancelled row is still there, with `cancelled_at`.
  - **Analysis** over thousands of rows runs in Claude's code execution, calling `read_rows` from inside it (programmatic tool calling), so the rows don't pass through the conversation.
  - **Pages** — `make_page`: Claude writes one self-contained HTML file and the list of reads behind it (the **recipe**). The server runs the recipe and puts the rows into the page as `<script type="application/json" id="turing-data">` — the page never asks our site for anything. Every open re-runs the recipe as the admin opening it: no Claude, no cost. A recipe whose table or column has gone says "this page's data has moved — ask Turing to rebuild it".
  - **The viewer** `app/(dashboard)/turing/pages/[id]/view/route.ts`, admin only: `sandbox allow-scripts` — Dexter's sandbox **without** the popup flags — plus `default-src 'none'; script-src 'unsafe-inline' <one pinned chart library URL>; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'`. A page holds money and was written partly from what a dropped file said; this is what stops it calling home. A pure test pins the header. Shown in a frame with Reload, Download and Delete.
  - **Screen** `app/(dashboard)/turing/`: conversations, the chat, the drop zone, the pages list; works on a phone; `loading.tsx`.
  - Verify: a general question ("draft a polite reminder to a client about a late instalment") answers like Claude; "how many indents wait for approval?" matches Indents; a quotation PDF's total is read right; "a dashboard of this month's bills by villa" opens, its chart responds, and Refresh follows a new bill; a page told to `fetch()` elsewhere is refused (the console names the CSP); a second admin cannot open the first's conversation; the probe cannot open `/turing` or POST to `/api/turing`; with a dud key on Preview, Turing answers in a sentence.
- [ ] **T2. Claude does things, in every tool** `[Opus — the catalogue and the Save; Sonnet adds entries, Opus vets]` — the rule change waived by the founder.
  - [x] **First batch, Supervisors' schedule** (founder's pick, 2026-10-24), on `feature/turing-t2`, `0153` on staging (trial `scripts/trials/turing-saves.sql`, proven against a broken copy; an independent Opus review of `0153` before it was applied, its notes taken: only results and reported change on a save). Ten entries in `lib/turing/catalogue-fields.ts`: a villa's start, supervisor and first plan; a stage's days and fixed start, real dates, status, contractor, need and what it follows; the sequence's days. Settled while building: the proposal lives in the conversation's own messages (no proposal table), a save is claimed once and can't be repeated — ask Turing again for what was refused; Claude hears the results at the start of the next turn; a save left with no results after six minutes shows as interrupted. An independent Opus review of the code (five fixes taken): every id shows as the name it points to, looked up as the admin, and one naming nothing is refused; a field left out keeps what is there, only an empty one clears; the values actually saved are kept, shown and told to Claude; Save waits until the answer has finished; the practice banner's height is one shared value (`--banner-h`), so the sidebar and the workspace fit under it. On a computer Turing became a full-height workspace (founder: "the desktop ui is weird"); the phone is unchanged.
  - [ ] [Founder] Vet the first batch on staging: ask Turing to set a villa's schedule, edit a row, untick one, Save; the Supervisors villa page shows it; ask "what did I just save?".
  - **Settled by the founder, 2026-10-24:** Turing reaches every tool's saves, adds, changes and deletes alike, and **the admin's press is always the write** ("my press always"). Turing never saves on its own, in any tool. A delete is the tool's own delete or cancel, under its own refusals. **Left out entirely:** Settings (access, admins, roles, teams), attaching files or photos inside a tool, and Turing's own and the phones' push saves.
  - **The batches, in the founder's order** (each its own pull request, vetted on staging before the next): 1 labour logs · 2 Masters from sheets · 3 indents · 4 purchase orders · 5 inventory (receipts, issues, adjustments) · 6 bills and work orders · 7 Client Relations · 8 Birdwing · 9 Birdwing Books · 10 Design Management · 11 Selections and Budgets · 12 Estimator · 13 Relay, Directory, the rest of Supervisors · 14 money out (payments, advances, cash requests, financing movements) · 15 approvals · 16 Business planning, Reporter, Dexter names.
  - [x] **Batch 1, labour logs** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-24]` — #148, no migration: add a day's labour, correct a log, delete one logged by mistake, through Supervisors' own `recordLabourLog` / `updateLabourLog` / `deleteLabourLog`. A new record's left-out fields are blank (`Entry.adds`); a quantity is the new `amount` kind; a log shows as its day, villa, work, contractor and heads or quantity. The form's field names are pinned against `lib/supervisors/actions.ts` by a test, so a rename fails CI instead of saving blanks. An independent Opus review stood in for Fable (four fixes taken): a saved row keeps its names, so a deleted log never reads "Unknown"; a correction's work, contractor, date and payment can be kept but never emptied (`Field.keep`); a value the way of paying would drop is refused (`labourConflict`); names are read 100 ids at a time.
  - [ ] [Founder] Vet batch 1 on staging: ask Turing to log today's labour on a villa (one daily-wages row, one piece-work row), edit a count, Save; the villa's Records tab shows both; ask it to correct one, then delete one.
  - [x] **Batch 2, Masters from sheets** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-24]` — #150, no migration: 58 entries — add, change and delete for vendors (and their bank details), items, brands, item categories, clients, companies, projects, plots, units, stores and terms templates; add, rename, switch off and delete for units of measure, construction stages and build stages (and move a build stage); GST rates; works categories, groups and works. A new record that looks like one already there — the same GSTIN, phone or code, or a near name ("K Santhosh" for "Santhosh K", "Geo Bricks" for "GeoBricks", initials and "Pvt Ltd" ignored) — is flagged on its row and starts unticked; Claude is told which. Settled while building: Masters' updates replace every field, so a change reads the record as it stands and sends back each field it leaves out (`formOf`, `recordNow`); a new record starts as the screen's form does (Active on, status planning or available — `Field.start`); a change's Active shows Keep as is / Yes / No, never a bare unticked box. Each tool's entries and runners are now their own files (`lib/turing/entries/`, `lib/turing/runners/`), and one test reads every form-filling entry's reader in the tool's source and fails on any name sent, missing or ticked differently. Item requests' approve, merge and reject wait for batch 15, approvals. An independent Opus review found no field blanked, flipped or dropped across the 58 entries, and nine smaller defects, all fixed: switching a GST rate not on the list is refused instead of reading "Saved"; names whose numbers differ are never near ("PVC pipe 20mm" / "25mm"), "Pvt Ltd" no longer hides a match, codes keep their dots, every phone in a field is compared, and each record is made ready once (200 rows against 5,000 in 20 ms, the page's reads side by side); a status or state a new record starts with can be kept on a change but not emptied; Keep as is can be picked again after a Yes or No; a new company's state starts as Kerala, as the screen's does.
  - [ ] [Founder] Vet batch 2 on staging: drop a small vendor sheet with one vendor already in Masters under another spelling — it is flagged and unticked; Save the rest and find them in Masters → Vendors, active; ask Turing to change one vendor's payment days and check nothing else on it changed; ask for a new item in an existing category; ask it to delete a vendor that has a PO — Masters' own refusal shows.
  - [x] **Batch 3, indents** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #151, no migration: raise an indent (`indent_new`), add lines to a draft, change its header or a line, remove a line, send it, delete a draft, cancel one. Two pieces every later batch reuses. **Records with lines:** one row per line, and rows whose `header` fields agree are one record (`recordsOf`); its runner is called once per record, and the result stands for each line; editing a record's own field on screen changes all its lines together, and each line says which record ("Indent 2") when there are several. **A save that redirects** to what it made (about 40 across the tools) is read as saved, and its address gives the new record's id (`lib/turing/redirects.ts`, Next's internal helpers pinned by a test running a real `redirect()`). A runner may say what it made, shown as "Saved as IND/SAR/0012" and told to Turing. Settled while building: a new indent goes through the screens' own saves in order — `createIndent` (a plot with its unit sends the unit, as the site picker does), `addDirectLines` (which files each item on or off the villa's official estimate, the same item twice as one line), the reason for each line it put outside through `updateLine`, then `submitIndent` only when asked (default draft); a failure part-way says how far it got ("IND/SAR/0013 was made as a draft, not sent: …"). Approve and reject wait for batch 15. An independent Opus review found nine defects, all fixed: a header left out and given empty are the same record; the records are the ones Turing proposed, so the admin's edits can neither merge two nor split one (a split is refused before anything saves); a reason goes only on a line the add made or grew, never on an untouched older one, every reason is tried and the refusals counted; the create's second write (work, urgent mark) is checked and redone if it was lost; a villa must be in the indent's project (`siteOf`, shared with POs); a reason on an estimate or budget line is refused instead of dropped; only the redirect a save is expected to make counts as saved (a lapsed sign-in never does); a refused add tells the admin to check the indent before asking again.
  - [ ] [Founder] Vet batch 3 on staging: photograph a handwritten indent for two villas and ask Turing to raise it — two indents, each line tagged; untick one line, change a needed-by date (both lines of that indent follow), Save; each row reads "Saved as IND/…"; open them in Indents — estimate lines filed against the estimate, the off-estimate line with its reason; ask Turing to send one for approval, then to cancel another with a reason.
  - [x] **Batch 4, purchase orders** `[Opus; Fable's review waived by the founder for this merge: "merge anyway", 2026-10-24]` — #152, no migration: POs from an approved indent (`po_from_indent` — the screen's own `createPosFromIndent`, one draft PO per vendor with the default terms, every PO made named in the result), a bulk PO gathering lines from several approved indents (`po_general` — `createPurchaseOrder`, `addPoolLines`, then a rate or GST % given through each line's own save), a draft's header, charges, lines (rate, GST %, a discount as % or ₹, other charges) and line removal, issue, delete a draft, and ask for or withdraw a cancellation (each only in the state where the screen offers it; the withdraw would otherwise set any PO back to issued). A price left out stays unpriced, never ₹0. The admin's yes to a cancellation waits for batch 15.
    - [x] **The independent review's findings, all fixed:** (1) `po_general` must refuse an indent line outside the PO's project, or outside its villa when it has one — the screen's pool offers only those (`getIndentPool`) and nothing else checks; (2) a GST % left out takes the item's Masters GST, as both screens prefill it, and an empty one given with a rate must not wipe it; (3) `po_general`'s prices: merge the rows of one indent line first (refuse conflicting rates), then save each line once, from fresh values; (4) `po_charges`: an empty amount sends GST null too, so it removes the charges as promised; (5) `po_line_change`: a discount of one kind given clears the other, as the screen's switch does; (6) refuse a retired vendor or store (`is_active` false) in `po_change` and `po_general`; (7) check every GST % against the active `gst_rates`, as `gst_rate_active` does. Also: say when a part-way pool add left its lines unpriced, try every price and count the refusals, and drop "refused once its goods are received" from `po_cancel_request` (only the admin's approval checks that). Settled while fixing: a retired vendor is refused in `po_from_indent` too, and in `po_change` only when switching to it (one already on the PO stays); a GST % or note given to a PO with no charges and no amount is refused rather than saved as nothing; a GST % taken from Masters is not checked against the list, as the screen keeps it too.
    - [x] **A second independent review** found nothing saved wrong, and these, all fixed: a bulk PO's quantities (above 0, no more than is left to buy) are checked before the PO is made, so a refusal never leaves an empty draft with its number used; a line change's description says a GST % left out keeps the line's own; rows added together round as left-to-buy does (0.1 + 0.2 is 0.3); new charges start at 18%, as the screen's box does; a GST % the line, the charges or Masters already holds is accepted after it is retired, as the screens keep offering it. Left as they are: a villa that is a unit with no plot can't be a bulk PO's villa (none on staging); an order from an indent stopped part-way says how many draft POs it made, not their numbers (the screen's own message).
  - [ ] [Founder] Vet batch 4 on staging: with an approved indent, ask Turing to order it from two vendors with rates — two draft POs, "Saved as PO/…, PO/…"; ask for a bulk PO gathering two villas' lines; change a line's rate and add freight; issue one; ask to cancel an issued one, then withdraw it.
  - [x] **Batch 5, inventory** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-24]` — on `feature/turing-inventory`, no migration: record a delivery against an issued PO (`receipt_new` — into a store, or straight to the PO's villa with the work it serves), issue stock to a villa or another store (`issue_new`), correct a stock count up or down with a reason (`adjustment_new`, the first `signed` amount), fix a delivered line's rate and GST, an issue's work or work class, delete a delivery or an issue recorded by mistake, and decline a site's request — each through Inventory's own saves. The same item or PO line twice is one line, its quantities added. Settled while building: Inventory's delivery save drops a line not on its PO without a word, so Turing checks every line is on it; a delivery (each line no more than is still to come) and an issue (each item no more than the store holds, read from `stock_on_hand`) are checked before the save, so a refusal never leaves an empty delivery note or issue with its number used; a general PO's goods go into a store; retired stores and works are refused (`retired`, now in the kit with `firstRefusal`); a project is sent only for a transfer out of a store tied to none, as the screen asks. Fulfilling a site's request with an issue is left to Inventory's own screen. An independent Opus review found nothing saving wrong quantities, and these, all fixed: a work given on a delivery into a store, and a work or work class on a transfer, are refused instead of dropped unsaid; a project other than the store's own is refused; a delivered line with no rate or GST % yet must be given both, never saved as 0; a retired item's count can't be corrected. Left as they are: a delivery or issue saved but whose invoice number or work class failed shows as refused with the tool's own message, which says it was recorded; amounts take three decimals, so a rate like 12.3456 can't be proposed.
  - [ ] [Founder] Vet batch 5 on staging: with an issued PO, photograph its delivery challan and ask Turing to receive it into a store — "Saved as" the delivery's number, and the stock shows in the store; ask it to issue part of it to a villa for a work, then to move the rest to another store; ask it to correct a count down by 2 with a reason; ask it to delete the transfer.
  - [x] **Batch 6a, work orders** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-24]` — #154, no migration. Batch 6 is split in two pull requests, work orders first because a bill against a work order needs one: make a contractor's work order with its works and terms (`work_order_new`), add works, change the order (contractor, villa, what it covers, terms), change or remove a work — each while it waits for approval, through the editor's own `saveWorkOrder`, which replaces the whole list, so the runner reads the order as it stands and sends every untouched work back unchanged — delete a pending one, cancel an approved one with a reason, switch one off or on, save one as a template, switch a template off or on. Settled while building: a work picked from the list brings its name, and (not a lump sum) its unit and labour rate from the rate book, as the editor's `pickWork` does (`workLineOf`); a lump sum's rate is its whole amount, never the rate book's per-unit rate; terms left out are the default work-order terms, given empty none; only an active vendor marked as a contractor (an order's own stays on a change), active works and Masters' active units (a work's own unit stays) are taken; Bills' line type is declared in Turing, which may not import Bills' rules. Approving waits for batch 15. An independent Opus review found one serious defect, fixed: the editor's save gives every work a new id, so two changes to one order as separate rows saved only the first — changes and removals are now one entry with a row per work, all of an order's rows saved together, and it can re-pick a line's work as the editor does. Also fixed: a quantity or unit given on a lump sum is refused instead of dropped; a work's rate-book unit is taken even after it is retired. Left as they are: a villa that is a unit with no plot can't be named (none on staging); a lump sum from a listed work needs its amount given, where the editor fills in the per-unit rate.
  - [ ] [Founder] Vet batch 6a on staging: ask Turing for a work order to a contractor for a villa with two works from the list and one lump sum — "Saved as WO/…", the works carry the rate book's rates and the default terms; ask it to change one work's quantity and add another; save it as a template; ask it to delete it.
  - [x] **Batch 6b, bills** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #155, no migration: a bill against an issued PO (`bill_po`), an approved work order (`bill_work_order`, each line paying its work) or a muster roll (`bill_nmr`), each through the record form's own `createBillWithLines`; a recorded bill's invoice details, its lines changed or removed in one `saveBillLines`, its charges, a daily-wages total by hand, deleting one, and Send to Bill from labour logs (`labour_to_bill`). Settled while building: Turing gives each new bill line's figures as the paper bill shows them — quantity, rate, GST, discount, other charges — instead of the form's prefill formulas, which live in Bills' rules and which Turing may not import; the admin sees and edits every figure before Save. A line is described as the form describes it (a material by name and code, a work by its order's words); a muster roll's line is daily wages when it is one of the three trades, else "other". Payments, advances and cash requests wait for batch 14, approving and sending back for batch 15. An independent Opus review found five defects, all fixed: a hand-set total left out of a change to its reason kept the total (it was being cleared to the lines' sum) and a reason left out keeps the one there; a PO line with nothing received and not yet billed, and a work already billed in full, are refused, as the form leaves them out; charges and a total by hand are refused on a bill with no lines, as the screen hides them; every description on a bill made from labour entries stays, as the editor locks them; a reason without a total by hand, and a GST % or note with charges being removed, are refused instead of dropped. Also: 0% GST is always taken, as every Bills screen offers it, and a PO line's own GST is taken after it is retired. Left as they are: a bill's lines can't be added to or an "other" line's unit changed through Turing; a work-order bill line takes its order's description; a retired vendor with an open order can't be a muster roll's contractor.
  - [ ] [Founder] Vet batch 6b on staging: with a PO that has a delivery, give Turing a photo of the supplier's bill — "Saved as BILL/…", the lines and total match the paper; ask it to correct one line's rate and add freight; record a contractor's bill against an approved work order; send two days of a contractor's labour logs to a bill with day rates; delete one bill.
  - [x] **Batch 7, Client Relations** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #156, no migration: add or change a client or prospect (a look-alike flagged, as Masters' clients), give a client a plot nobody has, change a plot's record — its two owners, sale deed and construction agreement, bottlenecks, registration, build progress, design checks, interior stage, notes and values — a payment stage's amount, date and invoice, record money received and cancel a wrong receipt, and add, change, delete or cancel actions. Settled while building: Client Relations' plot and action saves are patches (one field per write on screen), so a field left out is simply not sent; its client and payment-stage saves replace every field, so the runner reads them first; a plot is named by its plot and reaches its record through its villa; a step on a plot goes to its side's owner and a side with no owner refuses it, as the composer and `0125` do, so an owner is given only to a step on no plot; owners and handlers are checked against the team; a receipt's day is today and its way bank when left out, as the dialog starts; the fixed lists (deed, original, acknowledgement, registration, bottlenecks, interior stage) are restated for Turing, which may not import them, and Client Relations' saves refuse anything off them. Everything runs as the admin, who sees every plot. An independent Opus review found nothing saving wrong money, and four defects, all fixed: a payment stage or receipt now reads with its plot and client (every plot has a Booking stage, so the stage alone could hit the wrong villa), and a stage change names its plot; a bottleneck off the list is refused instead of dropped, and Turing is told the list is the whole set; a design check already done keeps its date; the plot-assign description says the owner is the client's handler only if they are on the team. Also: a signed-on date only on a signed document, an active build stage, an email address that is one, an owner restated as it is skipped, and a payment stage's note left as it is, as the screen leaves it.
  - [ ] [Founder] Vet batch 7 on staging: ask Turing to add two prospects from a list, one already there under another spelling — flagged; give one a free plot as reserved; mark a sold plot's sale deed signed with the original at the bank; record ₹5 lakh received yesterday by cheque against its booking stage; add an action on that plot's Interior side for next Friday — it goes to the Interior owner; ask it to cancel the action with a reason.
  - [x] **Batch 8, Birdwing** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #157, no migration: book a stay (a returning guest by `guest_id`, a new one by name; rooms by code, R1–R4), block rooms, change a stay's details, move it on (confirm, check in, check out, their undos, cancel with a reason, remove a block), keep check-in details, put a room on a stay or take one off, add a charge from the rate card or its own, remove one, issue and cancel the invoice, record and cancel a receipt, close a stay's pending balance by cross-charge or write-off and cancel one, mark an imported stay reviewed, and add or change rate card heads and cost centres. Settled while building: rooms are named by their code on a row, as staff name them, and sent as the screens' room checkboxes; a charge from the card takes the card's rate and, for a room head, the stay's room-nights, as the form fills them; a balance closed with no amount closes all that is pending (from `birdwing_stay_facts`), never more, and a Goodearth stay is cross-charged to its own cost centre, a guest's written off, when the way is left out; Birdwing's checkboxes send the browser's "on", so a form says what its ticked box sends (`FormSource.ticked`); the invoice settings (letterhead, bank, UPI) and the rooms themselves are left to Birdwing → Settings, and documents to the stay page (Turing attaches no files). An independent Opus review found five defects, all fixed: issuing a stay that already has an issued invoice is refused (the database hands back the old number, which showed as a new one and kept none of the row's details); an enquiry takes no receipt, as the stay page offers none; only a flagged import nobody has reviewed is marked reviewed, so an earlier review is never overwritten; removing a charge that is already gone says so instead of Saved; a write-off's reason is its note, and one without is refused before Save.
  - [ ] [Founder] Vet batch 8 on staging: ask Turing to switch on the rate card's Room rent, Breakfast and Dinner; book a returning guest into R2 for two nights from Friday, two adults; add room rent and two dinners from the card — the rent's quantity is the two nights; record ₹4,000 received today by UPI; issue the invoice — "Saved as MEF/GH/…"; book a team member's stay to Marketing, then ask it to close that stay's balance — it is cross-charged in full to Marketing; ask it to cancel a stay with a reason.
  - [x] **Batch 9, Birdwing Books** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #158, no migration: record an expense line, correct one still recorded, confirm it or mark it recorded again, remove one entered by mistake; mark a person's day (status, times, break, note) or clear it, mark everyone present; and add or change Books' staff, pay rules and expense heads. Settled while building: **confirming a salary stays on the Salaries screen** — its figures are worked out by Books from attendance, the pay rule and occupancy, which Turing may not import, so a proposal could not show the amount before Save, and a confirmed salary closes the month for good; Turing points the admin there. The expense upload stays too: a sheet's lines come through Turing as expense rows instead. The salary head is never offered for an expense and a confirmed salary's line is never touched, as the Expenses screen offers neither; a confirmed line is marked recorded again before it changes; a day already marked keeps what is left out, and a day not worked takes no times; time columns read 08:30:00 and are sent as the forms take them, 08:30; a pay-rule correction keeps its person, and its save reads the three rates through its own helper, so they have their own field test. An independent Opus review found four defects, all fixed: someone who has left is marked only in a month they already have days in (a new day elsewhere brought them back onto Salaries); Everyone present is today's only, as on screen (an earlier day marked people not yet joined); a staff member is linked only to an active toolbox account with a name; an order of 0 is refused, since Books stores it as 100. Also: a zero break on a day not worked passes, and the text limits are the screen's.
  - [ ] [Founder] Vet batch 9 on staging: give Turing a photo of a few Birdwing bills — each a line under the right head and month; ask it to confirm one; mark Appu half day yesterday, in 08:30, out 13:00; ask for everyone present today; give Amal a pay rule from 1 November (base, shift, overtime rate) and check Books → Salaries shows him.
  - [x] **Batch 10, Design Management** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #159, no migration: start a villa's board stage with its people, pass a villa on from the stage it sits at, set where a villa already under way is, set a started stage's status (send back with the reason, or take back a start), its note and its people; add, change, delete and cancel design actions; add, change (name, code, in use, on the board) and move design stages; start a transmittal (one of the villa's sets, or a new one), change a draft's note for site, revision number, what changed and WorkDrive link, set its works, issue it ("Saved as TB-…") and delete a draft. Settled while building: a stage's people are one row each, and the rows of one villa and stage are one save, as the dialogs pick several at once; status, note and people are offered only on a started board stage, as the villa page shows them; the pass rule (only the stage a villa sits at, only to a later board stage) is restated, since Turing may not import Design Management's rules; an admin closes an action directly, so "finished, waiting to confirm" is not offered; a transmittal's works are the complete list, so the ones that stay are given too, and emptying the list stays on the transmittal; uploaded sheets stay on the transmittal page (Turing attaches no files), and so does Read again — saving a link reads the folder, and so does Issue. An independent Opus review found nine, all fixed: a new stage starts off the board, which its description now says (it said on); a retired stage is never switched on or off the board, as the switch is off for it; retired works may stay ticked, as the works tree offers them; a draft transmittal whose drawings were already released is refused before its saves, which would have matched nothing and said Saved; an action nobody has changed is deleted, not cancelled, as on screen — the same fix in Client Relations' cancel (batch 7); the note for site changes on an old draft with no drawing set; Claude is told how to find a new draft's id; a cancelled action is named cancelled, not done; emptying the works list is said to stay on screen.
  - [ ] [Founder] Vet batch 10 on staging: on a villa with nothing started, ask Turing to set it at a later board stage with two of the design team — the stages before it show Done; ask it to send that stage back for revision because the client changed the staircase; ask it to pass the villa on to the next stage with someone else and a note — the villa page and its history show each move; add a design action on that villa for next Friday and give it to someone else; start a new transmittal for a new set, then ask Turing to paste in the WorkDrive link and a note for site — the sheets are listed; ask it to issue it — "Saved as TB-…", and the transmittal is issued; add a stage after another and ask for it on the board — a new column appears.
  - [x] **Batch 11, Selections and Budgets** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #160, no migration. Selections: start a unit's first revision (R0) or the next from its issued one, add spaces, specify items into spaces, change a line's quantity or note, remove a line, ask for a provisional item, issue a draft with its note, delete a draft, and caption, move or remove a space's photo. Budgets: start pricing an issued revision ("Saved as R2-v1"), price a line (quantity, expected vendor, unit cost, margin, notes), approve, re-open, delete a first pricing, and set an item's default margin. Settled while building: items into spaces are one row each, and the rows of one revision are one save, made one add per space, since Selections' add puts every item it is given into every space it is given; a line's unit is the item's, as the grid never changes it; a budget line left out keeps what the grid shows — the line's own figures, or the designer's quantity and the item's margin; adding photos stays on the Selections screen (Turing attaches no files), and photos change only while the unit has a draft, as on screen. An independent Opus review found four, all fixed: a margin left out on a line that has a row but no margin takes the item's default, as the grid shows (it was saved as 0%, charging at cost); clearing a default margin an item does not have is refused rather than said Saved; a margin goes only on an active item, as the margins screen finds; a part-way add of items tells Claude to propose only the spaces not saved, since adding again raises quantities.
  - [ ] [Founder] Vet batch 11 on staging (no Selections data there yet): ask Turing to start R0 for a villa and add a Living room, a Kitchen and two bedrooms; give it a short list of items for the Living room and a bedroom, with quantities — the editor shows them with pictures; change one quantity and add a note; ask for a provisional item the catalogue lacks and put it in the Kitchen; issue R0 with a note; in Budgets, ask Turing to start pricing it — "Saved as R0-v1"; give it costs for two lines, one with a vendor; set a default margin of 20% on another item, then price that line without a margin — it shows 20%; price the rest and approve; ask it to re-open the budget — it becomes v2.
  - [x] **Batch 12a, the Estimator's rate book** `[Opus; Fable's review waived by the founder for this merge: "merge", 2026-10-25]` — #161, no migration. Batch 12 is split in two pull requests, the rate book first because estimates price from it: set a work's unit and labour rate and how the SketchUp model measures it; add, change and remove a work's materials and mixes; copy a work's rate to other works; add, change and delete mixes and their materials; and answer an indent line outside the estimate (approve, or refuse with the reason). Settled while building: units are Masters' active ones, or the one a work or mix already has, as the pickers keep it; a recipe takes active materials (items of kind material) and active mixes, and a work's recipe only once the work has a unit; recipe quantities keep six decimals (a new `Field.fine`), since 0.0144 cum of mortar per sqm rounded is a different rate; the model's ways of measuring are restated, with a test holding them to the Estimator's list. An independent Opus review found eight, all fixed: **deleting a mix in use is refused before the delete**, because the Estimator's delete takes the mix's materials first and the refusal comes after, leaving every work using it priced at nothing (the screen's own Delete has the same flaw: TODO.md); a recipe goes only on a work with a unit; a copy is one row and one save per work, so a part-way failure names that work, and says it may be left with no materials; quantities keep six decimals; an indent answer is only the other answer, and an approval takes no note, as on screen; a refusal's note is said to be read by everyone who sees the indent, so it never names a rate; the descriptions no longer say SketchUp is sent the list, or that only a recipe's use stops a mix's delete; units are 20 characters, as the Estimator takes.
  - [ ] [Founder] Vet batch 12a on staging: ask Turing to set a work's labour rate (one with no rate in the rate book's "Used but not priced" list) and add two materials to its recipe — its page shows the rate per unit; make a mix "M20 test" in cum with three materials, put it in a concrete work, then ask Turing to delete the mix — refused as in use; copy one floor's rate to the same work on another floor; on Site check, if an indent waits, ask Turing to refuse one line with a reason.
  - [x] **Batch 12b, the Estimator's estimates** `[Opus; Fable's review waived by the founder for this merge: "merge if theres anything to merge", 2026-10-25]` — #163, no migration: start a villa's working estimate (blank, or from this villa's official or another villa's estimate), rename or discard a draft, make the working estimate official ("Saved as EST/…") or withdraw an official one; put works on and take them off, type a quantity or put it back to measure; this villa's labour rate, materials (add or change how much, swap, take one out, back to the rate book) and material prices; and add, change, remove, duplicate and copy measurement rows. Settled while building: every change is on a draft, as the estimate page offers it; this villa's rates, materials and prices only on a work set up in the rate book, as the rate dialog opens only there; a measurement row is sent as the sheet's own form sends it, with its own field test; **approving material that reached a villa outside its official estimate stays on the screen** — only the screen's comparison of issues against the estimate knows which arrivals those are, and Turing may not import it; the SketchUp import stays too (a file). An independent Opus review found nine, all fixed: rates, materials and prices were accepted on a work not set up in the rate book, where they showed nowhere and later took over silently; a measurement change taking a sheet to nothing or less is refused before it saves (it saved, then said it failed, inviting a second door deduction); taking out the rate book's only material, an unchanged quantity, and clearing a rate or quantity already empty are refused rather than said Saved; an unchanged quantity no longer gives the work its own list; a listed retired material's quantity can change, as on screen; boxes are above zero; old templates are refused; an estimate is named with its villa.
  - [ ] [Founder] Vet batch 12b on staging (no estimate has works there yet): ask Turing to start a villa's working estimate and put on three works set up in the rate book; measure one wall work with two rows and a door deducted — its quantity is the sheet's total; type a quantity for another; give this villa its own labour rate on one work and swap one material for another; make it official — "Saved as EST/…"; ask it to withdraw that official one with a reason.
  - [x] **Batch 13a, Relay and Directory** `[Opus; Fable's review waived by the founder for this merge: "when its time to merge, just go ahead and merge", 2026-10-25]` — #164, no migration. Batch 13 is split in two pull requests, the rest of Supervisors second. Relay: open a trail by hand (its activities, people and days; queued or started; its departments by name), lay a trail type on a villa as a queued trail, start or remove a queued one; push, finish, bounce (back to an earlier leg, with a reason and a note), mark with the client and back, or hand a baton to someone else — each move names the leg the baton is on, so one that moved meanwhile is refused; file a trail under its project's stage; set its departments; a project's start date and its schedule stages (add, rename or re-time, remove, move up or down); add or switch on and off activities, departments and trail types; change a trail type's activities one at a time. Directory: where a person sits (department, designation, reports to, joined), its departments (add, rename, switch on or off), and the admin's own card and name. Settled while building: `replaceFutureLegs` stays out, as no screen calls it; departments are given by name, since a list of ids is not a field; the bounce reasons and blood groups are restated, each held to its source by a test. An independent Opus review found five, all fixed, and four smaller, taken: a queued trail's departments can change (the trail page counts it as running); a switched-off department a trail has stays on it, as the screen's picker keeps it; only a trail queued on a villa is started or removed, as only the villa's queue offers those; a phone written another way is no change to the admin's card; a trail is named by its activity and title, as Relay's cards name it; a new trail's departments that did not land are said; a trail from a type takes the type's name; a switched-off department is named as switched off; two trails opened together need different titles.
  - [ ] [Founder] Vet batch 13a on staging: ask Turing to open a two-step trail on a villa with a person and days for each; push its baton, then bounce it back with a reason — the trail page shows both; queue a trail type on another villa and start it; add a stage to a project's schedule and move it up; change one person's designation in Directory.
  - [x] **Batch 13b, the rest of Supervisors** `[Opus; Fable's review waived by the founder for this merge: "when its time to merge, just go ahead and merge", 2026-10-25]` — #165, no migration: ask the store for material for a villa's work, and withdraw a request not yet answered; start a villa's checklist (on the villa, or on a stage being worked that the checklist inspects, while none of that stage's is open), fill in its details, answer its checks, sign it off or delete an open one; add and change checklist templates, switch them and their checks on or off, add a check, and set the stages a template inspects one at a time; what a stage follows in the site sequence and how, move it up or down, add or take out a stage, and the typical villa's size; and what reached site from a store's issue or a vendor's delivery, every line given. Settled while building: the checklist file and check photos stay out (files), as do Undo (`restoreStage`) and the stage status and sequence days an earlier batch covers; a delivery older than the villa page's newest twenty may be confirmed, the twenty being a display limit, not a rule. An independent Opus review found one, fixed, and seven smaller, taken: a stage's checklist starts only while the stage is being worked, as the stage's Start sits only there; a confirmation cut off part-way never changes a line already confirmed; the shortage note goes only with a shortage; a material's reason is asked only off the estimate, as the request decides it, and a reason it would not keep is refused; a first stage takes no after or alongside; a site delivery with no villa and a size of 0 get their own words; the work-class labels and check answers read as on screen.
  - [ ] [Founder] Vet batch 13b on staging: ask Turing to request 10 bags of cement for a villa's work and then withdraw it; start a checklist on a villa, answer two checks (one Fail, with a remark), and sign it off once every check is answered; add a check to a checklist template; move a stage up in the site sequence; confirm a store issue to a villa with one line short and a note why.
  - [x] **Batch 14a, money out: bills' payments and funding** `[Opus; Fable's review waived by the founder for this merge: "done merge and wrap up", 2026-10-26]` — #166, no migration. Batch 14 is split in two pull requests, cash requests second. Record a payment on an approved bill (at most its pending, with the day and UTR, cheque or UPI reference) or settle part of it from the same vendor's advance; reverse a payment, advance or recovery with a reason; add, change, close or reopen, and delete (none moved yet) a funding facility; record a drawdown, repayment or interest paid, and cancel one with a reason. Settled while building: Bills' and Financial Management's database guards hold every money rule (approved bills only, never past pending, the same vendor's advance, a reversal once and never of a reversal), and their own words reach the admin; a movement on a closed facility is allowed, as on screen; a payment whose reference is already on that bill, not reversed, is refused as one entered twice (a statement read twice) — a real second one goes on the bill's own page. An independent Opus review found one, fixed, and took four smaller: money is rupees above zero to the paise (a new `paise` field), so what is shown is what is stored — three decimals saved rounded, and 0.004 reached the database as 0; money already reversed is named so; a movement's kind reads as on screen; a facility change says every field it takes. Left as they are: no look-alike flag yet on a recovery or a movement proposed twice.
  - [ ] [Founder] Vet batch 14a on staging: ask Turing to record a payment on an approved bill with a UTR, then ask it again with the same UTR — the second is refused; reverse that payment with a reason — the bill has it pending again; add a test funding facility, record a drawdown on it, cancel the drawdown with a reason, and delete the facility (refused, it has a movement) — then close it.
  - [x] **Batch 14b, cash requests** `[Opus; Fable's review waived by the founder for this merge: "when its time to merge, just go ahead and merge", 2026-10-25]` — #170, no migration: start a week's request; put an approved bill with something pending, or an advance (an active vendor, a project, optionally one of their approved work orders on it), on a draft; what a line asks for (draft) and what it releases (submitted, zero to what was asked) as two changes; take a line off; the draft's note; submit, release, send back with a note, close; delete a draft; pay a released line. Settled while building: the line's cap — released less paid against it, reversals netting out — is the screen's alone, so the runner holds it, and a bill line also at most what the bill has pending; an advance paid keeps the line's vendor, project, work order and note (the founder, 2026-10-26: "it needs to record which work order of course"). An independent Opus review found one serious defect, fixed: one amount entry meant "asked" or "released" by the request's status at Save, so a request sent back in between had its asked-for amount cut — they are now two entries, each refused once the request has moved on. Also fixed: the same reference twice on an advance line is refused as entered twice; a bill line's second payment is pointed to the cash request's page, where it counts against the line; a delete says why it is refused (gone, with the approver, or past release); a line cut to nothing says so; a line reads to the paise with what is paid and its note. Found in Bills, outside this batch, and fixed on the founder's word ("fix it", 2026-10-26): a request sent back kept the approver's cuts, which a draft can't clear and the next release kept — Send back now clears them first.
  - [ ] [Founder] Vet batch 14b on staging: ask Turing to start a cash request for this week and put an approved bill and an advance to a contractor on it; change what the advance asks for; submit it, then ask Turing to release the bill at less than asked; release it, and ask Turing to pay the bill line with a UTR — then the same UTR again, which is refused; ask it to pay more than is left on the advance line, which is refused.
  - [x] **Batch 15, approvals** `[Opus; Fable's review waived by the founder for this merge: "when its time to merge, just go ahead and merge", 2026-10-25]` — #172, no migration: approve an indent or send it back with a note; say yes to a PO's cancellation (refusing one is batch 4's withdraw); approve a work order; approve a bill or send it back with a note; accept a designer's item request as a catalogue item (with a code), merge it into an active item, or reject it. Each runs the tool's own button, and only in the state its screen offers it (`unlessStatus` in the kit): the decisions update by id alone, so one in another state could move a record backwards — accepting a rejected item request would leave its item switched off and read as saved. The guards' own refusals reach the admin: an indent with a line the estimator has not said yes to, a PO with goods received, a bill with money paid against it. Confirming a salary and approving an Estimator reconciliation stay on their screens (batches 9 and 12b). An independent Opus review found nothing serious and three small ones, all fixed: a code left out keeps the item's own instead of clearing it; accepting an item switched off in Masters is refused, since it would join no picker yet read as saved; an approved work order takes bills only while switched on, as Claude is now told.
  - [ ] [Founder] Vet batch 15 on staging: raise and send a small indent, then ask Turing to approve it — Indents shows it approved; send another back with a note — it is a draft with the note on top; ask Turing to approve a recorded bill, then to send it back with a note; on Masters → Item requests, ask Turing to merge one into the catalogue item it duplicates.
  - [x] **Batch 16, Business planning, Reporter and Dexter names** `[Opus; Fable's review waived by the founder for this merge: "when its time to merge, just go ahead and merge", 2026-10-25]` — #174, no migration. Business planning: start, rename or link, copy and delete a plan; its setup (horizon, financing, equity, development period, the land deal, collection terms, the scenario shown); add, change and remove its lines sold and held, and its overheads, selling costs, one-time costs and shared infrastructure. Reporter: rename a saved report or delete it. Dexter: add, rename and delete a project; rename a deck, switch its link on or off, give it a new link, clear its answers, delete it. Settled while building: a plan is one document saved whole by the editor's own `savePlan`, so a line or cost is found by its name within the plan (two of one name are refused until one is renamed, and a new one takes a name no other has); `parsePlanInputs` clamps silently, so every number outside what it keeps is refused before the admin sees it, each limit and starting value held to the parser by a test; Build starts only on a scheduled line and a premium and settlement month only on a JV, as the editor shows them; a line's own terms are both or neither, the other taken from the line or the plan, as the editor's checkbox fills them; shared infrastructure's opex months stay out, as the editor has none; a report's columns, filters and chart stay on Reporter's builder, and Dexter's files on Dexter's screen. An independent Opus review found two, fixed, and three smaller, two taken: an empty box was saved as another number (an empty booking % as 0% own terms, an empty Built as built to order) — no plan box is ever emptied now, as the editor has none; a plan's numbers take up to ₹99,999 crore and six decimals (a new `Field.wide`), so ₹150 crore equity or 0.3333 sales a month can be proposed; the warning that a plan open in another tab saves over Turing's change is said on the proposal card (a new `Entry.warning`), not only to Claude. Left as it is: `savePlan` reports saved on a plan deleted meanwhile, as on screen; the open-tab overwrite itself needs a version check in Business planning (TODO.md).
  - [ ] [Founder] Vet batch 16 on staging: ask Turing to start a test plan with one line you sell (say 20 villas) and one overhead; open the plan — both are there with the editor's other numbers as a new line has them; with the plan closed, ask it to change the villas' house price and set the plan to the High scenario; ask for a financing rate of 150%, which is refused before Save; copy the plan, then delete the copy. In Dexter, ask Turing to rename a deck and switch its link off — the link stops opening — then on again.
  - **The catalogue**: one entry per thing Turing can do, in `lib/turing/entries/<tool>.ts` (its fields, a plain description, and the form it fills) and `lib/turing/runners/<tool>.ts` (how a row becomes the action's call); `lib/turing/catalogue.ts` gathers the runners, and the type refuses an entry without one.
  - `propose`: Claude names an entry and gives rows; the chat shows them as an editable table — each row new, "looks like <existing>" for Masters (same GSTIN or phone, or a near name), or refused with the reason. Untick, edit, **Save**.
  - **Save** (`lib/turing/actions.ts`) re-checks the admin, then calls the entry's own action once per row, in order, and shows a result line per row: the record's number and a link to it, or the action's own refusal. Nothing is retried on its own.
  - The first pull request carries the Save and the most-used entries; the rest follow in small batches, each entry with its field test.
  - Verify: the photo of a paper indent → a proposed indent → Save → numbered and off for approval like any other; a 20-vendor sheet with two duplicates — both flagged, 18 saved, each with the admin as creator; a proposal the tool refuses shows the tool's own sentence.

## Risks Fable checks

- The rule change above: the exception's edges, and whether `check:boundaries` holds them.
- Vercel's function ceiling on the current plan against a long page build — streaming keeps the line open, but the ceiling is real.
- `read_rows` sees all an admin sees. `requireAdmin` in the route and `is_admin()` on the tables keep it from anyone else; it must never be offered behind a grant.
- A poisoned file: Turing has no web, its pages cannot send anything out, and nothing saves without the admin's press — the worst it can do is a wrong proposal the admin sees before saving.
- Saved recipes read tables by name, so a renamed column breaks a page's Refresh — it says so, and nothing else reads through Turing.

# Supervisors, rebuilt — the site board and its schedule (proposed 2026-10-22, schedule settled 2026-10-23, waiting for the founder's approval)

## Why

The founder, 2026-10-22: the Supervisors screens are "clunky as hell". Give it the feel of Design Management and Client Relations, show what stage or work is being done now and what is next, so supervisors can plan labour and material, and make the checklists turn up as part of the stage being worked.

Today a villa page is one long scroll of tables (drawings, labour, requests, deliveries, checklists, materials), and nothing says where the villa is. Design Management and Client Relations feel good because each villa is **a card on a board with a rail showing where it stands**, a page that opens on **what is happening now and what is next**, and **taps that save at once with Undo** instead of forms. Supervisors gets the same, built for a phone at site.

Branch `feature/site-board` off `staging`, worktree `..\toolbox-os`. One pull request per phase; the founder vets each on staging.

## The model — a villa moves through stages

- **A stage is a work group** — `SS.01 Block work up to GF lintel`, `FD.02 Dry rubble`… — in the order of **the site sequence** (below), not the works list's order: slab conduiting comes before the slab it sits in, landscape last. Groups are what the rate book prices per sqft and what stage billing pays, so the site, the estimate and the bills speak about the same stage. (Coarser than this are Client Relations' nine build stages; finer are single works.)
- **A villa's programme is the stages its official estimate covers** (the groups of the works on `estimate_takeoff_facts`, plus any stage someone adds by hand). No official estimate yet: the full list for the villa's type of work, every stage "not started".
- **Each stage on a villa has a status**: not started → working → done, with **waiting** (for material, labour, an inspection or the client, and a note) as a side state; the contractor on it; and when it really started and finished. Its planned dates are worked out by the schedule, never typed. **The first labour logged on a stage starts it by itself**; done is a tap.
- **Now** is every stage working or waiting; **next** is the first stages not started after the furthest stage begun (an earlier stage nobody recorded stays in the programme, not in Next). Derived on every read, never stored as the villa's position (the Design Management rule).
- **Health**, first match wins: waiting more than 3 days · past its planned finish · no labour on a working stage for 5 days · a checklist with a failed check · a delivery not confirmed for 2 days · on track.
- **One supervisor per villa** ("who runs it") for a Mine / Everyone switch. Everyone still sees every villa (founder, 2026-08-20) — this is a filter, not a permission.
- **Checklists belong to stages**: each checklist template is linked to the work groups it inspects (pre-filled from its old work codes, edited under Supervisors → Checklists). A working stage shows its checklist; marking a stage done with its checklist unsigned asks once, "Done without signing off the Blockwork checklist?" — a nudge, never a block (site work never waits), unless the founder decides otherwise.

## Migration `0137_site_programme.sql` `[Opus drafts, Fable reviews unless waived]`

Supervisors' own tables, RLS `/supervisors` on every verb, write revokes and an assert at the end; no money anywhere.

- `site_villas` (plot_id pk, supervisor_id → profiles, note, `start_on` — the one typed date of the schedule, `baselined_at`).
- `site_stages` (plot_id, work_group_id, unique together; status `not_started|working|waiting|done`, waiting_on `material|labour|inspection|client|other`, waiting_note, started_on, finished_on, contractor_id → vendors (contractor only, the labour-log guard's rule), `days` — this villa's own length when someone sets it, `pinned_start` — a start fixed by hand, `baseline_start`, `baseline_finish` — the first plan, written only by "Set the first plan"). A guard: done needs started_on and finished_on; finished_on not before started_on; days at least 1.
- `site_sequence` (work_group_id unique, position, `follows_group_id` → work_groups (null = the first stage), `link` `after|alongside`, `wait_days` ≥ 0, `typical_days` ≥ 1 or null) and `site_schedule_settings` (one row: `typical_sqft`, the size the typical days are for). Supervisors' reference data: read and written by `/supervisors`; a cycle in `follows_group_id` is refused by a trigger.
- `site_stage_events` — the history, written by a trigger on `site_stages` (who, when, from → to, note), append-only, no client insert (the Design Management pattern).
- `labour_logs` insert trigger: the first log on a stage of a villa starts it (`working`, `started_on` = the log date) if it is not started. Trigger-only definer, execute revoked, Supervisors writing Supervisors.
- `checklist_template_groups` (template_id, work_group_id) — the link.
- View `estimate_work_facts` (unit_id, work_item_id, quantity, uom) — the official estimate's work quantities, **money-free**, guards `/estimator`, `/indents`, `/inventory`, `/supervisors`, writes revoked, manifest row. Lets the site plan "1,800 sqft of block work, 640 done".

## Phases — one pull request each

### A. The engine and the villa page `[Opus — migration, rules; Sonnet — screens]`

- [x] [Opus] `0137` applied to staging 2026-10-23, types regenerated (aaf028b). Fable waived; Opus reviewed plus an independent read (no defects; its notes taken: an edit fires the labour trigger only when the work changes, seeds fill only empty tables). The labour trigger runs as the caller, not a definer — only `/supervisors` writes labour logs, and Bills' stamp moves only `bill_id`. Trial `scripts/trials/site-programme.sql`, proven against three broken copies. The backfill started 11 stages from existing labour.
- [x] [Opus] `lib/supervisors/programme.ts`, pure and tested: a villa's stages in order, now / next, health, days in stage, how much of a stage's work is logged (piece-work quantities against `estimate_work_facts`).
- [x] [Opus] The villa page below, the stage actions, and the shared `StageRail` / `HealthPill` / `SectionHead` (their third copy; Design Management and Client Relations move onto them in phase D). Seen at 390×844 in light and dark through a probe with sample data. Fable waived; Opus reviewed with a second unanchored read, which found two client bugs fixed before the pull request (the waiting question kept its last answer; the stage sheet's dates went stale after a status tap) and smaller ones taken (days in India time, progress counts standard work only, Next skips an untouched earlier stage, a rounded "what's left").
- [x] [Opus] `0138` on staging, on the founder's word: Undo puts a stage's clock back — a change of status may carry the time it entered that status before, taken only when its history records that time (trial `scripts/trials/stage-undo-clock.sql`, proven against a broken copy). No policy, grant, view, definer or money, so no Fable review.
- [ ] [Founder] Vet phase A on staging.
- **The villa page, rebuilt phone-first**, top to bottom:
  1. **Header card** (the Design Management header): plot number large in mono, villa name, health pill, the **stage rail** (one segment per stage, coloured by status, the working one marked), the supervisor's face.
  2. **Now** — a card per working or waiting stage: its name, day count, the contractor, "640 of 1,800 sqft logged". Four big buttons: **Log labour** (opens pre-filled with this stage's works and its contractor), **Request material** (pre-filled from this stage's estimate list), **Checklist** (a progress ring, "12 of 21"), **Done** / **Waiting**. Status chips save on tap with Undo.
  3. **Next up** — the next one or two stages: the contractor (tap to pick), their dates once phase B lands, and **materials readiness**: each material the estimate needs for it, how much is already drawn, how much the stores hold (`stock_by_location`, open to every signed-in person), with **Request what's left** (one request per material, the off-estimate rule unchanged).
  4. **Deliveries to confirm** (only when there are any) — the existing confirm sheet.
  5. **Programme** — every stage as a row in site-sequence order: status chip, actual dates, its checklist's state; tap to open a stage sheet (contractor, waiting note, history).
  6. Collapsed below: labour log, requests, materials work by work, drawings, history.
- Labour and request dialogs become bottom sheets with chips (work class, contractor, the stage's works first) instead of long selects.

### B. The schedule that adjusts itself `[Opus — the rules and the sequence; Sonnet — the screens]`

Settled with the founder 2026-10-23. Dates are worked out on every read, never stored (Relay's rule 5); the only typed inputs are a villa's start date, the sequence, and a stage's own days or pinned start when someone sets them.

- **The site sequence** — Supervisors → Sequence, one list for every villa: each stage starts **after** the stage it follows finishes, or **alongside** it (starts with it), plus **wait days** (curing). Typical days per stage, for a villa of `typical_sqft`. Opus seeds a draft order of the 43 groups in `0137` with typical days blank; the founder and the site team correct it on the page. A villa's own programme is the sequence minus the stages its estimate does not cover; a stage following a dropped one follows what that one followed.
- **A stage's days**, first that applies: this villa's own `days` → **learned**, once 3 or more villas have finished that stage: the middle value of their days per sqft × this villa's sqft ("learned from 4 villas") → typical days × this villa's sqft ÷ `typical_sqft` → no days, so no dates past it and the stage says "days not set". The villa's sqft is its official estimate's `SS.01.00` package quantity through `estimate_work_facts`; no official estimate, no scaling. **Calendar days** — every day counts (founder).
- **The forecast**, stage by stage in sequence order: done = its real dates; working or waiting = started on, finishing at started + days or today, whichever is later (running long pushes everything after it); not started = the later of what it follows (finish, or start when alongside) + wait days, its pinned start, and today. The villa's first stage starts on `start_on`. **Forecast handover** = the last finish. A pinned start that its chain has overtaken shows "behind" instead of moving.
- **The first plan** — "Set the first plan" on the villa (once `start_on` and every stage's days exist) writes today's forecast into `baseline_start` / `baseline_finish` and `baselined_at`; resetting it later asks for a note, recorded in the stage history. The villa then reads "Handover forecast 14 Mar · 12 days behind first plan", and each stage shows its slip.
- **Screens:** the villa header gains the forecast handover and slip; **Next up** gains its dates; a **Schedule** section on the villa page — one bar per stage on a date strip, phone-wide, scrolling sideways, today marked, the first plan as a faint bar behind; the stage sheet gains days and pinned start. `lib/supervisors/schedule.ts`, pure and tested (chains, alongside, dropped stages, running long, pinned behind, learned vs typical, no days).
- **Not here:** Client Relations' handover date following the forecast (a cross-tool read, its own decision); Relay stays as it is — it tracks who holds a task, not site work.
- [x] [Opus] Built 2026-10-23 on `feature/site-schedule`, code only (no migration). The founder said "keep finishing, no need to stop" — taken as the go-ahead for B and Fable's review waived for this merge; Opus reviewed with a second unanchored read. `schedule.ts` tested (14 cases); "past its planned finish" joins health; every new select run at staging; the writes tried as a `/supervisors`-only person and as the probe (`scripts/trials/site-schedule.sql`, proven against a broken copy); the Sequence list, Schedule card and strip seen at 390 wide through a probe. Two settled details: a stage following one the villa does not have takes no wait of its own from it, and learned days fall back to the plain middle days when sizes are missing — **no official estimate on staging has `SS.01.00` yet**, so no villa scales until one does.
- [ ] [Founder] Vet phase B on staging.

### C. Checklists that feel quick `[Sonnet, Opus vets]`

- **The checklist runner**: one check per screen on a phone — the check in large type, its "to confirm" note, three big buttons (✓ Pass, ✕ Fail, N/A); Pass moves straight to the next; Fail and N/A open the remark with the keyboard up; a camera button attaches a photo to that check (`lib/native` camera on the app, the file picker on the web). A progress ring fills as it goes; "All clear ✓" on sign-off (respecting reduced motion). The list view stays for review.
- `site_checklist_items` gains `photo_path` — in `0137`, so one migration.
- Supervisors → Checklists: each template shows and edits the stages it inspects.
- [x] [Opus] Built 2026-10-23 on `feature/checklist-runner`, code only (`photo_path` came with `0137`). An open checklist opens on the runner; `?view=list` is the list with the details. The photo button asks for a picture (`accept="image/*"`, no `capture`), so a phone and the app offer the camera beside the gallery. Writes tried under RLS as a `/supervisors`-only person and as the probe (`scripts/trials/checklist-runner.sql`, proven against a broken copy); the runner seen at 390 wide through a probe. Fable waived as for B.
- [ ] [Founder] Vet phase C on staging.

### D. The site board `[Sonnet, Opus vets]`

- `/supervisors/villas` becomes **the board**, as Design Management's: health chips with counts, Mine / Everyone, project filter; on a desktop one column per stage family (Foundation, Structure, MEP, Finishes, Handover) by each villa's current stage; on a phone a stacked card list grouped the same way.
- **The villa card**: plot number, villa name, health pill, the stage rail, "Now: SS.01 Block work · day 6", "Next: SS.02 Lintel · from 28 Oct", the forecast handover and its slip, open deliveries and requests as small counts, the supervisor's face.
- `StageRail`, `HealthPill` and `SectionHead` move into `components/ui/` — this is their third copy (DESIGN.md).
- [x] [Opus] Built 2026-10-23 on `feature/site-board-d`, code only. Columns are the work categories in the order the sequence reaches them (the plan's five families are not in the data; the categories are). The shared rail, pill and head were already in `components/ui/` from phase A; Design Management and Client Relations move onto them when next touched. The board's reads run at staging; cards seen at 390 wide through a probe. Fable waived as for B.
- [ ] [Founder] Vet phase D on staging.

### E. Planning the week `[Opus — the reads; Sonnet — the screen]`

- **`/supervisors/plan` — Look ahead**, across the supervisor's villas (Mine by default), from the schedule's forecast, in buckets: **Starting this week**, **Next two weeks**, **Waiting**, **Behind the first plan**. Each stage row: the villa, forecast dates, contractor, and its material readiness — so a supervisor sees on Monday which crews to line up and what to request before the stage starts, and can request it from the row.
- **Labour** on the same page: per contractor, the stages they are planned on in the next two weeks, so a clash shows ("Rafeeq Masonry on 3 villas from Monday").
- The Supervisors welcome counts become: working stages, starting this week, waiting, deliveries to confirm.

- [x] [Opus] Built 2026-10-23 on `feature/look-ahead`, code only. Buckets: this week is today and the six days after, the next two weeks the fourteen after that; a stage already begun is in Now on its villa, not here. **Behind the first plan** lists villas, not stages — every stage after a late one slips with it, so per-stage rows would only repeat the villa. Contractors are shown over the same three weeks as the buckets (the plan said two). A clash is two villas' stages for one contractor overlapping in time; a stage with no days counts as running to the end of the three weeks. An untouched stage before the furthest begun one is left out, as Next up leaves it out. Material readiness reuses the villa page's own read for each villa with something starting; Request opens the villa's request sheet narrowed to the stage. Rules in `lib/supervisors/look-ahead.ts`, tested. Fable waived as for B.
- [ ] [Founder] Vet phase E on staging.

## Verification

Pure rules tested (`programme.ts`, `schedule.ts`, health, readiness). `0137` dry-run with a trial as a supervisor and as the probe; the labour trigger trial (first log starts the stage, a second does not move it, a done stage stays done); the sequence cycle refused. Every new select run at staging. Phone screenshots at 390×844 of the villa page, the schedule strip, the runner and the board before each merge. The founder vets each phase on staging.

## Next session — start here, after "read CLAUDE.md"

Done 2026-10-22/23: #122 vetted, the masters import, the questions settled, and **phases A–D merged into `staging`** (#123 programme, #124 schedule, #125 checklist runner, #126 board); phase E (look ahead) is its own pull request.

1. **Ask the founder how A–E looked on staging**, phase by phase, from the Verification checklists in each phase's pull request. Anything broken is fixed first.
2. Still theirs: typical days per stage from the site team (Supervisors → Sequence) and each villa's start date; re-send the works list to SketchUp.
3. When this plan is vetted, what lasts is already in `app/(dashboard)/supervisors/PLAN.md`; this section goes.

## Settled by the founder, 2026-10-23

1. **A stage is a work group** — 43 on a villa today (FD 4, SS 11, PF 3, F 4, LP 8, MEP 11, CAR 2).
2. **The masters import ran first** (2026-10-22).
3. **Done without a signed checklist: a nudge**, never a block.
4. **One supervisor per villa**, set on the villa header; Mine / Everyone is a filter, not a permission.
5. **Fable's review of `0137` is waived**; Opus self-reviews with a second unanchored read and a probe trial, recorded here.
6. **Later, not in this plan:** Client Relations' build stage following the site's progress (a cross-tool write, its own decision).

# OS process updates — the build plan

## Context

The operations team sent "Requested OS Process Updates" (18 asks across Estimates & Procurement, Supervisor, Commercial, Work Master), a revised masters workbook (`Tb\1.xlsx`), the site checklists workbook (`Tb\3.xls`), and three notes on what the current Masters is missing (SS/MEP not divided into groups; Infra, Maintenance and Mobilisation works absent; no GST column on items). `Tb\later.xlsx` (steel reinforcement abstracts, tile quantities per plot) is named "later" and is **parked** — not in this plan.

Staging's database is becoming production (`TODO.md`), so **nothing here deletes a master or a record**: works are added, re-parented, re-coded or deactivated, never removed. Every migration is additive, applied to staging only (`0131`+), vetted by the founder on `staging.goodearthkannur.org`, then shipped on their word.

The founder's decisions (2026-10-22):

1. **Villa works adopt the Infrastructure sheet's new numbering** (`FD.02.04`, `SS.01.02`). That sheet's "Buildings" section is the master for villa works; the "Villas - Work" sheet is not read.
2. **Each SS/MEP group gets one package work** carrying the ₹/sqft; sub-works are unpriced site-tracking works.
3. **Order: Masters first**, then the small screen fixes, then the three builds.
4. **Budget vs actual is visible to `/estimator` and `/bills` holders** (plus `/reporter`), through a money view gated in its own WHERE.

**Approved by the founder 2026-10-22.** Work on `feature/os-updates` in its own worktree (`../toolbox-os`); one pull request per wave. Ticks below are the live board.

**The founder waived Fable's reviews for this build** (2026-10-22: "skip fable review you review and merge"). Opus reviewed the full diff and the four drafts, with a second unanchored read of the app code. The six bugs it found were fixed before #119 and #120 were merged into `staging`.

### Next session, in order — after "read CLAUDE.md"

1. ~~**Masters import.**~~ **Done 2026-10-22.** The command, for a re-run (it should find nothing to do):
   `npx tsx scripts/import-masters-workbook.ts --project ipstebqawrvhkyntctrv --xlsx "C:/Users/goodearth/Documents/Tb/1.xlsx"`
   Then run the same command with `--commit`. Then tell the founder to send the works list to SketchUp again, and to re-tag models that use old codes.
2. ~~Apply `0133`–`0136`~~ — **done 2026-10-22** on staging's database, on the founder's word: dry-run with every trial first, then applied; types regenerated; `db:check`, `db:check-views` (13 money views) and `db:check-policies` pass; SECURITY.md and STATUS.md updated.
3. ~~Build the screens~~ — **done 2026-10-22**, one commit each: Send to Bill without a work order; additional charges on POs and bills; site checklists (`Tb\3.xls` saved as `Tb\3.xlsx`, loaded on staging on the founder's word: 11 templates, 238 checks); site receipt; Budget against actual (the Estimator's screens moved into a `(tool)` route group so the page can admit `/bills`); stage billing; the Inventory Items view and work-class correction.
4. ~~One pull request into `staging`~~ — **merged as #122, 2026-10-22**, after CI. Fable waived; Opus re-reviewed with a second, unanchored read, which found four bugs fixed before merge: a half-saved site confirmation read as complete; stage billing took bills that name no stage as ₹0; "left" on the budget page leaned the wrong way when spending was unpriced; charges past two decimals broke the paisa match. **The founder vets on staging.**
5. **Later:** the cramped Design board (`TODO.md`); `Tb\later.xlsx` (steel and tile takeoffs), parked.

## What already exists — remind the founder, build nothing

| Ask                                                                                     | Status            | Where                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E&P 1 Material requests linked to approved estimates, separate approval for unbudgeted  | **Done** (`0113`) | A line the estimate doesn't cover needs a reason and the estimator's yes in Site check before the approver can approve. Only an "Urgent" mark is missing (Wave 2).                                              |
| E&P 2 Duplicate rows in the Estimator                                                   | **Done**          | Measurement sheet: **Duplicate** on a row, **Copy rows to another work**. A work can appear once per estimate by design (`unique (estimate_id, work_item_id)`).                                                 |
| E&P 3 Indents from the estimate for a stage                                             | **Partly**        | Pull is per work, with "Show every work". A stage (category) filter is Wave 2.                                                                                                                                  |
| E&P 4 Consolidated POs, traceable per indent                                            | **Done**          | A General PO gathers several villas' approved indents; every PO line keeps `indent_line_id`; the indent shows "still to buy".                                                                                   |
| E&P 6 Highest PO rate as budgeting rate; actuals at purchase rate; budget versions kept | **Done**          | `0103` raises `items.indicative_price` on a dearer PO, never lowers; `0108` batches carry the PO rate so issues are valued at what was paid; official estimates are numbered and superseded, never overwritten. |
| Commercial 3 Additional charges separate from the rate                                  | **Partly**        | Per-line "Other charges" (after GST) exist on PO and bill lines and print. A document-level charge with its own GST is Wave 2.                                                                                  |
| Commercial 5 Advances to suppliers                                                      | **UI only**       | The database already allows any vendor; only the picker filters to contractors. Wave 2.                                                                                                                         |

Everything else below is new.

## Wave 1 — Masters: the works list and GST on items `[Opus orchestrates]`

- [x] [Opus] `0131` applied to staging; importer, readers and tests; Masters works by family, items GST, pickers, PO GST; docs. Commits 18cbe59, a97c126.
- [x] [Opus] On the founder's word, `--commit` on staging 2026-10-22 (246 of 270 works kept, 24 off, 444 new; no vendor or material changes). Backup in `data/backups/`.
- [ ] [Founder] After the import: send the works list to SketchUp again, and re-tag any model using old codes (FD.14 is now FD.03.03).
- Found in the sheet, for the founder: the Finishes remarks sit one row low (fixed in code); FD.04.06 "Plinth Beam" and its works sit under FD.04 Pile Foundation; Engineering Consultation for villas (ENC.1–3) has no place in the new sheet and is switched off.

### Migration `0131_works_families_and_item_gst.sql` `[Opus drafts, Fable reviews — touches Masters' open tables, no RLS change]`

- `work_categories.family text` — the sheet's Stage column: `Site Mobilisation`, `Infrastructure - Civil`, `Infrastructure - MEP`, `Buildings`, `Maintenance`. CHECK on those five. Backfill existing categories as `Buildings`.
- `items.gst_pct numeric null check (gst_pct >= 0 and gst_pct <= 100)` — null means "not entered". Validated against active `gst_rates` in the action, no FK (the PO line copies the number the same way).
- Re-run safe, ends in asserts. Types regenerated (`npm run db:types:staging`) and committed with it.

### Importer rewrite `[Opus — the matching; Sonnet — the sheet reading]`

`scripts/import-masters-workbook.ts` + `lib/masters/masters-workbook.ts` (pure, tested). The workbook layout changed, so:

- **Sheets read:** `Vendor & Contractor Names` (unchanged), `Material Master` (now with `GST %` in column G — read it when present; `18%` or `18`), `Material Category`, `Infrastructure - Work ` (note the trailing space — match sheet names trimmed), `Mobilisation - Works`, `Maintenance - Works`. The `Stages` sheet is gone — **construction stages are no longer touched by the importer**; the `Villas - Work` and `Project IDs` sheets are not read.
- **Row classification in the works sheets** is structural, replacing the old code-pattern rules: column A = family (carried down), column C filled = a heading (a category when its code is blank, a group when it has a code), column D filled = a work. A category's code is its children's prefix (`FM` from `FM.01`); for `Buildings - Foundation` style rows the stage itself is the category (`FD`, name `Foundation`). `Mobilisation - Works` → category `SM`, family `Site Mobilisation`, ungrouped works `SM.1`–`SM.12`. `Maintenance - Works` → category `MAIN` "Maintenance", family `Maintenance`, its section rows become groups coded `MAIN-1`…`MAIN-10`, works `MAIN.1`–`MAIN.50`.
- **Package works:** a group heading whose Unit column is a percentage and whose rate is filled (every SS and MEP group) also yields a work coded `<group>.00` (`SS.01.00`), named after the heading, `uom = 'sqft'`, `labour_rate` = the sheet's rate, `model_measure = 'manual'`. The percentage itself is not stored (the rate is already the share).
- **Matching old rows to new (the hard part):** codes changed wholesale, so match each existing work to a new row by **category + loose name** (`looseKey`, with `2-Side`/`Two-Sided` and `&`/`and` normalised), a hand table `WORK_REMAPS` in `masters-workbook.ts` for the rest (old code → new code), matched on code AND name like the existing fix tables so a sheet edit fails loudly. Today's priced SS/MEP heading works (`SS.3` "Ground Floor Lintel Beam RCC Work" 18.4 …) map to the new package works. A matched work keeps its **id** (every FK — estimates, logs, issues, drawings, work orders — follows) and takes the new code, name, group and sort order. Codes are swapped through temporary values inside the one transaction (old `SS.3` is a sub-work's new code).
- **Never delete.** An old work with no match is **deactivated** and listed; so is an old group or category no longer named. `SS.2A` (under ENC), `SS.AS`, `SS.A` — the hand-added leftovers — are matched or deactivated like any other. The `blockers()` stop and the count assertion are replaced by: asserts that every active work in the database is in the sheet, every sheet work exists, and no row was deleted.
- **Rate book:** written as today (`estimator_work_info` upsert) for rows with a unit; a rate the sheet no longer gives is **left alone** (not deleted) and listed. The `model_measure` backfill is re-keyed to the new codes (`FD.03.04` base and sides; `FD.03.05`, `FD.04.04`, `FD.04.11`–`FD.04.14` and every sqft package work manual).
- **Materials:** as today, plus `gst_pct` from column G **only when the cell is filled** — blank keeps what Masters holds (the founder enters GST by hand). Deletion of a material no longer listed stays as today (the sheet is the same 1,118).
- **Dry run prints the whole tree** — family → category → group → work, with `=` kept, `~` renamed/re-coded (old → new), `+` new, `−` deactivated, and a "could not match" list. **The founder reads the dry run before `--commit`.** Backup to `data/backups/` first, as today.

### Screens `[Sonnet]`

- **Masters → Works:** group by family, then category, then group; a family switch at the top; package works marked. Edit forms gain the family on a category.
- **Masters → Items (materials):** a GST % column and field (a select over active `gst_rates`, blank allowed). `lib/masters/items.ts` / `items-actions.ts` (two-file rule).
- **Every work picker** (Indents, Supervisors, Inventory issue/receipt, Estimator add-works, Bills work orders, Design Management sets): `<optgroup>` per category already; add the family as a prefix on the category label (`Buildings · Foundation`). The list grows from 270 to ~780 works, so the pickers that are plain `<select>`s stay; nothing new.
- **Purchase Orders → From an indent:** GST suggestion order becomes **the item's `gst_pct` when set, else the last PO's**; the pool-line grid defaults GST from the item too (`lib/purchase-orders/from-indent.ts`, `line-grid.tsx`).
- **Estimator:** "Download works list for SketchUp" carries the new codes; the From-the-model page's refusal message says to re-send the list (`estimator/PLAN.md` decision 12 updated). The Goodearth QS plugin (outside this repo) matches on code, so the founder re-sends the works list once after the import.

### Docs

`masters/PLAN.md` (the workbook section rewritten: what each sheet gives, the never-delete rule, families, package works, GST), `estimator/PLAN.md` (package works, re-send the list), `STATUS.md` Masters line, `TODO.md` item 3 ("rebuild the rate book's materials") stays.

### Verification

`npm test` (new tests for the row classifier, package works, name matching, GST cell), dry run against staging and read the tree, `--commit`, then open Masters → Works (families, SS/MEP groups with package works), Masters → Items (set a GST, see it), Estimator → Rate book (SS packages priced), one existing estimate (lines still named right), Supervisors villa page (labour log work picker), Indents new (work picker). Re-send the works list to SketchUp and import a takeoff once.

## Wave 2 — the small fixes `[Sonnet builds, Opus vets each commit]`

- [x] [Opus] Built with no migration, on `feature/os-updates` with Wave 1: 2 (stage links on the pull page), 7 (the Reporter dataset; the Inventory Items toggle is still to do), 9 (the order picker searches in the browser, not yet on the server), 10 (label "Contractor or supplier"; the Contractors page keeps its name), 11 (its own search form, since the page's toolbar owns `q`).
- [x] [Opus] 1, 3, 5, 6 on `feature/os-updates-2` with `0132`: columns and invoker guards only (no view, definer, policy or money), so applied to staging after a dry run and `scripts/trials/small-fixes.sql`, run as a supervisor and a store-keeper and proven to fail with the request guard broken.
- [ ] [Fable] 4 and 8 need `0133`: `send_labour_logs_to_bill()` is a definer and the charges are money. Drafted for review; nothing applied.

One migration, `0132_small_fixes.sql` `[Opus drafts; Fable reviews the Bills function and the Supervisors columns]`, holding every column below; each fix is its own commit.

1. **Urgent indents** (E&P 1). `indents.is_urgent boolean default false`. A tick on the indent form, a red "Urgent" badge on the list, the approver's list sorted urgent-first, the welcome count. Editable while draft only (`indents_guard` tuple). The push notification text is unchanged.
2. **Indent pull by stage** (E&P 3). On `/indents/[id]/pull-estimate`, a **Stage** select (work categories present on the official estimate) beside "Show every work"; `factsForWork` gains a category filter in `lib/indents/pull-rules.ts` (tested). No migration.
3. **Deduction rows** (E&P 7). `estimator_estimate_line_measurements.is_deduction boolean default false`; the four `> 0` checks stay — a deduction is a positive row subtracted, so "2 × 1.2 × 2.1, deduct" reads plainly and prints with a minus. `measurementQuantity` / `sheetTotal` in `calc.ts` subtract deductions (tested); `syncLineQty` still refuses a total not above zero; model rows are never deductions (`0118`'s import never sets it); the copy function `estimator_copy_estimate_contents` must carry the column (assert it, as `0118` did for `from_model`). A "Deduct" tick on the row form and a −/opening label in the sheet. `estimator/PLAN.md` decision 6 updated ("additions only" goes).
4. **Piece-work without a work order** (Supervisor 1). `send_labour_logs_to_bill()` accepts a null work order for piece-work: the bill is then kind `nmr` with the contractor as vendor, lines priced from the rate book's `work_labour_rate_facts` as the suggestion (no order line to suggest from). Send to Bill's picker becomes optional with the sentence "No work order — billed as a direct labour bill." `lib/bills/labour-billing.ts` tests cover both. Fable reviews the function (it is a definer that checks `/bills`).
5. **Work classification** (Supervisor 4). `work_class text not null default 'standard' check in ('standard','additional','rework')` on `labour_logs` (added to `labour_logs_one_per_day` and the billed guard's tuple), `stock_issues` (header, beside the work — one issue, one work, one class), and `issue_requests` (so the supervisor's request carries it and Fulfil pre-fills it). Three-way segmented control on the labour form, the request form and the issue form; shown on the villa page's labour list, the issue note, Send to Bill's rows and the bill line description. `0104`'s `labour_logs_shape_matches_kind` untouched.
6. **Invoice number from the GRN** (Commercial 1). `goods_receipts.invoice_no text`, `invoice_date date` (nullable; challan stays). The receive form asks for them. The bill form, once a PO is picked, lists that PO's receipts' invoice numbers and dates (not yet on an approved bill) and pre-fills when there is exactly one. Bills reads `goods_receipts` directly — a new read in STATUS.md's contract row for Bills. Shown on the receipt page.
7. **Material issue report by location** (Commercial 2). A Reporter dataset `stock_issue_lines`: project, issue no, date, from store, to (plot or store), work, work class, item, code, quantity, unit — money-free, built on the open stock tables (`lib/reporter/datasets.ts`, `datasets/types.ts`). Plus an **Items** toggle on `/inventory/issues` that lists lines instead of headers under the same filters (plot, store, dates).
8. **Document-level additional charges** (Commercial 3). `purchase_orders.charges_amount numeric`, `charges_gst_pct numeric`, `charges_note text`; the same three on `bills`. `lib/purchase-orders/math.ts` and `lib/bills/math.ts` add "Additional charges" and their GST as their own `summaryRows` entries (tested); `bill_lines_roll_up` adds them to the header totals; PO and bill prints show them under the lines; `po_billing_totals` includes them. The PO page and bill page get a small "Additional charges" box (amount, GST %, what for). The per-line "Other" column stays. `purchase-orders/PLAN.md` rule 5 and `bills/PLAN.md` rule 3 updated.
9. **Bill entry PO-first** (Commercial 4). On `/bills/new`, for PO and work-order bills the **Against** picker comes first (every billable PO/order, searchable by number and vendor, moved to a server-side search like `/api/catalogue` — closes the open item in `bills/PLAN.md`), the vendor fills from it and shows read-only. NMR keeps the vendor picker. `create_bill()` already takes the vendor from the anchor; no migration.
10. **Advances to any vendor** (Commercial 5). The advance form's picker lists every active vendor, contractors first, labelled "Vendor"; messages say "Pick the vendor"; `/bills/contractors` becomes "Advances" in its heading and lists every vendor with an advance. Recovery already works against any of that vendor's bills. No migration.
11. **Receive screen PO filter** (Commercial 6). The "Awaiting delivery" list gets the page's existing `ListToolbar` (search on PO number and vendor, project, villa) through `listReceivablePos` in `lib/inventory/receipts-queries.ts`. No migration.

Verification per fix: the probe account (single grant) presses the one button; trial SQL for 4 and 5 under `set local role authenticated` (BUGCATCHER #19). Founder's checklist in the final message of each commit.

## Wave 3 — the three builds

### 3a. Site checklists `[Fable designs here; Opus the tables; Sonnet the screens]`

Supervisors-owned. Migration `0134_site_checklists.sql` (drafted; numbers moved up one when Wave 2 took `0133`).

- `checklist_templates` (name, work_refs text, note, sort_order, is_active) and `checklist_template_items` (template_id, sort_order, text, origin `source|added|review`, review_note). Loaded by `scripts/import-checklists.ts` from the workbook saved as `.xlsx` (the repo's reader is xlsx-only; the founder saves `3.xls` as `.xlsx` once): the ten checklists (Blockwork 21 items … Roof Slab Electrical 33), and **Concrete grade check** as an eleventh whose items are its works, each answered with the grade in Remarks. Templates are Masters-like reference data but live with Supervisors (they are the site's); editable in **Supervisors → Checklists** by `/supervisors` holders; reads open to signed-in (`session_is_verified()` floor).
- `site_checklists` (plot_id, template_id, location text, drawing_revision text, started_on, finished_on, inspected_on, status `open|signed_off`, checked_by, signed_off_by/at, attachment_path) and `site_checklist_items` (checklist_id, template_item_id, status `not_checked|pass|fail|na`, remarks). RLS `/supervisors` on every verb, draft-only guard once signed off. One attachment through `lib/uploads/` (the phone camera exists) into a private bucket, for the test certificate the concrete-grade sheet asks for.
- Phone screens on the villa page: a **Checklists** section — start one (pick template, location/floor), tick items (Pass / Fail / N/A, remark), review notes shown in amber as hints, sign off. A print later if asked.
- `supervisors/PLAN.md` gains the section; STATUS.md the line.

### 3b. Site confirms what the store issued `[Fable designs here; Opus the function; Sonnet the screens]`

Migration `0135_site_receipt_confirmations.sql` (drafted, with the design change below). Inventory's tables, written by Supervisors through one definer — a new cross-tool write for `SECURITY.md`'s list.

- `stock_issues.site_confirmed_at`, `site_confirmed_by`, `site_note`; `stock_issue_lines.received_quantity numeric null` (null = not yet confirmed; shortage = quantity − received). Same three header columns and per-line `received_quantity` on `goods_receipts(_lines)` for direct-to-site deliveries.
- `confirm_site_receipt(p_issue_id or p_receipt_id, p_lines jsonb, p_note)`: definer, checks `has_app('/supervisors')`, the destination is a plot, not already confirmed; writes only those columns; a shortage line needs a note. Execute revoked from `public, anon`. `stock_issues_guard` / `goods_receipts_guard` admit exactly these columns moving under the function's transaction-local flag (the `0113` pattern). Trial as the probe with `/supervisors` only.
- Supervisors villa page: **Deliveries to this villa** — issues and direct deliveries not yet confirmed, each opening a confirm form (quantities pre-filled, editable; a shortage asks why). Inventory's issue note and receipt page show "Confirmed by … on …" or the shortage in amber. Stock stays what was issued (quantities, never money); the shortage is a note for the store-keeper and accounts, not a movement — an adjustment stays Inventory's.
- STATUS.md: Supervisors' row adds the write; `SECURITY.md` cross-tool list; `inventory/PLAN.md` and `supervisors/PLAN.md`.

### 3c. Budget vs actual, and stage payments `[Fable designs here and reviews the view; Opus builds the view and the page; Sonnet the work-order shortcut]`

Migration `0136_villa_costs_and_stage_billing.sql` (drafted) — **a money view**, `money: true` in `scripts/view-manifest.ts`, gated in its own WHERE to `has_app('/estimator') or has_app('/bills') or has_app('/reporter')`, writes revoked. `SECURITY.md` _Money stays confined_ records that the Estimator now reads committed and actual money through this one view, by the founder's decision 2026-10-22.

- `villa_cost_facts`: one row per (unit/plot, work category, work item, kind): kind `po_committed` (issued/completed PO lines of the villa's indents: taxable value, from `purchase_order_lines` through `indent_lines.indent_id → indents.work_item_id`, general POs attributed through the indent's villa), `material_issued` (issue lines to the plot valued at their batch rates from `goods_receipt_line_rates`; "no batch" lines carry null, shown as unknown), `wo_committed` (approved work-order lines by work), `labour_billed` (bill lines by work: work-order bills per line, NMR bill lines by the log's work), `po_billed` (material bill lines by the PO line's indent work). Every figure before GST. Null never zero (BUGCATCHER #13).
- **Estimator → villa → Budget vs actual** (`/estimator/villas/[unitId]/budget`): per category and per work: Estimated (the official estimate's frozen `estimator_estimate_line_costs`, labour and material apart), Committed (PO + work orders), Actual (material issued, labour billed), variance; a totals row; the official's number and date at the top; "unknown" where a figure cannot be known. `lib/estimator/budget-vs-actual.ts` pure and tested. Also reachable from Bills (a link on a villa's bills list) since `/bills` sees the view — the page's `requireTool` accepts either grant (the one page in the Estimator that does; written down in `estimator/PLAN.md`).
- **Stage-based payments for Superstructure and MEP:** a work order's lines are already work + unit + quantity + rate, so the SS/MEP package works (Wave 1) are the stages. Build: (i) on the work-order form, **"Add every package work of a category"** — picks Superstructure or MEP, adds one line per package work at the rate book's rate with the villa's built-up sqft typed once (or read from the official estimate's package lines when present); (ii) `bill_lines.labour_contract_line_id` (nullable FK) so a bill names which stage line it bills, a `work_order_line_billing_facts` view (money, `/bills` or `/reporter`) of value and billed so far per line, the work-order page showing billed/remaining per stage, and `linesFromWorkOrder` pre-filling each line at value − billed so far (over-billing still warns, never blocks). `bills/PLAN.md` rule 6 and `SECURITY.md`'s window list updated.

## For the Fable review — four drafts on `feature/os-updates-3`, none applied

Each draft dry-runs clean on staging, alone and all four together. Each has a trial under `scripts/trials/` run as single-grant people. Each trial fails against a deliberately broken copy. Review against `SECURITY.md` and `BUGCATCHER.md`, then apply in order, `0133` to `0136`, regenerating types after each.

- [ ] [Fable] **`0133` piece-work without a work order, and charges apart from the rate.** It redefines the definer `send_labour_logs_to_bill()`: piece-work with no order becomes a direct labour bill through `create_nmr_bill`, and every piece-work line now names an additional-work or rework class. It adds `charges_amount`, `charges_gst_pct` and `charges_note` to POs and bills. It redefines `bill_lines_roll_up` and adds a `bills_charges_roll_up` BEFORE UPDATE trigger, so the charges join taxable, GST and total. It redefines `po_billing_totals` (same columns, manifest note updated) so what was ordered counts the PO's charges. Trial: `piece-work-and-charges.sql`. It caught a CHECK that let charges through with no GST.
- [ ] [Fable] **`0134` site checklists.** Four new tables, templates read by anyone signed in, and checklists that are `/supervisors` on every verb. Sign-off needs every item answered and a remark on each Fail and N/A, and a signed-off checklist never changes. Deletion reaches only an open checklist, and templates are switched off rather than deleted. It adds a private `site-checklists` bucket. Trial: `site-checklists.sql`, as a supervisor and as the probe.
- [ ] [Fable] **`0135` site receipt: a design change from 3b.** Supervisors' own append-only `site_receipt_confirmations` (and lines) point at the issue or delivery instead of a definer writing Inventory's tables. Inventory's line tables carry quantity and permanence guards an update would wake, and this needs no cross-tool write, only a read for Inventory's issue note. One confirmation per document, never more than was sent, signed by the confirmer, and readable by `/supervisors` and `/inventory`. The shortage note is the action's rule, not the database's. Trial: `site-receipt.sql`.
- [ ] [Fable] **`0136` villa costs and stage billing.** It adds `villa_cost_facts`, a money view gated to `/estimator`, `/bills` and `/reporter`. It carries the official estimate's labour and material figures, because `/bills` cannot read the Estimator's tables, so it is the one place estimate money leaves the Estimator. That needs a sentence in `SECURITY.md` at apply. Figures are before GST, and an unknown batch rate says `unpriced`. It adds `bill_lines.labour_contract_line_id`, checked in `bill_lines_guard`, and `work_order_line_billing_facts` (`/bills`, `/reporter`). Both views are in the manifest. Worth a look: the view's correlated plot lookups at scale. Trial: `villa-costs.sql`, as Bills, the probe and a supervisor.
- At apply: `SECURITY.md` _Money stays confined_ goes from eleven money views to thirteen and names both new views. Its cross-tool list gains nothing, since 0135 adds no write. STATUS's contract table gains Inventory reading the confirmations and the Estimator and Bills reading `villa_cost_facts`.

### Built after the review `[Opus, Sonnet]`

- 0133: Send to Bill's work order becomes optional, with the line "No work order — billed as a direct labour bill". An Additional charges box goes on the PO page and the bill page. `summaryRows` in both `math.ts` files and both prints show the charges.
- 0134: `scripts/import-checklists.ts`, plus `lib/supervisors/checklist-workbook.ts`, pure and tested. It reads the workbook saved once as `.xlsx`, since `3.xls` is the old format: the ten checklists, and the concrete grade record as an eleventh. The villa page gets a Checklists section (start, tick, remark, attach, sign off), and Supervisors gets a Checklists page to keep the templates.
- 0135: the villa page gets "Deliveries to this villa", one tap to confirm with a shortage asking why. Inventory's issue note and delivery note show it.
- 0136: `/estimator/villas/[unitId]/budget` and `lib/estimator/budget-vs-actual.ts`, pure and tested. The page is reachable from Bills too, and its `requireTool` accepts either grant. The work-order form gets "Add every package work of a category", and a bill from a work order pre-fills each stage at value less billed.

## Migrations and numbering

Next free number on every remote branch is `0131` (`origin/staging` and `origin/feature/native-apps` end at `0130`). `0131` Wave 1, `0132` Wave 2, `0133`–`0135` Wave 3 — each applied to staging first with `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`, dry-run with a trial as the probe where a guard or definer changes (`0132` items 4–5, `0134`, `0135`). Types committed with each. `db:check-views` and `db:check-policies` on every pull request.

## Branch and sessions

`feature/os-updates` off `staging`, in its own worktree (another session may switch branches). One pull request per wave into `staging`; the founder vets each on `staging.goodearthkannur.org` before the next wave's PR. Fable's approval pass at each merge unless the founder waives it in so many words.

## Verification (end to end, after each wave)

- CI green (`gh run list`), then **open the pages** on the preview as the probe (single grant), not as admin.
- Wave 1: Masters → Works shows five families; Superstructure has 11 groups each with a package work priced in ₹/sqft; Items shows a GST column; Estimator → Rate book lists packages; an old estimate's lines keep their names; SketchUp list re-sent and a takeoff imported.
- Wave 2: raise an urgent indent and see it first in the approver's list; pull an estimate for one stage; add a deduction row and see the total fall; send piece-work logs to bill with no work order; log labour as Rework and see it on Send to Bill; record a GRN with an invoice number and see it offered on the bill; Reporter's new dataset filtered to one plot; a PO with ₹1,500 freight at 18% printing right; the bill form picking the PO first; an advance to a supplier recovered from their material bill; the receive screen searched by PO number.
- Wave 3: start a Blockwork checklist on a phone, fail one item with a remark, attach a photo, sign off; confirm a store issue short by two bags and see the shortage on the issue note; open a villa's Budget vs actual as an estimator and as a bills holder, and read the unknown cases aloud; a Superstructure work order with 11 stage lines, two bills against two stages, the order showing billed and remaining.

## Parked

- `later.xlsx` (steel abstracts per plot, tile quantities): a reinforcement takeoff sheet in the Estimator, when the founder asks.
- A checklist print; checklists for Infra works; per-supervisor villa scoping (`TODO.md` open question).

# Native apps on iPhone and Android

**Approved by the founder 2026-10-18 ("everything looks good"). Build Android first.** A1, A2, A4, B, C (push) and D's camera are on staging (#112–#117), and the Android app is **live on Google Play** since 2026-10-26 (`android/PLAN.md`). **Next, unless the founder says otherwise: the iPhone (A3)**, once Apple's enrolment is through. Work on `feature/native-apps` in its own worktree (`C:\Users\goodearth\Documents\Code\kaadal-toolbox\toolbox-native`, beside the main folder), brought level with `staging` first; each piece ends in a pull request, merged only on the founder's word. **The founder waived Fable's reviews for this build** (2026-10-18: "waive all the fable reviews i trust you"), so Opus takes each `[Fable]` step and says so beside it. Every new package is a release at least two weeks old (Capacitor 8.5.3 was days old on 2026-10-18).

The founder's choices (2026-10-18): **one shared app in both stores**, built with Capacitor 8, showing today's Toolbox screens and adding **push notifications, Face ID / fingerprint, and camera and scanning**. iPhone on the **public App Store**; no Mac, so iPhone builds run on GitHub's free macOS machines (the repo is public). Same ID on both: `com.kaadalgroup.toolbox`.

Why this shape: every tool works on day one, a website fix still reaches both apps with no store release, and the native features are what Apple's "more than a website" rule (4.2) asks for.

## The risks, said once

- **Capacitor calls loading the live site "not intended for production".** Many apps ship it; the cost is review risk when the network drops. So the app carries its own "No connection — try again" screen (`server.errorPath`) and never shows a blank page.
- **Apple may say a staff-only app belongs in Apple Business Manager** (guideline 3.2), as it has for others. The fallback is the same build sent as a private Custom App: a setting in App Store Connect, not a rebuild.
- **Google refuses to sign in inside an app's web view.** "Sign in with Google" must open in a browser tab and come back to the app (step A4). Apple's demo reviewer needs that path, as Play's does.
- **Apple's login rule (4.8)** exempts apps that sign in with an existing company account, which ours is; the review notes say so.

## Founder first

- [ ] [Founder] Apple Developer Program as an **Organization** (in progress), then App Store Connect: create the app `com.kaadalgroup.toolbox`, and an **App Store Connect API key** (Users and Access → Integrations) for the build machine.
- [x] [Founder] A **Firebase** project (free) for Android push: `kaadal-toolbox`, under `admin@kaadal.co.in`, done 2026-10-20; its two files are in `android-signing` (`android/PLAN.md`).
- [ ] [Founder] An **APNs key** (.p8) from the Apple account for iPhone push.
- [ ] [Founder] An iPhone with **TestFlight** and an Android phone, for trying each phase.

## A. The shell, both stores

- [x] [Opus] `mobile/`: a Capacitor 8 project with its own `package.json` (the web app's dependencies untouched), pointed at `https://toolbox.kaadalgroup.com`, the offline screen, and the Kaadal K icon and splash. Android only so far; the iPhone's icon comes with A3. Two things Chrome did for the wrapper are now the app's own: prints and exports go through Android's downloader (`mobile/PLAN.md`), and the back button through `@capacitor/app`.
- [x] [Opus] Android: built on this PC, signed with the existing upload key, version code 2: `kaadal-toolbox-2.0.0.aab` and `-test-install.apk` in `android-release` (`android/PLAN.md`). Capacitor 8 needs **Java 21**, added beside the wrapper's 17 (`mobile/PLAN.md`, _Building a new version_). Seen on an Android 16 emulator: the K launch screen, the live sign-in page, the "No connection" screen in flight mode, Try again, the back button. Not yet seen: anything after sign-in, Print, and the keyboard.
- [ ] [Founder] **Try version 2 on an Android phone** (install `kaadal-toolbox-2.0.0-test-install.apk`; it updates the wrapper in place if that is on the phone). Step 2 confirmed on the founder's phone 2026-10-19; the rest still to try:
  1. Open it: the K on cream, then the burgundy sign-in page, with no address bar.
  2. Sign in with email and password; switch to the mail app for the code and back. Tick "trust this device", close the app, reopen: still signed in.
  3. Open a few tools from different teams; the phone's back button steps back through pages.
  4. **Print** an indent or a PO: "Opening …" appears, then the PDF opens in the phone's viewer.
  5. Tap into a form field: the keyboard doesn't cover it.
  6. Attach a picture somewhere (an expense bill or a drawing): the phone's picker opens.
  7. Flight mode on, open a page: "No connection". Flight mode off, **Try again**.
  8. **Continue with Google** opens Google in a burgundy tab over the app. It finishes signing in only once the two steps below A4 are done.
- [ ] [Opus] iPhone: a manually-run GitHub workflow on a macOS machine that builds, signs and uploads to TestFlight with the App Store Connect key held as GitHub secrets. Never runs on pull requests, so a fork can't reach the secrets.
- [x] [Fable → Opus] **Google sign-in out of the web view.** The founder waived Fable's review (2026-10-18: "waive all the fable reviews i trust you"), so Opus designed it, more simply than first drafted here: Google returns to the app's own address, `com.kaadalgroup.toolbox://auth/callback`, rather than a verified web link, so **no new public path** (no `apple-app-site-association`) and the iPhone uses the same address. The code alone is worthless without the PKCE cookie in the app's web view. The rule is in `SECURITY.md`, the mechanics in `mobile/PLAN.md`.
- [x] [Opus] Built: `lib/native/app.ts` reads the user agent's mark on the server (pure and tested, no new web dependency); `signInWithGoogle` picks the return address; on Android, other sites open in a Chrome tab over the app and the return is finished in the web view. Seen on the emulator: Google's page in a burgundy tab over the app, its close button back to the app, and a return carrying a made-up code finished on the site and refused, with the app open and from cold.
- [ ] **Before the round trip works**, two things outside the code:
  - [x] [Opus, at the founder's word] `com.kaadalgroup.toolbox://auth/callback` added to staging's Supabase redirect list, 2026-10-20. Staging's settings become production's at the switch; the new practice project needs it too.
  - [x] [Founder] Merge the website's half to staging: #112 and #113, merged 2026-10-19.
- [ ] [Founder] Vet on TestFlight and Play's internal track: sign in all three ways, open every team's tools, turn on flight mode and see the offline screen.

## B. Face ID and fingerprint

- [x] [Fable → Opus, waived] Settled by Opus (the founder waived Fable's reviews, 2026-10-18): the email and password go into the phone's Keystore, released only by the face or finger, and the app signs in through **today's password path**, so the trusted device (30 days) skips the code as it does now. No new door into the server. Two changes from the first draft: the offer is a tick box on the sign-in form rather than a question after sign-in (nothing has to carry the password across pages), and the plugin is our own over Google's `androidx.biometric` 1.1.0, so the key itself holds the password. The rule is in `SECURITY.md`, the mechanics in `mobile/PLAN.md`.
- [x] [Opus] Built: version 2.1.0 (code 3). "Turn off fingerprint sign-in" in the profile menu clears it. Seen on the Android 16 emulator against a local copy of the site: the tick box, the "Save your sign-in" prompt, the app asking by itself on a fresh sign-in page, "Use password" leaving the form and a fingerprint button, a saved password that fails cleared with a note, a newly added fingerprint clearing it, and another page refused. Not seen: a real sign-in (model sessions have no account), or the profile menu's item.
- [ ] [Founder] Vet, once the website's half is on staging and version 2.1.0 is on the phone: sign in with the box ticked and touch the sensor; **sign out** (the app otherwise stays signed in for 30 days), and the app asks for your finger by itself and signs you in; change your password on the website and see the app clear the saved one and ask for the password; the profile menu's "Turn off fingerprint sign-in".

## C. Push notifications

- [x] [Fable → Opus, waived] The design, approved by the founder 2026-10-20 ("go"): `push_devices` (`0130`) — a person reads and forgets only their own phones, and records one only through `claim_push_device()`, so a shared site phone follows whoever signed in last; sending to someone else is the sanctioned admin-client use in `lib/push/send.ts`, told whom by the action that just wrote. Firebase delivers to both phones (the APNs key goes into Firebase for the iPhone), so there is one sending path. The rules are `SECURITY.md`, _Push notifications_. Applied to staging 2026-10-20 after a dry run whose trial passed as the staff account and the probe.
- [x] [Opus] `lib/push/` sends after the response (`after()`), never inside the write, never to the actor, never throwing; the token signing is shared with the Chat door in `lib/google/`. The app is version 2.3.0 (code 5).
- [x] [Opus, not Sonnet] The first three: an **indent approved** (to whoever raised it), a **baton passed on, sent back or handed over** (to its new holder, from Google Chat too: a baton is always one named person, not a department), a **design stage** (to each person put on it by a pass, a start, "set where it is" or being added). A tap opens that page. Seen on the Android 16 emulator: the permission prompt, registration, the channel, Firebase accepting a send through `lib/` (200), and a tap opening its page from an open app and from a closed one. Not seen: a notification arriving, because an emulator without a Google account never receives one; nor anything after sign-in.
- [x] [Opus, at the founder's word] `FIREBASE_SERVICE_ACCOUNT_KEY` in Vercel's Preview settings (staging), 2026-10-20; Production's comes at the switch. [Founder] The Firebase Android key restricted to the app with both signing SHA-1s (`android/PLAN.md`).
- [x] [Founder] Vetted 2026-10-20 ("everything works"), installed from Play's internal testing and merged as #117. The checklist was: version 2.3.0 on the phone (`kaadal-toolbox-2.3.0-test-install.apk`), signed in as yourself, with a second account on a computer doing each thing to you: Allow notifications when asked; approve an indent you raised; pass a Relay baton to you; put you on a design stage. Each arrives with the K, and a tap opens its page. Sign out and do it again: nothing arrives. Turn notifications off for Toolbox in the phone's settings: the app still works.

## D. Camera and scanning

- [x] [Opus] Photos: built in the app, not the website, as version 2.2.0 (code 4). Chrome and the iPhone already offer the camera on a picture field; the Android app now does too (`CameraFileChooser`), so every photo upload has it at once: Birdwing documents and expense bills, Directory photos, Selections views. Seen on the Android 16 emulator: Camera beside Files on a picture field, a shot reaching the page as a readable JPEG, Files choosing a picture, cancelling in the camera or the picker, the picker opening again after, and a spreadsheet field going straight to Files.
- [x] [Founder] Vetted on the phone 2026-10-20 ("it all works"), merged as #116. The checklist was: version 2.2.0 (`kaadal-toolbox-2.2.0-test-install.apk`): on Birdwing Books → Expenses, a row's **Bill** button offers **Camera**; take a photo of a paper bill and it uploads; the same button's other choice still picks a PDF; your Directory photo from the camera. iPhone: checked when A3 builds it.
- [ ] [Founder] **Question: what gets scanned?** Items and bins carry no barcodes today, so scanning first needs labels — for example a QR sticker per item or rack printed from Inventory. Scanning is planned once that is decided.

## E. The stores

- [ ] [Opus] Draft the App Store listing, privacy labels and review notes (the reviewer Gmail with Google sign-in, the 4.8 exemption, the native features to try); screenshots from TestFlight.
- [x] [Founder] Android: live on Google Play, 2026-10-26 (`android/PLAN.md`).
- [ ] [Founder] Submit to the App Store.
- [ ] [Fable] Approval pass over the full diff before each merge, as `MODELS.md` says.

# The refactor before production — done

Approved 2026-10-17 ("the refactor must happen"); built and merged to staging on 2026-10-18 (#106 for Phase 0, #107 for Phases 1–6, with Marathon and the construction budgets removed), with `0127`–`0129` applied there; the founder vetted it on staging the same day: "all looks good". Its rules now live in CLAUDE.md, SECURITY.md and BUGCATCHER.md, and its checks in CI. The full plan, every step ticked, is `git show ec86aaf:plan.md`.

# Waiting for the founder's vet

Each piece below is on staging. Its checklist stays here until the founder has tried it; the rules it made live in its tool's `PLAN.md`, and its story in git (`git show 88749ab:plan.md`).

## Before production (the ERP corrections)

_The ERP corrections._

- **B9's question is answered by `0112`** (founder, 2026-10-10: "finish the database changes"): stock issued or removed before batches existed is replayed oldest-first, drawing only what existed at the time (`inventory/PLAN.md`). **Apply `0108` and `0112` in the same `db:apply` run** — the replay refuses if an issue recorded in between already drew the same batches. Kept or cleared on ship day, production's stock records come out right. Proof: `replay-pre-batch-history.sql` (and it fails with a figure wrong, or with the at-the-time rule removed).
- **`0107` backfills one payment per already-paid bill** — on production it runs once over the real paid bills, one row each (`bills/PLAN.md`).

## Verification — the founder, on staging

_The ERP corrections._

First, in **Estimator → Works**, give Footing (FD.15) its materials (M10 mix + steel), measure it on Plot 1's estimate and press **Make official**. In **Masters → Companies**, enter Goodearth's real details and set that company on the Saarang project (nothing is seeded — until then every print shows the placeholder letterhead and GST is reckoned against Kerala); **Masters → Terms** takes a default PO text and a default work order text. Then:

1. **Indents** → New indent on Plot 1, work Footing → Pull from estimate: cement, sand, jelly **and** steel appear, each in its Master unit (cement in bags). Request some, submit, approve. The indent shows "Remaining" per line; **Print** gives a clean page.
2. **Purchase Orders** → **From an indent** → pick it → cement to one vendor, steel to another → Create: two draft POs, everything filled in. On one: a 5% discount and ₹500 freight on a line — totals change as you type; a Kerala vendor shows CGST + SGST, an out-of-state vendor IGST. Edit the terms. Issue it; **Print**. In Masters → the material: its rate rose if the PO's was higher.
3. **Inventory** → Receive the PO into Farm Store: rate and GST arrive from the PO; change one rate — it shows "differs from PO". Issue some cement to Plot 1 / Footing: the batch is chosen for you, with its rate. Search and filter each Inventory list.
4. **Supervisors** (phone width) → Plot 1: log a day of NMR (2 masons, 3 helpers) and a piece-work quantity (Footing, 2 cum). Request a material that is not in the estimate — it asks why.
5. **Bills** → **Work orders**: make one for the contractor from a template, works from the list, print it, approve it. → **Labour**: tick the two logs → Send to Bill: an NMR bill (heads × day rates) and a PW bill against the work order (2 × ₹4,000 = ₹8,000). → A material bill from the PO: lines arrive from the PO. **Print** a bill — the contractor's name beside the number.
6. **Cash request** for this week: add the bills and a ₹10,000 advance, submit, release with one amount cut; record the payments — a bill shows "Part paid · pending". On the next bill, recover part of the advance. **Contractors** shows given / recovered / outstanding; **Payments** searches, filters and sums.
7. **Reporter** → any starter: type in the search box, see the totals row, use a quick filter.
8. As the **probe** (it holds `/inventory` and `/estimator`): Inventory rates are visible, and Site check shows site's reason; Bills, POs and payments are refused.

## Verification — the founder, on staging (second build)

_Indents wait for the estimator._

1. **Indents** → New indent on Plot 1, work Footing → **Add items**: pick cement (on the estimate) and something it does not list. Cement shows "from the official estimate"; the other shows amber **Outside the estimate** with a "Why is it needed?" box.
2. **Submit** without typing a reason — it asks why. Type one, submit.
3. As the approver: **Approve** is locked — "Waiting for the estimator on 1 line". Send back still works.
4. **Estimator → Site check**: "Indents waiting for you" lists the line with site's reason. **Refuse** with a note → on the indent the approver sees the refusal and sends it back. Change the quantity (the old answer clears), resubmit; in Site check press **Approve**; now Approve on the indent works. The Estimator's welcome counts what waits.
5. **Print** the indent: the line shows its reason and "Estimator approved".
6. **Purchase Orders**: no "Add items directly". **Bulk PO from several indents** → General → **From approved indents** lists approved indents from every villa, each named by its villa.
7. As the **probe** (it holds `/estimator` and `/inventory`): Site check shows the waiting lines and Approve works; Indents is refused.

## Verification — the founder, on staging (fourth piece)

_Teams in the sidebar._

1. Any page: the sidebar shows Overview, then **Management, Operations, Events, People, Admin** as closed rows with a count. Click one — its tools open under it; click again — it closes. Open a tool: its team stays open on the next page.
2. **Settings → Teams** → **New team** "Design". Move it to the top with the arrows. Under _Tools_, set Design Management and Selections to Design — the sidebar moves them at once.
3. Rename a team; delete one — its tools move to **Other** at the bottom of the sidebar, and nobody loses access to anything.
4. The home page's tool cards and a person's apps in **Settings → People** are grouped the same way.
5. On a phone: the menu shows the same closed teams.
6. As the **probe** (it holds `/estimator` and `/inventory`): only the teams holding those two appear, and **Settings → Teams** is refused.

## Verification — the founder, on staging (fifth piece)

_Birdwing, the Hospitality section._

You are admin, so you see both tools without a grant. A test stay made here is a real row on staging — cancel it when done.

1. **The sidebar** shows a **Hospitality** team holding **Birdwing Stays** and **Birdwing Books**.
2. **Birdwing Stays → Settings**: "On every invoice" names Maloor Eco Farms (check its address and GSTIN in Masters → Companies); bank, UPI and the cancellation policy are filled in. **Rate card**: every head says _Switched off_ — read each rate and switch on the right ones (Edit → In use).
3. **Calendar**: October shows no named rooms for the old stays (the sheet never said which room). Go to next month, tap a free night in **R2** on a Friday → the new stay opens with R2 and the dates filled. Make the guest "Test Guest", Friday to Sunday, **Book the stay** → its page, numbered BW-0221.
4. **New stay** again for Saturday → R2 shows _Taken: BW-0221 · Test Guest_ and can't be ticked. (Two people booking it in the same second are refused by the database.)
5. On BW-0221: **Add a charge** → Room rent, quantity 2 → it comes to ₹7,980; add Dinner × 2 → ₹1,050. **Preview** → a DRAFT PDF. **Issue invoice** → it reads **MEF/GH/133**; **Open PDF**; the charges can no longer be changed.
6. **Record a receipt** — UPI, today → _Pending_ drops by it.
7. **Calendar** again: R2 is blue on those nights. **Check in**, then **Cancel stay** is gone (a stay in the house is checked out, not cancelled) — **Undo check-in**, then **Cancel stay** with a reason → R2 is free again.
8. **Review**: 128 stays. Tick a few Goodearth ones → pick **Marketing** → **Set cost centre** → **Charge pending to cost centres** → they leave the list; their stay pages show "charged to Marketing".
9. **Birdwing Books → Expenses**: October 2026 shows the old sheet's lines; attach a photo of a bill to one from your phone.
10. **Upload the sheet**: save the workbook's _Combined Expenses_ sheet as CSV and upload it → the preview says **0 new**, every line _Already in_.
11. **Attendance** on your phone: today at the top — mark Sajna _Present_, tap the name, in 07:30, out 18:30, Save.
12. **Settings** → give Amal, Appu and Bijeeth their pay rules (Amal ₹30,000, Appu ₹40,000, no shift = fixed).
13. **Salaries → October 2026**: Amal's card says ₹30,000 is already in Expenses from the old sheet, and won't confirm. **November**: once the month begins, Sajna's figures are worked out from attendance.
14. **Financial Management → Birdwing**: the tiles match the HTML page — billed ₹21.4 L, collected ₹14.0 L, pending ₹7.3 L, expenses ₹23.9 L, occupancy about 30% (estimated) — less what steps 5–8 moved.
15. **Reporter** → new report → **Birdwing stays** → group by _Who for_, sum _Pending_.
16. As the **probe** (it holds `/estimator` and `/inventory`): neither Birdwing tool appears, and `/birdwing` sends it home.

## Open questions for the founder (fifth piece)

_Birdwing, the Hospitality section._

1. **Cost centres** for internal stays — seeded Marketing, Sales, Projects, Directors, Kaadal (editable in Settings). Does a cross-charge need an approver, or is the person who records it enough? Built: the person who records it, named on the line.
2. **Rate card** — the laptop app's 13 heads are seeded **switched off**; read them in Birdwing → Settings and switch on the right ones before the first real charge.
3. **Pay rules** — only Sajna's is known (₹15,000, ₹80/hr OT, ₹80/room-day, shift 08:30–17:30). Amal ₹30,000 and Appu ₹40,000 look fixed; Bijeeth's basis is unknown. Needed before the first salary run.
4. **Grants** — Amal, Akshay on `/birdwing`; who on `/birdwing-books`?
5. **The 67 unpaid internal stays** — bulk-assign cost centres on the Review screen, or one by one?
6. **November 2026 salaries** already in the sheet — imported flagged "future", never confirmed, unless you say drop them.

## Verification — the founder, on staging (sixth piece)

_From the model: a SketchUp takeoff becomes a villa's estimate._

1. **SketchUp: Extensions → Goodearth QS → Toolbox address…** → `https://staging.goodearthkannur.org`.
2. **Open `Sample villa.skp` → Send to the toolbox.** A window opens; sign in (password, then the code). If it lands on the home page, close it and press **Send to the toolbox** again.
3. **From the model** shows the file, 18 works, 36 rows, its problem count and 3 to measure by hand. Pick a test villa → every work says _adds_; the hand-measured ones say _to measure_.
4. **Import → Open the estimate.** Under the title: _Measured from Sample villa.skp_. FD.14 reads 0.392 cum from `2 × 1.4 × 1.4 × 0.1`; F.1.36 and F.1.37 read 1 nos each; PF.8 reads 365.542 sqft. The model's rows carry a _Model_ badge and no edit buttons.
5. **On FD.9, add a hand row** `1 × 1 × 1 × 1` → 2.818 cum.
6. **In SketchUp, shorten wall BW1 by a metre** (keep it a solid) → **Send to the toolbox.** The villa is already picked; FD.9 says _replaces the model's 2 rows with 2 · 1 typed row kept_ → Import → FD.9 = 2.548 cum.
7. **Rate book → FD.6** (on no estimate) → set its unit to **sqm**. In SketchUp tag a closed block `FD.6` and send: _refused — the rate book measures FD.6 in sqm, the model sent cum_; the rest imports. Set FD.6 back to cum.
8. **Make official** on that estimate → the official copy's sheets still show the _Model_ badges.
9. **Start another villa's estimate from this one** (everything), then send the model to that villa: no work doubles.
10. **Rate book → Download works list for SketchUp** → in SketchUp, **Choose works list…** → that file: the counts match the rate book. (Inside SketchUp's window, **Send the works list to SketchUp** on From the model does the same in one press.)
11. **As the probe** (`/estimator` and `/inventory`): From the model imports. As someone without `/estimator`, the page sends them home.

## Still open (sixth piece: rate-book data)

_From the model: a SketchUp takeoff becomes a villa's estimate._

1. **Superstructure materials.** SS and MEP works are shares of a package rate per sqft; their sub-works (SS.2a–SS.2g, SS.5a, SS.9b, SS.6a–SS.6e, SS.11a/b) have no unit. Give them physical units and recipes, so the model can drive blocks and cement for the superstructure?
2. **FD.16, FD.22, FD.29–FD.32** are sqft: shuttering area (base + sides) or plan area? Until answered they are measured by hand.

## Verification — the founder, on staging (seventh piece)

_The Saarang tracker, inside Client Relations._

1. **Masters → Stages**: the Build progress card lists the nine stages in order, the last marked Handover. Add "Waterproofing", move it up between the slabs with the arrows, then deactivate it.
2. **Client Relations** opens on its welcome: overdue, this week, waiting on management. **Actions** is the first door.
3. **Actions**: the team strip shows Anu, Sayooj and Sebastina with the imported counts (Anu 26 open). Click Anu — only Anu's. **Needs you** is empty.
4. Type "Share 3D with client", pick Plot 4, Sayooj, **Tomorrow** → **Add**: it appears under _Next 7 days_.
5. Tick it — it leaves the list; **Undo** brings it back. Tick an overdue one, then _Show done_.
6. On a _date assumed_ action pick **This Friday** — the flag goes and it moves to _Next 7 days_.
7. **••• → Waiting on management** — it moves to the top, and **Needs you** counts 1.
8. **Plots**: lot cards with health pills; the **No next step** chip lists sold plots with nothing open. Open Plot 10 → **Next steps** on top; add one there; tap a Kaadal stage; step the build forward with ▶ — the card's rail fills.
9. **Clients**: cards with faces and plot chips; open one — their plots and their actions. **Collections** reads like Actions: overdue first.
10. **Plots → Saarang West - Villas**: 27 cards, six with a buyer, each showing its configuration (1BHK Study …). In Saarang, **Plot 33 & 34** is one card; Plots 9 and 27 have no buyer; Plots 3, 35 and 43 have their new buyers. **Clients → Stage: Lost** lists the three who cancelled, each with its reason.
11. **Anu, signed in on a phone**: Anu opens on their own list with the greeting; the composer, the menus, the chips and the tick work with a thumb; nothing scrolls sideways.
12. As the **probe** (it holds `/estimator` and `/inventory`): Client Relations is not in the sidebar, and `/client-relations/actions` sends it home.

## Verification — the founder, on staging (eighth piece)

_Only whoever set an action closes it._

1. **Actions** → add "Trial: send the brochure" for **Anu**, Tomorrow. You set it.
2. Ask Anu (or sign in as Anu) to open **Actions**: Anu's tick on it says _Mark finished — Siddharth confirms_. Anu ticks it → it moves to **Waiting to confirm**, "Waiting for Siddharth to confirm".
3. Back as you: it tops your list under **Waiting to confirm**, "Waiting for you to confirm". Tick it → closed. Undo works.
4. Anu cannot open it again; on Sayooj's own actions Anu's tick is dashed and locked.
5. One of Anu's imported actions (from the tracker): Anu ticks it straight to done, counting as its setter.

## Verification — the founder, on staging (tenth piece)

_Each person sees the work assigned to them._

With `/client-relations` given to Anu, Sayooj and Sebastina:

1. **Settings → People → Sayooj**: under Client Relations, a **Team lead** tick. Leave it off for now.
2. **As Anu** (on a phone if you can): **Plots** shows only Anu's plots; **Actions** opens on Anu's own list, and **All I see** adds what Anu set for others and others' steps on Anu's plots; **Clients** lists only Anu's clients; the owner menu shows names without counts.
3. Paste the link of one of Sayooj's plots (from your own view) into Anu's browser: "This plot is not one of yours".
4. As Anu, add a step on one of Anu's plots for Sayooj. **As Sayooj**: that plot appears, with that one step — not Anu's other steps on it. Sayooj ticks it finished; Anu closes it; the plot leaves Sayooj's list.
5. As Anu, give one of Anu's plots to Sebastina (Construction owner chip): the page turns into "This plot is not one of yours… it is with your colleague now". As Sebastina, it is in Sebastina's Plots.
6. Tick **Sayooj as Team lead**: their Actions opens on everyone with the team strip, Plots shows all of them, the owner menu shows counts. Their access history says "Made team lead in Client Relations". Untick: back to their own.
7. As yourself: everything as before. **Financial Management** and **Reporter** still show every plot's payments.
8. As the **probe**: Client Relations is still refused.

## Verification — the founder, on staging (eleventh piece)

_Transmittals the design team can use._

Staging is becoming the real database, so this checklist issues nothing — an issued transmittal can never be deleted. The TB mint and the kept list are proved by the trial; the team's next real issue shows them.

1. **Villa 41 → TR-0002 → Cover sheet (PDF)**: its nine uploaded sheets listed by name; the file is named `Goodearth-Transmittal-Villa41-TR-0002.pdf`.
2. **Villa 40 → New transmittal → Structural → Foundation Layout → Revise to R1.** On the draft, set Revision to **0** — refused, in a sentence. Set **3** — saved; it reads R3.
3. Paste a Google Drive or WhatsApp link as the WorkDrive link — refused, in a sentence.
4. Paste a real WorkDrive share link: in two seconds or so, "38 sheets" and their names. Paste the folder's own WorkDrive address instead — refused, asking for the share link. Add a file to the folder in WorkDrive, press **Read the folder again** — 39.
5. Type _What changed_ — the line under the title says it is ready. **Don't issue: delete the draft.**
6. After the team's next real issue: it reads **TB-000n**; its cover sheet carries the link and every sheet's name; on a supervisor's phone, **Supervisors → that villa → Open drawings** opens the folder.

## Verification — the founder, on staging (twelfth piece)

_Construction and Interior, two sides of a plot._

1. **Plots**: each card shows two owners — a hard hat for Construction, a sofa for Interior, with the interior stage beside it. The **Side** filter → Interior lists only plots with interior work; pick Interior + Sayooj — only plots where Sayooj owns the interiors or holds an interior step.
2. Open a plot with both owners: the header names both. **Next steps** → **Interior**: only interior steps; type a step — the owner chip already says the Interior owner, and the side chip says Interior. Switch it to Construction: the owner becomes the Construction owner.
3. On a step's **•••** → Side: move it to Construction; Undo brings it back.
4. **Actions** → **Interior**: only interior steps, and the team strip counts only interior work.
5. Nowhere in Client Relations says "Kaadal" or "Sales" any more (the plot record's **Construction** and **Interior** cards).

## Verification — the founder, on staging (thirteenth piece)

_The design board: each villa passed from stage to stage._

Staging is becoming the real database, so use villas the team is really working on — what goes in is real from day one, and an action is never deleted. You are admin: you see everything, but you are offered as a person on a stage or an action's owner only if you hold `/design-management` yourself (Settings → People).

1. **Design management** opens on its welcome: villas in design, revising, with the client, actions overdue. The tabs are **Board · Actions · Design stages**.
2. **Design stages**: Design, Permit, Working Drawings, Structural and Interiors are ticked **On the board**; MEP, Typical Details and Landscape are not. Tick MEP, open the Board — it has an MEP column; untick it.
3. **Board**: "No villa has started yet", and **Not started** lists every villa. Open **Villa 41** → **Set where it is** → Working Drawings, with Jiljith and Navarang → the Board shows it in the Working Drawings column; on its page Design and Permit read Done.
4. On Villa 41's Working Drawings, tap **With the client** — the card says so; **Undo** puts it back. **Pass to Structural →** pick Vaishnav → Working Drawings Done, Structural Working with Vaishnav; Villa 41 moves to the Structural column.
5. On its **Design** card, **Send back for revision** — the button waits until you say why. "Client changed the staircase" → Villa 41 stays in Structural; its card reads **Revising Design**, red; the villa's **History** has the line with the reason. Tap **Done** on Design — the revision is over.
6. On Villa 40, **Set where it is** → Design; then **Start Interiors** beside it — both Working; Villa 40 sits in the Interiors column.
7. On a stage, **+ Add** puts someone on; the cross takes them off, with Undo. **•••** → Take back the start returns a stage started by mistake to Not started.
8. **Actions**: the team strip (you are admin). Type "Send the revised plan to the client", pick Villa 41, **Design**, Jiljith, **Tomorrow** → **Add**: under _Next 7 days_, and on Villa 41's page under Next steps. As Jiljith (or ask them), tick it — "Waiting for Siddharth to confirm"; as you, tick it closed; Undo works.
9. Villa 41's page still lists its transmittals, and **New transmittal** works as before.
10. On a phone: the Board stacks a stage at a time; a lot card opens its villa; nothing scrolls sideways.
11. As the **probe** (`/estimator`, `/inventory`): Design Management is not in the sidebar, and `/design-management/actions` sends it home.

## Verification — the founder, on staging (fourteenth piece)

_One owner per side._

1. Open **Plot 17**: its Interior owner now reads **Anu** (from Anu's step). **W14**'s Construction owner reads **Sayooj**.
2. On a plot with no Interior owner: **Next steps → Interior** — the owner chip reads "No interior owner" in amber; type a step and Add — it asks you to give the plot an Interior owner first.
3. Give that plot an Interior owner (the Interior card). Add the step — it is theirs; the owner chip on it is not a menu.
4. Change the plot's **Interior owner** to someone else: every open interior step on it moves to them; a done one keeps who did it.
5. Try to set the Interior owner to nobody while it has open steps — refused, in a sentence.
6. On a step's **•••** → Side → Construction: "Moved to Construction · (the Construction owner)'s now".
7. On **Actions**, a step with **no plot** still lets you pick any owner.

## Verification — the founder, on staging (the Kaadal look)

_The Kaadal look._ The founder waived Fable's approval pass for this merge ("merge", 2026-10-18). Opus re-reviewed the full diff: no migration, policy, view, action or money read is touched; dark mode still declares `color-scheme`; `/login`, `/forgot-password`, `/_not-found` and `/_global-error` still prerender. The rules are `DESIGN.md`.

1. Open staging in a private window: light, whatever the device says; the tab reads **Kaadal Toolbox**; sign-in is the burgundy page with the white panel.
2. Sign in. The sidebar reads **Toolbox** and lists teams; click a team — its page opens, a band in its colour and a box per tool.
3. Open a tool from the box: its opening band is in the team's colour, and **← (team)** goes back. Only that team lists its tools in the sidebar.
4. The home page shows each team as a colour block, in Settings → Teams order: burgundy, teal, olive, ochre, sage, blush, then round again; Other is ink.
5. Inside a tool, the tabs are underlined in burgundy; on a phone they swipe sideways. Bills, Indents and PO "Lines" headings are in Gambetta.
6. As the probe (single grant), the home page and the team page show only the probe's tools, and a team the probe has nothing in is not there.
7. Switch to dark once: the rail and sign-in are deep teal, the page ink; open a date picker — it is dark too.
