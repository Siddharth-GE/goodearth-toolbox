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
11. **Attendance** on your phone: today at the top — mark Sajna _Present_, tap her name, in 07:30, out 18:30, Save.
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
3. **Actions**: the team strip shows Anu, Sayooj and Sebastina with the imported counts (Anu 26 open). Click Anu — only hers. **Needs you** is empty.
4. Type "Share 3D with client", pick Plot 4, Sayooj, **Tomorrow** → **Add**: it appears under _Next 7 days_.
5. Tick it — it leaves the list; **Undo** brings it back. Tick an overdue one, then _Show done_.
6. On a _date assumed_ action pick **This Friday** — the flag goes and it moves to _Next 7 days_.
7. **••• → Waiting on management** — it moves to the top, and **Needs you** counts 1.
8. **Plots**: lot cards with health pills; the **No next step** chip lists sold plots with nothing open. Open Plot 10 → **Next steps** on top; add one there; tap a Kaadal stage; step the build forward with ▶ — the card's rail fills.
9. **Clients**: cards with faces and plot chips; open one — their plots and their actions. **Collections** reads like Actions: overdue first.
10. **Plots → Saarang West - Villas**: 27 cards, six with a buyer, each showing its configuration (1BHK Study …). In Saarang, **Plot 33 & 34** is one card; Plots 9 and 27 have no buyer; Plots 3, 35 and 43 have their new buyers. **Clients → Stage: Lost** lists the three who cancelled, each with its reason.
11. **Anu, signed in on her phone**: she opens on her own list with the greeting; the composer, the menus, the chips and the tick work with a thumb; nothing scrolls sideways.
12. As the **probe** (it holds `/estimator` and `/inventory`): Client Relations is not in the sidebar, and `/client-relations/actions` sends it home.

## Verification — the founder, on staging (eighth piece)

_Only whoever set an action closes it._

1. **Actions** → add "Trial: send the brochure" for **Anu**, Tomorrow. You set it.
2. Ask Anu (or sign in as her) to open **Actions**: her tick on it says _Mark finished — Siddharth confirms_. She ticks it → it moves to **Waiting to confirm**, "Waiting for Siddharth to confirm".
3. Back as you: it tops your list under **Waiting to confirm**, "Waiting for you to confirm". Tick it → closed. Undo works.
4. Anu cannot open it again; on Sayooj's own actions her tick is dashed and locked.
5. One of Anu's imported actions (from the tracker): she ticks it straight to done — she counts as its setter.

## Verification — the founder, on staging (tenth piece)

_Each person sees the work assigned to them._

With `/client-relations` given to Anu, Sayooj and Sebastina:

1. **Settings → People → Sayooj**: under Client Relations, a **Team lead** tick. Leave it off for now.
2. **As Anu** (on her phone if you can): **Plots** shows only her plots; **Actions** opens on her own list, and **All I see** adds what she set for others and others' steps on her plots; **Clients** lists only her clients; the owner menu shows names without counts.
3. Paste the link of one of Sayooj's plots (from your own view) into Anu's browser: "This plot is not one of yours".
4. As Anu, add a step on one of her plots for Sayooj. **As Sayooj**: that plot appears, with that one step — not Anu's other steps on it. He ticks it finished; Anu closes it; the plot leaves Sayooj's list.
5. As Anu, give one of her plots to Sebastina (Construction owner chip): the page turns into "This plot is not one of yours… it is with your colleague now". As Sebastina, it is in her Plots.
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

1. Open **Plot 17**: its Interior owner now reads **Anu** (from her step). **W14**'s Construction owner reads **Sayooj**.
2. On a plot with no Interior owner: **Next steps → Interior** — the owner chip reads "No interior owner" in amber; type a step and Add — it asks you to give the plot an Interior owner first.
3. Give that plot an Interior owner (the Interior card). Add the step — it is theirs; the owner chip on it is not a menu.
4. Change the plot's **Interior owner** to someone else: every open interior step on it moves to them; a done one keeps who did it.
5. Try to set the Interior owner to nobody while it has open steps — refused, in a sentence.
6. On a step's **•••** → Side → Construction: "Moved to Construction · (the Construction owner)'s now".
7. On **Actions**, a step with **no plot** still lets you pick any owner.
