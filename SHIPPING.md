# SHIPPING.md — databases, migrations, environments and deploys

The two databases, how migrations move, and how code reaches production. CLAUDE.md carries the one-line rules; this is the full protocol. Read it before a migration, a merge, a deploy, or anything environmental.

## The two databases

**There are two, and confusing them is the expensive mistake:**

|                             | ref                    | what it is                                                                                                |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `goodearth-toolbox`         | `pajfrgnkapicdgangjey` | **Production.** Real work, real staff, real client money.                                                 |
| `goodearth-toolbox-staging` | `ipstebqawrvhkyntctrv` | **Staging.** Everything the toolbox was built with. Local `npm run dev` and every preview URL point here. |

Numbered SQL files in `supabase/migrations/`, applied **from this machine** via the management API's `/database/query` endpoint (`SUPABASE_ACCESS_TOKEN` in `.env.local`, account-level so it reaches both) — not by hand in Studio. The same endpoint reads either database when you need to check what is actually there. No CLI, no local Postgres, no rollback tooling. Use Node for the request; PowerShell's `Invoke-RestMethod` mangles large JSON bodies.

## Migrations

- **Never apply a migration by hand.** `npm run db:apply -- --project <ref> --commit` applies what is pending and records it in `applied_migrations` (`0067`), so a re-run is a no-op and the two databases cannot drift unnoticed. **`--project` is required and never defaults** — no script here guesses which database it is pointed at.
- **You cannot forget to apply one: CI asks.** `npm run db:check -- --project <ref>` exits non-zero if that database is missing a migration in the current branch, or if an applied file has been edited, and it runs on **every pull request** against the database the base branch deploys to — production for a PR into `master`, staging for a PR into `staging`. So "apply the migration, then merge" is a gate rather than a memory. Read-only, and deliberately incapable of applying anything.
- **Staging first, then production, then merge.** Apply to staging → `npm run db:types:staging` → build and test → apply to production → merge. The code that needs a column must never reach a database without it.
- **`npm run db:compare -- --project <a> --against <b>` must come back empty** whenever the two are supposed to be level. It compares columns, RLS, policies, grants, functions, views, triggers, indexes, constraints and storage. It is not ceremony: on its first run it found two objects that existed on the original database and in **no migration** — the `ensure_rls` event trigger (`0068`) and the `catalogue` storage bucket (`0069`).
- **A seed is a fixture in development and a credential in production.** Replaying the migrations recreated `0002`'s "Test Agent" — PIN, hash and salt all in this public repo — on the database holding the real work (`0070` removes it). Before adding a seed row, ask what it becomes on a database that is replayed.
- **Additive only** — never rename or drop something in use.
- **Never edit an applied migration**; a correction is a new, later file (`0014` fixing `0013`). The ledger stores a checksum, so an edited file is detected rather than invisible.
- **Write every one to be run twice** (`if not exists`, `drop … if exists`, `create or replace`) and end it asserting what it claimed to do.
- After applying: `npm run db:types` (production) or `npm run db:types:staging`, and commit the types with the migration.
- Making an admin has a UI — the toggle in Settings (`setAdmin`, guarded by `profiles_guard()`, which refuses to remove the last active admin). The raw `update profiles set role = 'admin'` is the fallback for when nobody can get in at all.

## Environment

`.env.local` locally, Vercel settings in production. The two `NEXT_PUBLIC_SUPABASE_*` vars are public — the anon key is safe _because_ RLS is on everywhere; not a secret, but not a permission either. `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely** (server-only: Marathon + import scripts + the sign-in flow's sanctioned writes). `SUPABASE_ACCESS_TOKEN` is the management API key — local only, never in app code. `MARATHON_SESSION_SECRET` signs the kiosk PIN cookie; changing it signs everyone out of the kiosk. `AUTH_COOKIE_SECRET` signs the sign-in flow's challenge/verified/trusted-device cookies (separate from Marathon's on purpose — rotating one must not touch the other; rotating it re-asks everyone for a code). `SITE_URL` is the app's absolute URL — reset links and the Google callback are built from it.

Data-load scripts in `scripts/` are **dry run by default, `--commit` to write**. Match on a natural key and update in place so a re-run is a no-op; never delete to re-insert, because live rows carry selections, budgets and indents.

## The staging protocol

Two databases and three places code runs. **Nothing but `master` may ever touch production.**

| Where you are                 | Deploys from | Reads          | Who sees it                       |
| ----------------------------- | ------------ | -------------- | --------------------------------- |
| `npm run dev`                 | your machine | **staging**    | you                               |
| `feature/<tool>`              | any push     | **staging**    | you, on a preview URL             |
| `staging.goodearthkannur.org` | `staging`    | **staging**    | the founder, for days of real use |
| `toolbox.goodearthkannur.org` | `master`     | **production** | seventy people doing their jobs   |

**The whole point: three of those four rows cannot damage real work.** Before 2026-08-17 every one of them wrote to the live database.

### Building anything

1. Branch `feature/<tool>` off `staging`. Push early — the preview URL is free and it reads staging.
2. **If it needs a migration**, apply it to staging **first**: `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`, then `npm run db:types:staging`, and commit the types with the migration.
3. Build. Test on the preview. **Open the page** — a green build proves nothing about a `select` string (`BUGCATCHER.md`).
4. Merge to `staging`. Leave it on `staging.goodearthkannur.org` for the founder's real use — that is what the environment is _for_. **This step is a hard gate, not a courtesy** (2026-08-20, BUGCATCHER #14: a mid-soak correction went keyboard-to-production in one session on the strength of an earlier "merge to master"): a ship instruction covers only what the founder had seen when they gave it, so anything built since their last look waits here for their vet — one sentence from them, per feature, before step 5.
5. **Then** apply the same migration to production: `npm run db:apply -- --project pajfrgnkapicdgangjey --commit`, and `npm run db:types`.
6. `npm run db:compare -- --project pajfrgnkapicdgangjey --against ipstebqawrvhkyntctrv` — **must be empty.** It checks the schema _and_ all 237 auth settings.
7. Merge `staging` → `master` only after browser testing and sign-off. Then **confirm a Production deployment exists for that exact commit, in Vercel's own Deployments list** — its newest Production row must be `git rev-parse --short origin/master`. **A merge is not a deployment**, and on 2026-08-17 nine commits sat merged, green and undeployed for hours because the identical SHA had already been built as a staging preview. Don't use GitHub's deployments API for this; it is an incomplete mirror and gave a confidently wrong answer the first time it was tried (`BUGCATCHER.md` #12). Press one real write button on production afterwards.
   - **Never repair that by promoting a preview deployment to production.** Promoting rolls out that exact build, and a preview build has the **staging** Supabase URL and anon key inlined by Next at build time — it would put the production domain in front of the practice database. Push a fresh commit to `master` instead, so the build happens with production environment variables.

**Steps 2 and 5 are the ones with a gate under them.** Open the merge as a pull request and CI runs `db:check` against the database that branch merges towards, so a PR into `master` stays red until production has the migration, and a PR into `staging` stays red until staging does. A merge that skips the PR skips the gate — which is the one good reason to always use one.

Small fixes to live tools may still go straight to `master`. **Commit each working piece and push it; never leave work uncommitted.**

### Two permanent branches, and keeping them level

`master` and `staging` are both **permanent**. Only `feature/…` branches are temporary, and they are deleted once merged. `staging` is never deleted, never force-pushed, never reset — a preview URL, a domain and the team's bookmarks all point at it.

**They must be kept identical whenever nothing is in flight**, and there is exactly one habit that achieves it:

> **Anything that lands on `master`, merge straight back into `staging`.**
>
> ```
> git checkout staging && git merge master --ff-only && git push
> ```

The drift comes from the escape hatch, not the main road. A small fix taken straight to `master` — which is allowed — leaves `staging` behind, and the next `staging` → `master` merge then carries an older base and starts producing conflicts over code nobody touched. Merging back immediately keeps both branches on the same commit, so every merge in either direction stays a fast-forward.

`git log --oneline origin/staging..origin/master` should print nothing. If it prints something, that is the backlog to merge back before starting anything new.

### The rules that make it hold

- **`--project` is required everywhere and never defaults.** Not to production, not to `.env.local`. Twenty characters of typing against the obvious disaster.
- **Staging is a snapshot, not a mirror.** It froze on 2026-08-17 with every practice row still in it, and diverges further every day. It is the right place to prove a screen works and the wrong place to prove a number is correct.
- **Staging cannot email anyone.** Every address there is `@staging.invalid` except the founder's and the probe's. So you cannot sign in as a colleague to reproduce their problem — reproduce it with the probe account and a grant instead.
- **Production has no backups** (free tier). Until that changes, treat every production migration as unrepeatable: run it on staging first, and mean it.
- **Pausing.** The free tier also pauses a project after **7 days without a request** — and between releases nobody uses production, so it happened (idle from 2026-08-22, found paused 2026-09-03, restored 2026-09-05). A paused project answers the management API with `status: INACTIVE`, its database host stops resolving, and the app's login page still renders — so "the site is up" proves nothing. Before any production step, read `GET /v1/projects/pajfrgnkapicdgangjey` and expect `ACTIVE_HEALTHY`; if not, `POST /v1/projects/pajfrgnkapicdgangjey/restore` with the same token, then poll — it took about four minutes and came back with the ledger, every policy and all 237 auth settings intact. Only the Pro plan (also the source of backups) or a weekly keep-alive stops it recurring; both are the founder's decision, neither is done.
- **Anything the platform holds outside the database is configuration too** — auth settings, email templates, redirect lists. `db:compare` covers them because BUGCATCHER #10 is what happened when it didn't: the 2FA code silently became a magic link.
- **`applied_migrations` (`0067`) is the source of truth for what a database has had**, and since 2026-08-17 CI reads it on every pull request (`npm run db:check`). Never apply SQL by hand; the ledger stops being true the moment you do, and the gate goes with it.
- **CI holds one secret**, `SUPABASE_ACCESS_TOKEN`, for that check alone. It is account-level and reaches both databases — accepted because the rule it enforces could not be enforced any other way. Rotating it means rotating it in GitHub too, or every pull request goes red.
- **`staging.goodearthkannur.org` follows the `staging` branch and nothing else.** A `feature/…` branch gets Vercel's generated address instead (`goodearth-toolbox-git-<branch>-….vercel.app`). Both read the staging database and both show the practice banner; only the fixed address is worth giving to other people. **A new feature is not visible on the staging URL until it is merged into `staging`.**
- **Supabase's redirect allow-list is the gate for every sign-in return** (BUGCATCHER #7), so it must cover the generated preview addresses: `https://goodearth-toolbox-*.vercel.app/**`. Two asterisks — one `/` matches only the home page — and the wildcard goes _after_ the project name, because that is where Vercel puts the branch.
