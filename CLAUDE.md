# goodearth-toolbox — the rulebook

Internal tools for Goodearth, a design-led real estate company in Kerala (~70 staff, sized for ~200). One self-hosted **Next.js 16 + React 19 + Tailwind 4 + Supabase** app replacing spreadsheet/AppSheet workflows: many tools, one per business function, one shared database. **Simple beats clever at this scale** — no over-engineering, no new libraries without proven need.

**This Next.js is not the one you know.** v16 has breaking changes to APIs and file structure. Read `node_modules/next/dist/docs/` first. Note `proxy.ts`, not `middleware.ts`.

## The reading flow

Every conversation starts the same way: the founder says **"read CLAUDE.md"**, and this file hands you the rest — they should never have to name another document. This file is deliberately light: it carries every rule's one-line form and points at the file that carries the mechanics. Reading the pointed-at file before touching its territory is not optional.

1. **This file** — the rules in short form, and the flow you are now in.
2. **`MODELS.md`** — which model does what. Know which model you are and stay in its lane.
3. **`STATUS.md`** — what exists and works, including the cross-tool read contract table. The table IS the contract: a column in it can't be renamed or dropped without checking every tool in its row.
4. **`TODO.md`** — what is next, and nothing else. Finished work moves to `STATUS.md`, settled trade-offs to the owning tool's `PLAN.md`.
5. **Before touching a tool** — that tool's `PLAN.md`. **Before styling** — `DESIGN.md`.
6. **Before touching auth, permissions, RLS, a view, money, the line chain, or any cross-tool read/write** — `SECURITY.md`.
7. **Before a migration, a merge, a deploy, or anything environmental** — `SHIPPING.md`: the two databases, the staging protocol, the gates.
8. **Before merging** anything touching a database read, a file upload, a permission or a colour — `BUGCATCHER.md`, what a green build does not prove. When something breaks that CI said was fine, add it there.
9. **`plan.md`** at the repo root is the currently approved build plan, when one is running.

**"Do an audit" means: re-derive the findings from the code, the migrations and the live databases — not read a list.** There is deliberately no standing findings file. Green-build blind spots go to `BUGCATCHER.md`, work still to do goes to `TODO.md`, settled trade-offs go to the owning tool's `PLAN.md` — three places, each already read for other reasons.

## The one principle

**It's a toolbox.** Each tool is a self-contained instrument. Adding one touches only its own folders plus a registry entry; breaking one must not take the others down. Tools connect through exactly three threads: the shell (auth, `lib/tools.ts`, per-user grants), the shared database (including the line chain), and shared UI/utilities (`components/ui/*`, `components/masters/*`, `lib/masters/`, `lib/hooks/`, `lib/format.ts`, `lib/pdf/`, `lib/charts/`, `lib/design-views/`, `lib/drawings/`).

**One tool never imports another tool's code, and shared code never imports a tool's.** When two tools want the same read, the answer is a shared module, not an import. `lib/overview/` is the shell's home, not a tool — the **one** module allowed to import other tools' queries (reads only, each call wrapped so one tool's failure can't take down the home page).

## Structure

- A tool = `app/(dashboard)/<tool>/` (screens) + `lib/<tool>/` (`queries.ts` reads, `actions.ts` writes). `lib/masters/` uses `<entity>.ts` / `<entity>-actions.ts` pairs instead — sanctioned drift across nine entities.
- Every Operations and Management tool **opens on a welcome screen** (`_components/tool-welcome.tsx`): plain English, live counts, never rupees. The real first screen sits one click in, so actions must `revalidatePath("/<tool>", "layout")` — an exact-path call refreshes only the welcome and leaves the moved list stale.
- Kiosk tools with their own auth live top-level. `app/marathon/` is the only one and **not the pattern to copy**.
- New tool → register in `lib/tools.ts`, add its row to STATUS.md's contract table, and extend **both** `user_apps_app_known` and `role_apps_app_known` CHECKs in the same migration, or granting fails at the database. A stub ships by flipping `built: true` and replacing its `page.tsx`.

## Red lines — one-line form; `SECURITY.md` and `SHIPPING.md` carry the why

- **The app grant IS the permission boundary**: every query and action calls `requireTool("<href>")` first. Sidebar visibility is cosmetic.
- **All database access is server-side** — no browser Supabase client exists; do not add one. Tools use the RLS-scoped client, never the admin client.
- **RLS on for every table, always.** Every new view ships with its write revokes and every new function with its execute revokes, in the same migration — named roles, not `public`.
- **Never add a money column to a fact view. Never add a second SELECT policy to a gated table** — widen the existing qual.
- **Redefining `has_app()` or `is_admin()` must carry `session_is_verified()` forward.**
- Every unauthenticated route goes in `PUBLIC_PATHS` as an **exact string**.
- Actions return `ActionState`, never throw. **Never `export type` from a `"use server"` file.**
- **Always check `error`, not just `data`.** Completeness goes through `fetchAll`. An embed through a table with two FKs to the same target names the key. **A green build proves nothing about a `select` string — open the page.**
- In the line chain, **deletion is refused, not cascaded**; anchor on stable ids or the composite FK, never a bare `line_key`.
- **Never seed a real default credential** — a seed is a fixture in development and a credential in production.
- Migrations are **additive only**, never edited once applied, never applied by hand: `npm run db:apply -- --project <ref> --commit`, and **`--project` is required everywhere, never defaulting**. Staging first, then production, then merge.
- **Nothing but `master` touches production, and nothing reaches production until the founder has vetted it on staging.goodearthkannur.org.** A ship instruction covers only what the founder had seen when they gave it.

## UI

Every screen from `components/ui/*` (+ `components/masters/*`) — no one-off styles, no raw colour classes. Formatting through `lib/format.ts`. Every route gets a `loading.tsx` with the shared `Spinner`. Charts are `recharts`, imported ONLY by `components/ui/chart/*` wrappers; `lib/charts/series.ts` stays types-only. Site engineers and store-keepers use this on phones at site — Indents, Inventory and site-facing flows must genuinely work on a phone. Plain English in all copy and error messages; English-only UI is confirmed sufficient. Using the catalogue picker? Add the grant to the allow-list in `app/api/catalogue/route.ts` or it silently 403s. Read `DESIGN.md` before styling.

## Tests, CI and git

Pure logic only (`npm test`) — no database, no browser. CI runs **prettier, lint, typecheck and test — all four report even when one fails — then build → check:actions only once they pass**; confirm with `gh run list` — a successful push is not a green build, and a green build is not a working feature (`BUGCATCHER.md`). Uploads to Supabase Storage take a `Blob`, never a raw `Buffer`. Smoke-test as the probe (single-grant) account before merging — an admin passes every check and never sees grant bugs; after any deploy changing server actions or policies, press one real write button on production. **Commit each working piece and push it; never leave work uncommitted.** Branch flow (`feature/<tool>` → `staging` → `master`), migration gates and deploy verification live in `SHIPPING.md`.

## Working with the founder

They direct the product, are not a developer, and judge the running app rather than the code. Every session, unprompted: **before** a task, 3–5 plain-language bullets on what and why (wait for a go-ahead if it touches more than a couple of files); **after**, a 2-sentence plain summary plus an "open this page, try this" browser checklist. Small steps, one at a time, a plain-English commit message each. If something breaks: one plain sentence on the cause, then offer a rollback before patching chaos on chaos. Handle the unhappy paths. Build fully what was approved; ask before adding what wasn't. **The founder vets on staging before production, every time** — when they say "merge to master" in the same message as a new request, the new work still stops at staging for their eyes; the instruction covers what they had already seen, never what it prompted.
