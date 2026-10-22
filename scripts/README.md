# scripts/

Standalone Node scripts, not part of the app: migration tooling, schema checks, environment moves, data imports and a few ops checks. Run with `npx tsx scripts/<file>.ts` unless an npm alias is given.

**House rules for anything that writes:** `--project <ref>` (or `--from`/`--to`) is required and never defaults; dry run by default, `--commit` to write; match on a natural key so a re-run writes nothing.

The `data/` files importers read are gitignored: real business data, some of it bank details.

## Migrations and schema

- `apply-migrations.ts` — applies pending migrations to one database and records them. `npm run db:apply -- --project <ref> --commit`
- `check-migrations.ts` — fails if a database lacks a migration in this branch or an applied file was edited. `npm run db:check -- --project <ref>` (read-only; CI runs it)
- `check-view-columns.ts` — checks every view against `view-manifest.ts`: columns, guards, flags, no write grants. `npm run db:check-views -- --project <ref>` (read-only)
- `dry-run-migrations.ts` — runs migration files, and an optional trial from `scripts/trials/`, inside one transaction that always aborts: every statement and assert runs, nothing is kept. Refuses production. `--project <ref> <files…> [--trial <file>]`
- `trials/` — SQL trials for that dry run, each named for what it proves. `erp-chain.sql` runs as the database owner (behaviour only); the `*-as-*.sql` and `bill-line-po-check.sql` run as a single-grant person under RLS (BUGCATCHER #19); `replay-pre-batch-history.sql` records its history as a store-keeper and replays it as the owner, who alone may.
- `report-unit-mismatches.ts` — lists indent, PO, receipt and stock lines saved in a unit other than their item's Masters unit. `--project <ref>` (read-only)
- `compare-schema.ts` — every difference between two databases, schema and auth settings. `npm run db:compare -- --project <a> --against <b>` (read-only)
- `migration-ledger.ts`, `view-manifest.ts`, `supabase-management.ts` — libraries: the ledger reader, the list of what each view may be, and the management API in one place (never defaults a ref; throws on a failed query answered with 200; `serviceRoleKey()` for Storage).

## Environments

- `clone-data.ts` — copies master data between databases, ids preserved. `--from <ref> --to <ref>`
- `copy-storage.ts` — copies Storage objects between projects and rewrites the URLs pointing at them. `--from <ref> --to <ref>`
- `scramble-staging-emails.ts` — makes staging's staff emails unroutable, or restores named ones to sign in. `--project <ref> --keep a@b`
- `wipe-staging-records.ts` — clears every record made in the tools, staging only (it refuses any other ref), after writing every row and file it deletes to `data/backups/`. Every table must be on its cleared or kept list. `--project <ref>`
- `wipe-drawings.ts` — deletes every drawing, transmittal and sheet file in Design Management (design stages stay), past the guards in one transaction. `--project <ref> [--commit]`
- `backup-tables.ts` — library: whole tables to JSON in `data/backups/` before a script changes them.
- `vercel-env.ts` — writes one variable from `.env.local` to Vercel through its API, trimmed and never pasted. `--name <VAR> --target preview|production`

## Data imports

- `import-catalogue-sheet.ts` — the design team's catalogue workbook: pasted pictures and product links onto existing items (matched by content, never by the sheet's code — `lib/masters/catalogue-sheet.ts`), rows not there as new items. `--project <ref> --xlsx <path>`
- `fetch-catalogue-images.ts` — finds the vendor's photo for items with only a link, then thumbnails every item with a picture into Storage. `--project <ref>` (`--limit 10` to try a few)
- `import-masters-workbook.ts` — the founder's masters workbook: vendors and contractors (bank details into the gated `vendor_payment_details`), material categories, materials and their GST %, the estate's works and their labour rates. Deletes nothing: works it no longer lists are switched off, everything else is left and named. `read-xlsx.ts` is its reader. `--project <ref> --xlsx <path>`
- The first imports (material master, vendors, contractors, works, catalogue, the Saarang register, staff) are in git history; `import-masters-workbook.ts` superseded them.

## App checks

- `check-server-actions.ts` — refuses a type re-export in a `"use server"` file (BUGCATCHER #5). `npm run check:actions`, after a build.
- `check-boundaries.ts` — fails when one tool imports another's code, or shared code imports a tool's (CLAUDE.md); `lib/overview/` is the one exception. `npm run check:boundaries`, in CI.
- `check-selects.ts` — every literal `select` string's columns and embeds exist in `database.types.ts`, and an embed with two keys to one table names its key (BUGCATCHER #2). `npm run check:selects`, in CI.
- `check-policies.ts` — asks a database whether row-level security holds: on for every table, no policy reads `profiles.role`, one SELECT policy per table, definers pinned and gated, nothing callable by anon. `npm run db:check-policies -- --project <ref>`, in CI.
- `check-errors.ts` — fails when a Supabase result's `error` is never read; an exception carries `// error ignored: <why>`. `npm run check:errors`, in CI.
- `check-comment-only.ts` — proves a change touched comments and layout only: each changed file compiles to the same code before and after. `npm run check:comments [base] [head]`.
- `google-chat-usage-test.ts` (+ `google-chat-usage-loader.mjs`) — drives the Chat door in-process against staging with Google-shaped events. `npm run chat:usage -- --as <email>`
- `google-chat-patch-card.ts` — rewrites one Chat card as the app; the repair when a refresh fails. `--message spaces/<id>/messages/<id>`
