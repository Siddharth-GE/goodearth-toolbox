# goodearth-toolbox — the rulebook

Internal tools for Goodearth, a design-led real estate company in Kerala (~70 staff, sized for ~200). One self-hosted **Next.js 16 + React 19 + Tailwind 4 + Supabase** app replacing spreadsheet/AppSheet workflows: many tools, one per business function, one shared database. **Simple beats clever at this scale** — no over-engineering, no new libraries without proven need.

**This Next.js is not the one you know.** v16 has breaking changes to APIs and file structure. Read `node_modules/next/dist/docs/` first. Note `proxy.ts`, not `middleware.ts`.

`STATUS.md` = what exists, including the cross-tool read contract. `TODO.md` = what's next. `AUDIT.md` = open findings. `BUGCATCHER.md` = **what a green build does not prove** — read it before merging anything touching a database read, a file upload, a permission or a colour. `DESIGN.md` before styling. A tool's own `PLAN.md` before touching that tool. **"Do an audit" means: read `AUDIT.md`, re-verify its open findings, then rewrite it** — it is the standing record, not a one-off.

## The one principle

**It's a toolbox.** Each tool is a self-contained instrument. Adding one touches only its own folders plus a registry entry; breaking one must not take the others down. Tools connect through exactly three threads:

1. **The shell** — auth, `lib/tools.ts`, per-user grants.
2. **The shared database** — including the line chain.
3. **Shared UI/utilities** — `components/ui/*`, `components/masters/*`, `lib/masters/`, `lib/hooks/`, `lib/format.ts`, `lib/pdf/`, `lib/charts/`, `lib/design-views/`.

**One tool never imports another tool's code, and shared code never imports a tool's.** _(True with no exceptions since 2026-08-17. The two that stood for months are worth knowing as shapes: Budgets imported `lib/selections/views` for the quote photos — the reads became shared `lib/design-views/`; and `lib/charts/series.ts` imported Reporter, so the whole chart design system inherited a dependency on one tool — the shaping moved into `lib/reporter/chart-model.ts` and the shared file kept only types. AUDIT.md MOD-01, MOD-02. When two tools want the same read, the answer is a shared module, not an import.)_

## Structure

- A tool = `app/(dashboard)/<tool>/` (screens) + `lib/<tool>/` (`queries.ts` reads, `actions.ts` writes). `lib/masters/` uses `<entity>.ts` / `<entity>-actions.ts` pairs instead — sanctioned drift across nine entities.
- Every Operations and Management tool **opens on a welcome screen** (`_components/tool-welcome.tsx`): plain English, live counts, never rupees. The real first screen sits one click in, so actions must `revalidatePath("/<tool>", "layout")` — an exact-path call refreshes only the welcome and leaves the moved list stale.
- Kiosk tools with their own auth live top-level. `app/marathon/` is the only one and **not the pattern to copy**.
- `lib/overview/` is the shell's home, not a tool — the **one** module allowed to import other tools' queries (reads only, each call wrapped so one tool's failure can't take down the home page).
- New tool → register in `lib/tools.ts` and add its row to STATUS.md's contract table. A stub ships by flipping `built: true` and replacing its `page.tsx`.

## Security

- **The app grant IS the permission boundary.** Every query and action calls `requireTool("<href>")` (`lib/auth/access.ts`) **first**. Sidebar visibility is cosmetic. Admins get everything.
- Grants are per-user (`user_apps`) + role bundles (`role_apps`), unioned per request, enforced in the database by `has_app()`.
- **Signing in is password → emailed 6-digit code** (30-day trusted device skips the code, never the password), or Google for an email that already has an account — public signups are disabled at the project. The enforcing half is `auth_verified_sessions` (`0062`): from `0063` on, `has_app()` and `is_admin()` answer **false for any session without its row**, so a session minted straight from the auth API with a stolen password reaches nothing gated. Two rules fall out: **redefining `has_app()` or `is_admin()` must carry `session_is_verified()` forward** (dropping it silently reopens the API bypass), and only the server ever writes `auth_verified_sessions` — a self-service marking function would let the session being screened pass itself.
- **Every unauthenticated route goes in `PUBLIC_PATHS`** (`lib/supabase/proxy.ts`) as an **exact string** — a missing entry 302s to /login before the route can run, an invisible loop; a prefix match would make /login-adjacent routes silently public.
- **All database access is server-side.** No browser Supabase client exists — do not add one.
- Tools use the RLS-scoped client (`lib/supabase/server.ts`), never the admin client. Sanctioned exceptions, all in the shell, none in a tool: `inviteUser` (auth-admin API), the sign-in flow's `lib/auth/rate-limit.ts` and `markSessionVerified` (both write deny-all tables no signed-in role may touch), and the OAuth callback's delete of a signup-leak account. Marathon uses service-role throughout — it has no Supabase Auth session at all.
- **RLS on for every table, always.** A new table without policies is a bug.
- **A view is a READ surface.** Views are owned by `postgres` and bypass RLS, so a writable view is an RLS bypass with a `DELETE` on the end. Supabase's default privileges grant writes on every new relation, and `revoke … from public` does **not** remove `anon` or `authenticated` — name them. Every new view ships with `revoke insert, update, delete, truncate … from anon, authenticated`, and every new function with `revoke execute … from public, anon`, in the same migration. (AUDIT.md SEC-01/SEC-03 is what happens when it doesn't.)
- Every `security definer` function checks `has_app(...)` or `is_admin()` in its own body — that check is its entire permission boundary. A function no client role may execute (revoked from `anon` **and** `authenticated`, reached only by a definer trigger) is boundaried by its grant instead; `create_client_engagement` and `seed_default_project_stages` are the two, and `0071` gave the first one both. **`security definer` changes the ROLE, not `auth.uid()`** — so a bare `has_app` check inside a function reached from a cross-tool trigger refuses the very person the trigger exists for. `pg_trigger_depth() = 0` is how `0071` tells a direct call from a trigger. BUGCATCHER #11.
- Actions return `ActionState` (`lib/action-state.ts`), never throw. Queries may throw — a failed read has no partial answer worth showing.
- **Never seed a real default credential** (AUDIT.md SEC-05).

## The line chain

Design flows to payment through the database, never through shared code. The two files deciding what carries forward (`lib/budgets/carry-forward.ts`, `lib/indents/pull-rules.ts`) are pure functions importing nothing.

| Hop                | Anchor                                             |
| ------------------ | -------------------------------------------------- |
| selection → budget | composite FK `(selection_id, line_key)`            |
| budget → indent    | composite FK `(budget_id, line_key)`               |
| indent → PO        | FK `purchase_order_lines.indent_line_id`, not null |
| PO → receipt       | FK `goods_receipt_lines.po_line_id`, not null      |
| PO → bill          | FK `bills.po_id`, header level only                |

- **Anchor on stable ids or the composite FK — never a bare `line_key`.**
- **Deletion is refused, not cascaded.** Issued revisions are immutable (`selection_lines_draft_only`) and the FKs are RESTRICT, so a linked design line can't be deleted at all. Drift is _flagged_ instead: `classifyDesignDrift` marks changed/removed lines, `getDownstreamImpact` shows which indents and POs already exist before a designer touches a line.

## Money stays confined

Indents and Inventory carry no money. PO money is RLS-gated to `/purchase-orders`; consumers read the money-free views (`po_facts`, `po_line_facts`, `approved_budgets(_lines)`, `bill_facts`, `po_billing_totals`).

Two named exceptions, by founder decision. **`/reporter`** reads PO, bill, budget and margin money (`0055`), by _widening each table's one SELECT qual_ to `has_app('/x') or has_app('/reporter')`. **`/financial-management`** reads client money, bill money and plan targets (`0058`), entirely through owner views with a **three-way** WHERE, plus one new view `bill_money_facts`. Both grants carry an amber `grantWarning` in `lib/tools.ts`; don't remove it. `budget_report_lines` is the one `security_invoker` view — it must _inherit_ RLS, because it carries rupees. `crm_milestone_facts`/`crm_receipt_facts` are owner views whose `WHERE` and column list are the gate, because the CRM's stronger secret is prose (`details`, notes, bottlenecks), which they omit.

- **Never add a money column to a fact view.** Their `WHERE` and column list _are_ the boundary, so a careless column crosses it silently.
- **Never add a second SELECT policy to a gated table** — permissive policies OR together and the second one is invisible. Widen the existing qual.
- **Redefining `crm_milestone_facts`, `crm_receipt_facts` or `business_plan_target_facts` must carry the three-way WHERE forward** — re-running `0056`/`0057` as-is silently strips Financial Management's access. `0055` asserts seven widened policies and no doubles; `0058` asserts four views admit FM. Keep both true.

## Cross-tool reads and writes

**STATUS.md carries the contract table — which tool reads what from outside itself. It IS the contract: a column in it can't be renamed or dropped without checking every tool in its row. Keep it current.**

Everything in it is a `SELECT`: **no tool's code writes another tool's table.** Four documented exceptions — `indent_approvers`/`bill_approvers` are Settings-owned despite living in Indents'/Bills' migrations; the `projects_seed_schedule` trigger (`0045`) lets creating a project in Masters seed Relay's schedule, declared by _Relay's_ migration so the coupling points the right way; Client Relations writes Masters (`0050`, `0051`) through two column-narrow definer functions plus the `units_seed_engagement` trigger; and Directory's `profiles_seed_staff_details` trigger (`0060`) gives every new account a blank card, firing inside Settings' `inviteUser` — plus `updateMyName`, which writes `profiles.full_name` for the signed-in person's own row only. **A cross-tool trigger or definer function not listed there is what nobody finds until it misfires.**

`pusher_chain_state` has been redefined six times (`0042`'s warning, most recently `0064`) and has two consumers outside Relay: **a seventh definition must check Client Relations and Reporter**, must carry the `entry` lateral's clock-anchor exclusions forward, and must re-issue the revokes — `drop view` restores default write grants every time.

## Reads

- PostgREST silently caps selects at 1,000 rows. Anything needing completeness goes through `fetchAll` (`lib/supabase/fetch-all.ts`), which **throws** if a page fails. Lists state a limit and show "N of M" from a real count, never `rows.length`.
- **Always check `error`, not just `data`.** An empty result and a failed read mean opposite things; conflating them has silently destroyed priced budget lines, cleared design-drift warnings, and re-opened the double-buy bug.
- **An embed through a table with two FKs to the same target must name the key** — `plots!units_plot_id_fkey`, because `units` has had two paths to `plots` since `0029`. A bare embed answers HTTP 300 (`PGRST201`) at runtime, and **no local gate catches a bad `select` string**: not a type error, `next build` compiles it, the tests have no database. Client Relations shipped four dead screens through a fully green CI this way. **Open the page, or run the query.**

## Database

**There are two, and confusing them is the expensive mistake:**

|                             | ref                    | what it is                                                                                                |
| --------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `goodearth-toolbox`         | `pajfrgnkapicdgangjey` | **Production.** Real work, real staff, real client money.                                                 |
| `goodearth-toolbox-staging` | `ipstebqawrvhkyntctrv` | **Staging.** Everything the toolbox was built with. Local `npm run dev` and every preview URL point here. |

Numbered SQL files in `supabase/migrations/`, applied **from this machine** via the management API's `/database/query` endpoint (`SUPABASE_ACCESS_TOKEN` in `.env.local`, account-level so it reaches both) — not by hand in Studio. The same endpoint reads either database when you need to check what is actually there. No CLI, no local Postgres, no rollback tooling. Use Node for the request; PowerShell's `Invoke-RestMethod` mangles large JSON bodies.

- **Never apply a migration by hand.** `npm run db:apply -- --project <ref> --commit` applies what is pending and records it in `applied_migrations` (`0067`), so a re-run is a no-op and the two databases cannot drift unnoticed. **`--project` is required and never defaults** — no script here guesses which database it is pointed at.
- **You cannot forget to apply one: CI asks.** `npm run db:check -- --project <ref>` exits non-zero if that database is missing a migration in the current branch, or if an applied file has been edited, and it runs on **every pull request** against the database the base branch deploys to — production for a PR into `master`, staging for a PR into `staging`. So "apply the migration, then merge" is a gate rather than a memory. Read-only, and deliberately incapable of applying anything: a check that fixed what it found would be pushing an unreviewed migration to a database with no backups.
- **Staging first, then production, then merge.** Apply to staging → `npm run db:types:staging` → build and test → apply to production → merge. The old rule (_apply the migration first, then merge the code needing it_) is unchanged, just doubled.
- **`npm run db:compare -- --project <a> --against <b>` must come back empty** whenever the two are supposed to be level. It compares columns, RLS, policies, grants, functions, views, triggers, indexes, constraints and storage. It is not ceremony: on its first run it found two objects that existed on the original database and in **no migration** — the `ensure_rls` event trigger (`0068`) and the `catalogue` storage bucket (`0069`). Neither would have failed anything; the fresh database would simply have stopped enforcing "RLS on for every table" and lost every thumbnail upload.
- **A seed is a fixture in development and a credential in production.** Replaying the migrations recreated `0002`'s "Test Agent" — PIN, hash and salt all in this public repo — on the database holding the real work (`0070` removes it). Before adding a seed row, ask what it becomes on a database that is replayed.
- **Additive only** — never rename or drop something in use.
- **Never edit an applied migration**; a correction is a new, later file (`0014` fixing `0013`). The ledger stores a checksum, so an edited file is now detected rather than invisible.
- **Write every one to be run twice** (`if not exists`, `drop … if exists`, `create or replace`) and end it asserting what it claimed to do.
- After applying: `npm run db:types` (production) or `npm run db:types:staging`, and commit the types with the migration.
- New tool → extend **both** `user_apps_app_known` and `role_apps_app_known` CHECKs in the same migration, or granting fails at the database.
- Making an admin has a UI — the toggle in Settings (`setAdmin`, guarded by `profiles_guard()`, which refuses to remove the last active admin). The raw `update profiles set role = 'admin'` is the fallback for when nobody can get in at all.

## UI

- Every screen from `components/ui/*` (+ `components/masters/*`) — no one-off styles, no raw colour classes. Formatting through `lib/format.ts`. Every route gets a `loading.tsx` with the shared `Spinner`. Read `DESIGN.md` (Warm Minimalism) before styling.
- **Charts are `recharts`**, imported ONLY by `components/ui/chart/*` — screens use those wrappers, never Recharts directly, so Next code-splits it to the routes that chart. The chart shapes themselves live in `lib/charts/series.ts` — **types only**, so shared code stays free of any tool — and building one from a tool's data is that tool's job (`lib/reporter/chart-model.ts`, pure and tested). `lib/charts/palette.ts` is the shared colour arithmetic. The PDF path rasterises the same charts through `sharp`, never a second implementation. Chart colours are the `--chart-1…8` tokens; `DESIGN.md` says why their order must not be touched.
- **Site engineers and store-keepers use this on phones at site** — Indents, Inventory and site-facing flows must genuinely work on a phone. English-only UI is confirmed sufficient. Plain English in all copy and error messages.
- Using the catalogue picker? Add the grant to the allow-list in `app/api/catalogue/route.ts` or it silently 403s.

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
2. **If it needs a migration**, apply it to staging **first**: `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`, then `npm run db:types:staging`, and commit the types with the migration. The code that needs a column must never reach a database without it.
3. Build. Test on the preview. **Open the page** — a green build proves nothing about a `select` string (`BUGCATCHER.md`).
4. Merge to `staging`. Leave it on `staging.goodearthkannur.org` for a few days of real use — that is what the environment is _for_, and rushing past it wastes the whole arrangement.
5. **Then** apply the same migration to production: `npm run db:apply -- --project pajfrgnkapicdgangjey --commit`, and `npm run db:types`.
6. `npm run db:compare -- --project pajfrgnkapicdgangjey --against ipstebqawrvhkyntctrv` — **must be empty.** It checks the schema _and_ all 237 auth settings.
7. Merge `staging` → `master` only after browser testing and sign-off. Press one real write button on production afterwards.

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
- **Anything the platform holds outside the database is configuration too** — auth settings, email templates, redirect lists. `db:compare` covers them because BUGCATCHER #10 is what happened when it didn't: the 2FA code silently became a magic link.
- **`applied_migrations` (`0067`) is the source of truth for what a database has had**, and since 2026-08-17 CI reads it on every pull request (`npm run db:check`). Never apply SQL by hand; the ledger stops being true the moment you do, and the gate goes with it.
- **CI holds one secret**, `SUPABASE_ACCESS_TOKEN`, for that check alone. It is account-level and reaches both databases — accepted because the rule it enforces could not be enforced any other way. Rotating it means rotating it in GitHub too, or every pull request goes red.
- **`staging.goodearthkannur.org` follows the `staging` branch and nothing else.** A `feature/…` branch gets Vercel's generated address instead (`goodearth-toolbox-git-<branch>-….vercel.app`). Both read the staging database and both show the practice banner; only the fixed address is worth giving to other people. **A new feature is not visible on the staging URL until it is merged into `staging`.**
- **Supabase's redirect allow-list is the gate for every sign-in return** (BUGCATCHER #7), so it must cover the generated preview addresses: `https://goodearth-toolbox-*.vercel.app/**`. Two asterisks — one `/` matches only the home page — and the wildcard goes _after_ the project name, because that is where Vercel puts the branch.

## Tests, CI and git

- Pure logic only (`npm test`) — no database, no browser; extract pure modules to test them. CI is the gate; no hooks. It runs **prettier → lint → typecheck → test → build → check:actions, stopping at the first failure**, so a trivial lint error silently skips every check that matters. Confirm with `gh run list` — a successful push is not a green build.
- **Never `export type` from a `"use server"` file** — it caused a production outage; `npm run check:actions` enforces it.
- **Smoke-test as a real single-grant user** (the probe account) before merging; an admin passes every check and never sees grant bugs. After any deploy changing server actions or policies, press one real write-button on production.
- **A green build is not a working feature.** Six bugs have now passed all six CI steps — a dead screen, a corrupted upload, a live privilege hole. `BUGCATCHER.md` is the catalogue and the pre-merge checklist it earned; **when something breaks that CI said was fine, add it there.** Uploading to Supabase Storage is the newest: hand it a `Blob`, never a raw `Buffer`, or Next's patched fetch text-decodes the binary and stores rubbish that reports success.
- **`feature/<tool>` → `staging` → `master`** — the full protocol, including where each migration goes, is its own section above.

## Working with the founder

They direct the product, are not a developer, and judge the running app rather than the code. Every session, unprompted: **before** a task, 3–5 plain-language bullets on what and why (wait for a go-ahead if it touches more than a couple of files); **after**, a 2-sentence plain summary plus an "open this page, try this" browser checklist. Small steps, one at a time, a plain-English commit message each. If something breaks: one plain sentence on the cause, then offer a rollback before patching chaos on chaos. Handle the unhappy paths. Build fully what was approved; ask before adding what wasn't.
