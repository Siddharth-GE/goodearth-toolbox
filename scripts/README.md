# scripts/

Everything here is a standalone Node script, not part of the app itself: migration tooling, schema checks, environment moves, one-off data imports and a couple of ops checks. Every data-writing script follows two house rules: `--project <ref>` is required and never defaults to a database, and the script is dry-run by default, printing what it would do until you add `--commit`.

Six scripts have an npm alias in `package.json`. The rest are run directly with `npx tsx scripts/<file>.ts`.

## Migrations and schema

| Script                   | What it does                                                                                                                         | How to run                                                  | Writes?              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------- |
| `apply-migrations.ts`    | Applies `supabase/migrations/*.sql` to one named database and records what it applied.                                               | `npm run db:apply -- --project <ref> --commit`              | dry-run / `--commit` |
| `check-migrations.ts`    | Asks a database whether it has every migration in this branch and fails if not.                                                      | `npm run db:check -- --project <ref>`                       | read-only            |
| `check-view-columns.ts`  | Checks every view in `public` against `view-manifest.ts` (columns, WHERE clause, grants).                                            | `npm run db:check-views -- --project <ref>`                 | read-only            |
| `compare-schema.ts`      | Compares the schema of two databases (columns, RLS, policies, privileges) and reports every difference.                              | `npm run db:compare -- --project <ref-a> --against <ref-b>` | read-only            |
| `migration-ledger.ts`    | Shared reader for the migration folder and the `applied_migrations` ledger, used by `apply-migrations.ts` and `check-migrations.ts`. | library, not run directly                                   | n/a                  |
| `view-manifest.ts`       | The list of what every `public` view is allowed to be; what `check-view-columns.ts` checks against.                                  | library, not run directly                                   | n/a                  |
| `supabase-management.ts` | The Supabase management API in one place, used by every script above. Never defaults a project ref.                                  | library, not run directly                                   | n/a                  |

## Environments

| Script                       | What it does                                                                                                               | How to run                                                                       | Writes?              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `clone-data.ts`              | Copies real master data (people, places, clients, the catalogue) from one database to another, ids preserved.              | `npx tsx scripts/clone-data.ts --from <ref> --to <ref> --commit`                 | dry-run / `--commit` |
| `copy-storage.ts`            | Copies Supabase Storage objects between two projects and rewrites the URLs that point at them.                             | `npx tsx scripts/copy-storage.ts --from <ref> --to <ref> --commit`               | dry-run / `--commit` |
| `scramble-staging-emails.ts` | Rewrites staff email addresses on staging to unroutable ones (or restores real ones for named people to sign in and test). | `npx tsx scripts/scramble-staging-emails.ts --project <ref> --keep a@b --commit` | dry-run / `--commit` |

## One-off data imports

| Script                      | What it does                                                                                                              | How to run                                                           | Writes?              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------- |
| `import-catalogue.ts`       | One-off importer for the Goodearth catalogue (~2,631 items) from `data/*.csv`.                                            | `npx tsx scripts/import-catalogue.ts --commit`                       | dry-run / `--commit` |
| `fetch-catalogue-images.ts` | Fetches catalogue thumbnails into Storage for items that have an `image_url` but no `thumb_url` yet. Re-runnable.         | `npx tsx scripts/fetch-catalogue-images.ts --commit`                 | dry-run / `--commit` |
| `import-contractors.ts`     | Marks the site team's contractors in the vendors master, from the estimation workbook.                                    | `npx tsx scripts/import-contractors.ts --project <ref> --commit`     | dry-run / `--commit` |
| `import-material-master.ts` | One-off importer for the construction material master into `items` (kind='material').                                     | `npx tsx scripts/import-material-master.ts --project <ref> --commit` | dry-run / `--commit` |
| `import-saarang.ts`         | One-off importer for the Saarang plot/villa/client register, transcribed by hand from the working sheet.                  | `npx tsx scripts/import-saarang.ts --commit`                         | dry-run / `--commit` |
| `import-staff.ts`           | One-off importer for the company staff list: creates logins, sets names, department and designation, grants `/directory`. | `npx tsx scripts/import-staff.ts --commit`                           | dry-run / `--commit` |
| `import-vendors.ts`         | One-off importer for the supplier vendors, including bank details into the gated `vendor_payment_details` table.          | `npx tsx scripts/import-vendors.ts --project <ref> --commit`         | dry-run / `--commit` |
| `import-works.ts`           | Loads the works vocabulary into `work_groups` and `work_items` from the estimation workbook.                              | `npx tsx scripts/import-works.ts --project <ref> --commit`           | dry-run / `--commit` |

## App checks

| Script                    | What it does                                                                                                                                         | How to run                                                 | Writes?              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| `check-server-actions.ts` | Guards against a bare `export type` in a `"use server"` file, which builds fine and then kills every action in its chunk. Run after `npm run build`. | `npm run check:actions`                                    | read-only            |
| `rotate-marathon-pins.ts` | Rotates a Marathon kiosk agent's PIN off a known/published value.                                                                                    | `npm run rotate-marathon-pins -- --project <ref> --commit` | dry-run / `--commit` |

The `data/*.csv` files the importers read are gitignored on purpose: they carry real business data, some of it bank account details, and none of it belongs in this public repo.
