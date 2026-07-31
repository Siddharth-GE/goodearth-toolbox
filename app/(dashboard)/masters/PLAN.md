# Masters — build plan (Phase 1 of the full business-system rebuild)

**Status: SHIPPED — merged to `master` 2026-07-31.** Gate 1 tested and
approved by the founder in the browser. Phase 2 (Selections) is next.

See the memory note `build_plan_selections_chain` (or the founder's own
PDF) for the full 9-phase roadmap this is the foundation of.

## Steps

- [x] 1. Migration (`supabase/migrations/0004_masters.sql`): projects,
      plots, units, clients, vendors, stores, items, item_categories,
      brands, space_types, spaces. RLS: read open to all authenticated
      staff, write restricted to admins. Seeded space_types (11), a
      few item_categories/brands, 5 sample items (3 catalogue, 2 material).
- [x] 2. `lib/masters/*.ts` — two files per master (`<name>.ts` reads +
      `<name>-actions.ts` writes — see CLAUDE.md's "Shared masters" for
      why the split is required, not stylistic: a mixed single file
      broke the production build even though `tsc` passed clean).
      Read functions have no `requireApp` gate (any future tool can
      call them); write functions are gated by
      `requireApp(user, "/masters")`, following
      `lib/settings/actions.ts`'s pattern.
- [x] 3. `components/masters/{project-picker,unit-picker,item-picker,
      vendor-combobox}.tsx` — plain `<Select>`-based for now; upgrade to
      a real searchable combobox in Phase 2 once the full catalogue
      (~2,631 items) is imported.
- [x] 4. Masters screens: `NavTabs` across Projects / Plots / Units /
      Clients / Vendors / Stores / Items / Categories & Brands, each a
      plain table + `Dialog`-based create/edit form (Categories & Brands
      use lightweight inline add-row forms instead, since they're
      simpler and grow continuously).
- [x] **Gate 1** (founder tests in the browser): create a project, plots,
      units, assign a client, add vendors, stores, and items of both
      kinds. See the plan file's "Gate 1 verification" section for the
      exact click-through.

## Judgment calls made during this phase (flagged for the founder)

- `projects.status`, `plots.status`/`units.status` value lists
  (`planning`/`active`/`completed` and `available`/`reserved`/`sold`)
  are my own defaults, not founder-specified — easy to extend later
  (additive), but say so if they don't match how Goodearth actually
  talks about status.
- `spaces`/`space_types` ship with schema + RLS only, no screen yet —
  deferred to whichever phase (likely Selections) actually consumes
  per-unit room assignment.
- `item_categories`/`brands` do get a screen (unlike `space_types`)
  since Gate 1 itself needs a category to exist before an item can be
  created, and both will keep growing as real items get catalogued.
- `items.code` is deliberately **optional and hand-typed** in Phase 1.
  It's unique, editable at master level (the item dialog), and shown +
  searchable in the items list — but nothing generates it.
  Auto-numbering stays deferred, and the real catalogue changed what it
  should look like: Goodearth's actual codes are a **4-letter sub-type
  prefix + 3-digit sequence** (`BENS001` bench, `SOFS…` sofa, `HANL…`
  hanging light, `DINT…` dining table), which is *finer than category* —
  the single "Seating" category spans `BENS`/`CHAS`/`ARMS`/`SOFS`. So a
  `code_prefix` column on `item_categories` would NOT reproduce this;
  whenever auto-numbering is built it needs its own sub-type lookup, and
  it must follow this existing convention rather than invent a competing
  `GE-SOF-001` style. Editing a code is always safe — every downstream
  table references `items.id`, never the code.
- The **catalogue import was pulled forward** out of Phase 3, ahead of
  Selections: building the picker against 2,631 real items beats
  designing it around 5 samples and discovering the truth later. See
  `scripts/import-catalogue.ts` (dry run by default, re-runnable, skips
  codes already present) and `supabase/migrations/0005_remove_catalogue_seed_demo.sql`,
  which clears the three fictional catalogue seeds whose categories
  (`Sofas`/`Dining Tables`/`Lighting`) would otherwise sit beside the
  real `Seating`/`Tables`/`Lighting & Electrical Fixtures`.
- Only **900 of the 2,631 items carry an image URL**, all on other
  companies' Shopify CDNs. Decided architecture: copy *thumbnails* into
  Supabase Storage (~14 MB, ours, can't rot) and leave full images
  pointing at the source (~360 MB not worth storing for a rarely-opened
  detail view); items with no image get a `lib/color-hash.ts` placeholder
  tile rather than a broken-image icon. `thumb_url` is left null by the
  import — a separate re-runnable pass fills it before the picker ships.
