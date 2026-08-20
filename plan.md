# Import the material master and supplier vendors (Material.xlsx)

> On approval, this file becomes repo-root `plan.md` (the running build plan, per CLAUDE.md/MODELS.md). Steps carry owner tags.

## Context

The founder supplied `C:\Users\Kaicha\Downloads\Material.xlsx`: the full construction material master (~2,050 materials) and 83 supplier vendors with contact, GST, bank and payment-term details. This is **TODO.md item 3** ("Enter the construction materials in Masters as `kind='material'` items with their indicative prices") — since `0086`, materials ARE the items master, and this data feeds mixes, work recipes, estimates, requests and comparisons. The vendors master currently holds only 85 contractors; the materials band holds 2 seed rows. Both databases are at migration `0088`; branch `staging` is clean and synced.

## Source data

| Sheet                   | Rows  | What it is                                                                                                                                                                                                   |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Material Master_New W` | 2,050 | Full master: code, name (col C "Material Description"), category, unit (403 filled), rate (400 filled)                                                                                                       |
| `Sheet1`                | 561   | Cleaner re-extract of 556 of the same codes (Civil/Electrical/Steel/Tiles categories) with group ("Material"), richer description and reliable UoM; **5 rows have no code** (Laterite blocks, Dust Laterite) |
| `Vendor Extract Report` | 83    | Vendor name (83), bank name/account/holder/IFSC (72), payment term days (67), address (10), GSTIN+state (9), mobile (7), contact name/designation (6), email (4), creator (ignore — AppSheet metadata)       |

Quirks found and handled below: one duplicated code (`PLD/836` names two different products); 33 rows with blank category; category spellings vary in case and "Miscelleneous" is misspelt; unit spellings vary (`Sq.Ft`/`Sqft`, `Liter`, `Cu.M.`/`M3`…); Sheet1 and the big sheet disagree on some units (Box↔Nos) — Sheet1 wins; exactly one sheet vendor ("Linse V") already exists in the DB (as a contractor) — enriched, never duplicated.

## Decisions (founder, via AskUserQuestion, 2026-08-20)

1. **Bank details go in a gated side-table**, not on the ungated vendors master (estimator-rate precedent: masters reads are open to all staff).
2. **All 2,050 materials** are imported; Sheet1's description/unit win where it covers a code.
3. **Blank units default to `nos`**, corrected in Masters as noticed.

## Steps

### 1. `[Sonnet]` Convert the workbook to CSVs in `data/` (gitignored — bank details never enter the public repo)

Python + openpyxl (already installed) one-off, producing:

- `data/material_master.csv` — big sheet as-is (code, name, category, unit, rate)
- `data/material_master_clean.csv` — Sheet1 as-is (category, code, group, description, uom)
- `data/vendors.csv` — vendor sheet as-is

Confirm `git check-ignore data/vendors.csv` passes before anything else. Scripts must fail with a plain message if a CSV is missing (import-catalogue precedent).

### 2. `[Sonnet]` Migration `supabase/migrations/0089_vendor_details.sql`

Additive only, re-runnable, house style (`0082` is the template — audit + `set_updated_at` triggers, drop-if-exists policies, verification DO block):

- `alter table vendors add column if not exists` ×4: `email text`, `contact_designation text`, `gst_state text`, `payment_term_days int` (`gst_no`, `address`, `mobile`, `contact_name` already exist).
- New table `vendor_payment_details`:
  - `vendor_id uuid primary key references vendors (id)` (1:1), `bank_name text`, `account_number text`, `account_holder_name text`, `ifsc text`, `updated_by uuid references profiles (id)`, `created_at`/`updated_at timestamptz not null default now()`.
  - RLS on. **One** SELECT policy: `has_app('/masters') or has_app('/purchase-orders') or has_app('/bills')` (never a second SELECT policy — widen this qual later if needed). Insert/update/delete: `has_app('/masters')`.
  - `audit_row()` and `set_updated_at()` triggers, same shape as `uoms` in 0082.
  - Verification block: table exists with RLS on, exactly 4 policies, the 4 new vendors columns present.
- No new views, no function changes, no money columns — bank details are payment _instructions_, gated by the estimator-rate precedent (sensitive data never sits on an ungated masters read).

### 3. `[Fable]` Review 0089, then apply to **staging**

MODELS.md hard rule: an RLS-touching migration reaches `db:apply` only after Fable review.
`npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`, then `npm run db:types:staging`… **no** — types must keep coming from wherever the team currently generates them; run `npm run db:types:staging` during the build, and regenerate from production after the production apply (the 7de62cd precedent).

### 4. `[Sonnet]` `scripts/import-material-master.ts`

Follows `import-contractors.ts` exactly: `requireProjectRef`/`isCommit`/`sql`/`literal` from `scripts/supabase-management.ts`, dry run by default, `--project <ref> --commit` to write, idempotent (a re-run prints all `=` and writes nothing). Row data moves via `jsonb_populate_recordset` (the `clone-data.ts` rule — no hand-rolled quoting of 2,050 rows).

Merge rule:

- Base = big sheet. For the 556 codes Sheet1 covers: **name** = Sheet1 "Material Description", **description** = Sheet1 "Material" (group), **uom** = Sheet1 UoM. Big-only rows: name = col C, description = col B (2 rows), uom = col E.
- Append Sheet1's 5 code-less rows (code `null`).
- `PLD/836`: first occurrence ("Hose Clip1\"SS") keeps the code; the second ("Hose Coller PVC 32mm") is inserted with code `null` and flagged in the dry run for the founder to assign a code in Masters.
- `kind='material'`, `is_active=true`, `indicative_price` = Rate (400 rows; else null), brand/placement null.
- **Refinement found during build (Fable):** 74 of the 400 priced rows have a unit dispute between the two sheets (bricks priced per box vs per piece, wire per coil vs per metre) and neither sheet is consistently right. A rate belongs to the unit it was quoted in, so on those 74 rows the unit follows Sheet1 and the **rate is cleared and flagged** in the dry run — a blank price gets noticed and re-entered in Masters; a wrong one silently feeds estimates. 326 rates import untouched.

Category normalisation (canonical names, `kind='material'`, created if missing — dry run lists which):
Civil Materials, Electrical Materials, Steel Materials, Finishing Materials, Tiles & Granite Materials, Plumbing Materials, Miscellaneous Materials (typo fixed), Hardware & Tools Materials, Wood Work Materials, Safety Materials, Tools and Equipments, Interior Items, Nursery Plants. Case variants merge into these. Blank category (33 rows) derives from the code prefix (`STL`→Steel, `FIN`→Finishing, `TILE`→Tiles & Granite, `ELE`→Electrical, `CVL`→Civil, `TE`→Tools and Equipments, `PLD`→Plumbing, `MIS`/`GEN`→Miscellaneous, `HW`→Hardware & Tools, `INT`→Interior Items, `SAFE`→Safety, `NUR`→Nursery Plants, `WOD`→Wood Work); anything unresolvable → Miscellaneous Materials, flagged in the dry run.

UoM mapping (case-insensitive; targets are `uoms.name` values):
`Nos`→`nos`, `Cft`→`cft`, `Kg`→`kg`, `Bag`→`bag`, `Sqft`/`Sq.Ft`/`Sq.ft`→`sqft`, `Liter`→`litre`, `Cu.M.`/`M3`→`cum`, `SET`→`set`, `Unit`→`each`, blank→`nos`; **six new uoms** inserted into the `uoms` master (sort_order continuing from 140): `box`, `mtr`, `roll`, `length`, `pkt`, `ml`. Dry run prints the new-uom list and a count per mapping.

Idempotency keys: coded rows match existing items on `lower(trim(code))`; code-less rows on `lower(trim(name))` within `kind='material'`. Existing rows are skipped, never updated (the 2 seed materials and staging's test "cement" stay untouched). Commit run wraps everything in one transaction and prints per-category counts afterwards.

### 5. `[Sonnet]` `scripts/import-vendors.ts`

Same skeleton. Reads `data/vendors.csv` (83 rows):

- Match on `lower(trim(name))` against all vendors. Unknown → insert `{name, contact_name, contact_designation, mobile, email, gst_no (GSTIN), gst_state, address, payment_term_days, is_active: true, is_contractor: false}` (blank cells → null). Known ("Linse V", a contractor) → fill only the detail fields the sheet provides, never touching `name`/`is_contractor`/`is_active`; dry run prints exactly what would change.
- Bank details (72 rows) → `vendor_payment_details` upsert on `vendor_id`.
- Near-duplicate report (the token heuristic from `import-contractors.ts`) over sheet + DB names, printed for the founder, never auto-merged.
- "Creator Name" ignored.

### 6. `[Sonnet]` UI: the new vendor fields become visible and editable

- [lib/masters/vendors.ts](lib/masters/vendors.ts): extend `VendorRow` with `email`, `contact_designation`, `gst_state`, `payment_term_days`.
- [lib/masters/vendors-actions.ts](lib/masters/vendors-actions.ts): extend `readVendorForm` + both actions with the four fields.
- Vendor form in `app/(dashboard)/masters/vendors/_components/`: add the four inputs (shared `components/ui/*` inputs only; plain-English labels).
- [lib/masters/vendor-detail.ts](lib/masters/vendor-detail.ts): also read `vendor_payment_details` for the vendor (**check `error`, not just `data`** — RLS refusal must not render as "no bank details"). New `lib/masters/vendor-payment-actions.ts` (or extend vendors-actions): one upsert action, `requireTool("/masters")` first, `ActionState` return, no `export type` beyond the state alias pattern already used.
- Vendor detail page `app/(dashboard)/masters/vendors/[vendorId]/`: a "Payment details" card (bank name, account number, holder, IFSC, payment term) with edit via `record-form-dialog` pattern; `revalidatePath` in the existing `"/masters/vendors"` form the file already uses.
- Items/Masters screens need **nothing** — the items UI already handles `kind='material'`, and its pickers read the `uoms` and `item_categories` masters.

### 7. `[Opus]` Staging run + checks

1. CI green on the feature branch (`gh run list` — a successful push is not a green build).
2. Dry-run both scripts against staging; eyeball the reports (new categories, new uoms, flagged rows, near-dup vendor pairs). Then `--commit`, then re-run dry: everything prints `=`.
3. Open the pages on staging (BUGCATCHER: a green build proves nothing about a select string): Masters → Items filtered to materials (counts ≈ 2,056 incl. seeds), Masters → Vendors (suppliers filter shows the 83), a vendor detail page showing bank details.
4. Probe (single-grant) smoke: a probe account **without** `/masters` must not read `vendor_payment_details` (verify via a tool page or direct PostgREST answer — the RLS gate is the point of step 2).
5. STATUS.md: add `vendor_payment_details` to the cross-tool contract table (Masters-owned; SELECT by `/masters`, `/purchase-orders`, `/bills`).

### 8. Founder vets on staging.goodearthkannur.org → `[Fable]` approval pass → production

Only after the founder's explicit go-ahead:

- `npm run db:apply -- --project pajfrgnkapicdgangjey --commit` (0089), `npm run db:compare` empty, `npm run db:types` (from production).
- Both import scripts: dry-run against production, review, `--commit`, re-run prints `=`.
- Merge `staging` → `master` after the Fable diff review; confirm the Vercel Production deployment; press one real write button on production (TODO item 1 rides along).
- TODO.md: tick item 3; note item 4 (works recipes) is now unblocked.

## Branch

`feature/masters-vendor-import` off `staging`. Commit each working piece (migration; materials script; vendors script; UI) with plain-English messages and the committing model's co-author line.

## Risks / notes

- **Bank details are the sensitive payload.** They exist only in the gitignored `data/` CSV and the gated table. Never inline them in a script (the repo is public — the Marathon-PIN lesson).
- The `uoms` FK means an unmapped unit fails the insert loudly, not silently — the mapping table above is exhaustive for the spellings present.
- Importing `indicative_price` onto items is founder-settled ground (0086: "the RATE is the item's indicative_price… as visible as item prices already are").
- Scripts write via the management API (postgres role, bypasses RLS) — sanctioned import-script precedent; `--project` required, no defaults.
- No contract-table columns are renamed or dropped; everything is additive.

## Verification (founder's browser checklist, staging)

1. Open **Masters → Items**, filter kind Material — the list should hold ~2,056 materials across 13+ categories with units and (for ~400) rates.
2. Search a few you know: "Jelly6mm" (Cft, ₹45), "MS L Angle", any Simpolo tile.
3. Open **Masters → Vendors**, filter Suppliers — 83 names from the sheet.
4. Open **ELOR LIGHTING PVT LTD** — address, GSTIN, contact and a Payment details card with HDFC account + IFSC.
5. Edit one vendor's payment term, save, reopen — it sticks.
