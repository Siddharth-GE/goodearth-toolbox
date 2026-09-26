# scripts/

Standalone Node scripts, not part of the app: migration tooling, schema checks, environment moves, data imports and a few ops checks. Run with `npx tsx scripts/<file>.ts` unless an npm alias is given.

**House rules for anything that writes:** `--project <ref>` (or `--from`/`--to`) is required and never defaults; dry run by default, `--commit` to write; match on a natural key so a re-run writes nothing. Three early one-offs predate the rule — `import-catalogue.ts`, `import-saarang.ts`, `import-staff.ts` — and write to whatever `.env.local` points at (staging); they have been run and are kept as the record.

The `data/` files importers read are gitignored: real business data, some of it bank details.

## Migrations and schema

- `apply-migrations.ts` — applies pending migrations to one database and records them. `npm run db:apply -- --project <ref> --commit`
- `check-migrations.ts` — fails if a database lacks a migration in this branch or an applied file was edited. `npm run db:check -- --project <ref>` (read-only; CI runs it)
- `check-view-columns.ts` — checks every view against `view-manifest.ts`: columns, guards, flags, no write grants. `npm run db:check-views -- --project <ref>` (read-only)
- `compare-schema.ts` — every difference between two databases, schema and auth settings. `npm run db:compare -- --project <a> --against <b>` (read-only)
- `migration-ledger.ts`, `view-manifest.ts`, `supabase-management.ts` — libraries: the ledger reader, the list of what each view may be, and the management API in one place (never defaults a ref; throws on a failed query answered with 200; `serviceRoleKey()` for Storage).

## Environments

- `clone-data.ts` — copies master data between databases, ids preserved. `--from <ref> --to <ref>`
- `copy-storage.ts` — copies Storage objects between projects and rewrites the URLs pointing at them. `--from <ref> --to <ref>`
- `scramble-staging-emails.ts` — makes staging's staff emails unroutable, or restores named ones to sign in. `--project <ref> --keep a@b`
- `vercel-env.ts` — writes one variable from `.env.local` to Vercel through its API, trimmed and never pasted. `--name <VAR> --target preview|production`

## Data imports

- `import-catalogue-sheet.ts` — the design team's catalogue workbook: pasted pictures and product links onto existing items (matched by content, never by the sheet's code — `lib/masters/catalogue-sheet.ts`), rows not there as new items. `--project <ref> --xlsx <path>`
- `fetch-catalogue-images.ts` — finds the vendor's photo for items with only a link, then thumbnails every item with a picture into Storage. `--project <ref>` (`--limit 10` to try a few)
- `import-material-master.ts` — the construction material master into `items`. `--project <ref>`
- `import-vendors.ts` — supplier vendors, with bank details into the gated `vendor_payment_details`. `--project <ref>`
- `import-contractors.ts` — marks the site team's contractors among vendors. `--project <ref>`
- `import-works.ts` — the works vocabulary from the estimation workbook. `--project <ref>`
- `import-catalogue.ts`, `import-saarang.ts`, `import-staff.ts` — the early one-offs above.

## App checks

- `check-server-actions.ts` — refuses a type re-export in a `"use server"` file (BUGCATCHER #5). `npm run check:actions`, after a build.
- `rotate-marathon-pins.ts` — moves any kiosk agent off a published PIN. `npm run rotate-marathon-pins -- --project <ref>`
- `google-chat-usage-test.ts` (+ `google-chat-usage-loader.mjs`) — drives the Chat door in-process against staging with Google-shaped events. `npm run chat:usage -- --as <email>`
- `google-chat-patch-card.ts` — rewrites one Chat card as the app; the repair when a refresh fails. `--message spaces/<id>/messages/<id>`
