# Native apps on iPhone and Android

**Approved by the founder 2026-10-18 ("everything looks good"). Build Android first.** A1, A2, A4 and B are on staging (#112, #113, #115); D's camera is built on `feature/native-apps`. **Next, unless the founder says otherwise: C (push; the Firebase project exists)**, then the iPhone (A3). Work on `feature/native-apps` in its own worktree (`C:\Users\goodearth\Documents\Code\kaadal-toolbox\toolbox-native`, beside the main folder), brought level with `staging` first; each piece ends in a pull request, merged only on the founder's word. **The founder waived Fable's reviews for this build** (2026-10-18: "waive all the fable reviews i trust you"), so Opus takes each `[Fable]` step and says so beside it. Every new package is a release at least two weeks old (Capacitor 8.5.3 was days old on 2026-10-18).

The founder's choices (2026-10-18): **one shared app in both stores**, built with Capacitor 8, showing today's Toolbox screens and adding **push notifications, Face ID / fingerprint, and camera and scanning**. iPhone on the **public App Store**; no Mac, so iPhone builds run on GitHub's free macOS machines (the repo is public). Same ID on both: `com.kaadalgroup.toolbox`.

Why this shape: every tool works on day one, a website fix still reaches both apps with no store release, and the native features are what Apple's "more than a website" rule (4.2) asks for. The Android version replaces the Play wrapper (`android/PLAN.md`) as an ordinary update: same package, same upload key. Version 1 of the wrapper ships first, so staff have an app meanwhile.

## The risks, said once

- **Capacitor calls loading the live site "not intended for production".** Many apps ship it; the cost is review risk when the network drops. So the app carries its own "No connection — try again" screen (`server.errorPath`) and never shows a blank page.
- **Apple may say a staff-only app belongs in Apple Business Manager** (guideline 3.2), as it has for others. The fallback is the same build sent as a private Custom App: a setting in App Store Connect, not a rebuild.
- **Google refuses to sign in inside an app's web view.** "Sign in with Google" must open in a browser tab and come back to the app (step A4). Apple's demo reviewer needs that path, as Play's does.
- **Apple's login rule (4.8)** exempts apps that sign in with an existing company account, which ours is; the review notes say so.

## Founder first

- [ ] [Founder] Apple Developer Program as an **Organization** (in progress), then App Store Connect: create the app `com.kaadalgroup.toolbox`, and an **App Store Connect API key** (Users and Access → Integrations) for the build machine.
- [ ] [Founder] Send version 1 of the Android wrapper to Play (`android/PLAN.md`), so staff are not waiting on this.
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

- [ ] [Fable] The migration: a `push_devices` table (a person's own devices only; RLS on; write revokes), and how a server action may send to **someone else's** devices — the sanctioned admin-client use, or a definer function checking the sender's grant — written into `SECURITY.md` first.
- [ ] [Opus] `lib/push/` sends through Firebase (Android) and APNs (iPhone) after the write has succeeded, never inside it: a failed push never fails an indent.
- [ ] [Sonnet] The first three: an **indent approved** (to its raiser), a **Relay baton waiting** (to the department's holders), a **design stage handed over** (to the person put on it). A tap opens that page.
- [ ] [Founder] Vet each one on both phones, and turn notifications off in the phone's settings to see nothing break.

## D. Camera and scanning

- [x] [Opus] Photos: built in the app, not the website, as version 2.2.0 (code 4). Chrome and the iPhone already offer the camera on a picture field; the Android app now does too (`CameraFileChooser`), so every photo upload has it at once: Birdwing documents and expense bills, Directory photos, Selections views. Seen on the Android 16 emulator: Camera beside Files on a picture field, a shot reaching the page as a readable JPEG, Files choosing a picture, cancelling in the camera or the picker, the picker opening again after, and a spreadsheet field going straight to Files.
- [ ] [Founder] Vet with version 2.2.0 on the phone (`kaadal-toolbox-2.2.0-test-install.apk`): on Birdwing Books → Expenses, a row's **Bill** button offers **Camera**; take a photo of a paper bill and it uploads; the same button's other choice still picks a PDF; your Directory photo from the camera. iPhone: checked when A3 builds it.
- [ ] [Founder] **Question: what gets scanned?** Items and bins carry no barcodes today, so scanning first needs labels — for example a QR sticker per item or rack printed from Inventory. Scanning is planned once that is decided.

## E. The stores

- [ ] [Opus] Draft the App Store listing, privacy labels and review notes (the reviewer Gmail with Google sign-in, the 4.8 exemption, the native features to try); screenshots from TestFlight.
- [ ] [Founder] Submit to the App Store; send the Android update to Play.
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
