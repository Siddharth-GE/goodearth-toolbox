# SHIPPING.md — databases, migrations, environments and deploys

The two databases, how migrations move, and how code reaches production. CLAUDE.md carries the one-line rules; this is the protocol. Read it before a migration, a merge, a deploy, or anything environmental.

## The two databases

|                             | ref                    | what it is                                                                                                |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `goodearth-toolbox`         | `pajfrgnkapicdgangjey` | **Production.** Real work, real staff, real client money.                                                 |
| `goodearth-toolbox-staging` | `ipstebqawrvhkyntctrv` | **Staging.** Everything the toolbox was built with. Local `npm run dev` and every preview URL point here. |

Both are reached from this machine through the management API (`/database/query`, `SUPABASE_ACCESS_TOKEN` in `.env.local`, account-level so it reaches both), always through `scripts/supabase-management.ts` — it never defaults a project ref and it throws on the API's habit of answering a failed query with HTTP 200. No CLI, no local Postgres, no Studio edits. Use Node for requests; PowerShell's `Invoke-RestMethod` mangles large JSON bodies.

**Only master data ever crosses between them** (`scripts/clone-data.ts`) — people, places, clients, the catalogue. A plan, a loan or any record someone _builds in_ a tool is a transaction and never crosses.

## Migrations

- **Never apply one by hand.** `npm run db:apply -- --project <ref> --commit` applies what is pending and records it in `applied_migrations` (`0067`), so a re-run is a no-op. **`--project` is required everywhere and never defaults.**
- **CI asks.** `npm run db:check -- --project <ref>` fails if a database lacks a migration in the branch, or an applied file was edited; it runs on every pull request against the database the base branch deploys to.
- **Staging first, then production, then merge.** Apply to staging → `npm run db:types:staging` → build and test → apply to production → `npm run db:types` → merge. Commit the types with the migration.
- **`npm run db:compare -- --project <a> --against <b>` must come back empty** whenever the two should be level. It compares columns, RLS, policies, grants, functions, views, triggers, indexes, constraints, storage and every auth setting — objects made by hand once went unrecorded until it looked.
- **Additive only; never edit an applied migration** — a correction is a later file, and the ledger's checksum catches an edit.
- **Write every one to run twice** (`if not exists`, `create or replace`) and end it asserting what it claimed to do.
- **A seed is a fixture in development and a credential in production** — ask what a seed row becomes on a replayed database.
- Making an admin: the toggle in Settings (`profiles_guard()` refuses to remove the last active admin). Raw SQL is only for when nobody can get in.

## Environment

`.env.local` locally, Vercel settings deployed.

- `NEXT_PUBLIC_SUPABASE_*` are public — the anon key is safe because RLS is on everywhere.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely — server-only, for the sanctioned uses in `SECURITY.md` and scripts.
- `SUPABASE_ACCESS_TOKEN` is the management API key — local only, and CI's one secret (for `db:check`); rotating it means rotating it in GitHub too.
- `MARATHON_SESSION_SECRET` signs the kiosk cookie; `AUTH_COOKIE_SECRET` signs the sign-in flow's cookies (separate on purpose); rotating either signs people out. `SITE_URL` is the app's absolute URL.
- **Vercel holds the Supabase variables twice** — a Production entry (production database) and a Preview entry (staging). If a preview ever shows real data, check that first.
- **Vercel Authentication is off** (Google must reach the Chat endpoint), so every preview URL is public — and reads staging, so trying a feature there can never touch real work.
- **Secrets go into Vercel through its API** (`scripts/vercel-env.ts`), never pasted and never marked "sensitive" (BUGCATCHER #18).
- Anything the platform holds outside the database — auth settings, email templates, redirect lists — is configuration too (BUGCATCHER #10). **Supabase's redirect allow-list** must cover previews: `https://goodearth-toolbox-*.vercel.app/**`.

Data scripts in `scripts/` are dry-run by default, `--commit` to write, and match on a natural key so a re-run writes nothing; never delete to re-insert, because live rows carry selections, budgets and indents.

## The staging protocol

**Nothing but `master` may ever touch production.**

| Where you are                 | Deploys from | Reads          | Who sees it                       |
| ----------------------------- | ------------ | -------------- | --------------------------------- |
| `npm run dev`                 | your machine | **staging**    | you                               |
| `feature/<tool>`              | any push     | **staging**    | you, on a preview URL             |
| `staging.goodearthkannur.org` | `staging`    | **staging**    | the founder, for days of real use |
| `toolbox.goodearthkannur.org` | `master`     | **production** | seventy people doing their jobs   |

### Building anything

1. Branch `feature/<tool>` off `staging`. Push early — the preview URL is free and reads staging.
2. **If it needs a migration**, apply it to staging first, then `npm run db:types:staging`, committed with it.
3. Build. **Open the page** on the preview (BUGCATCHER #2).
4. Merge to `staging` through a pull request (CI's `db:check` is the gate). Leave it on `staging.goodearthkannur.org` for the founder. **This is a hard gate:** a ship instruction covers only what the founder had seen when they gave it (BUGCATCHER #14) — anything since waits for one sentence from them.
5. **Then** apply the migration to production and run `npm run db:types`.
6. `npm run db:compare -- --project pajfrgnkapicdgangjey --against ipstebqawrvhkyntctrv` — must be empty.
7. Merge `staging` → `master` through a pull request (its `db:check` stays red until production has the migration), then **confirm a Production deployment exists for that exact commit in Vercel's own Deployments list** — the newest Production row must be `git rev-parse --short origin/master`. A merge is not a deployment (BUGCATCHER #12). Never repair a missing one by promoting a preview (it carries staging's Supabase URL); push a fresh commit to `master`. Then press one real write button on production.

A small fix to a live tool may go straight to `master`. **Commit each working piece and push it.**

### Keeping `master` and `staging` level

Both are permanent — never deleted, force-pushed or reset. Feature branches are deleted once merged. **Anything that lands on `master`, merge straight back into `staging`:**

```
git checkout staging && git merge master --ff-only && git push
```

`git log --oneline origin/staging..origin/master` should print nothing; if it does, that backlog comes first.

### The rules that make it hold

- **`--project` is required everywhere and never defaults** — not to production, not to `.env.local`.
- **Staging is a snapshot, not a mirror.** The right place to prove a screen works, the wrong place to prove a number is correct.
- **Staging cannot email anyone** — every address but the founder's and the probe's is `@staging.invalid`. Reproduce a colleague's problem with the probe account and a grant.
- **Production has no backups** (free tier). Treat every production migration as unrepeatable.
- **`staging.goodearthkannur.org` follows `staging` only**; a feature branch gets Vercel's generated address. A feature is not on the staging URL until merged into `staging`.

### Pausing

The free tier pauses a project after **7 days without a request**. A paused project answers the management API with `status: INACTIVE`, its database host stops resolving, and the login page still renders — "the site is up" proves nothing. **Before any production step**, read `GET /v1/projects/pajfrgnkapicdgangjey` and expect `ACTIVE_HEALTHY`; if not, restore it from the Supabase dashboard (about four minutes).

A weekly Vercel cron (`vercel.json`, Mondays 09:00 IST) calls `/api/keep-alive` on production, which reads one row through the admin client. It needs `CRON_SECRET` in Vercel's Production environment — unset, the route answers 503 and the cron log goes red. **Production was found paused again on 2026-09-25 anyway**, so the cron is not yet trusted (`TODO.md`). Crons run only on production.
