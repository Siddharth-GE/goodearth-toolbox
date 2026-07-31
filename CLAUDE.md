# goodearth-toolbox

Internal tools platform for Goodearth, a design-led real estate company in Kerala, India (~70 staff plus contractors). Replacing spreadsheet- and AppSheet-based workflows with one self-hosted platform: multiple tools, one per business function, used independently by different teams but connected through one shared Supabase (Postgres) database.

**Live on Vercel** (auto-deploys from `master` on every push — see
README.md). Marathon is fully shipped and in production; every other
tool below is a Coming Soon stub, sidebar-ready but not yet built.

## Tools

Built: **Marathon** — event registration app: field agents with simple PIN logins register runners (name, age, gender, mobile, t-shirt size, run type); category auto-assigned from age+gender; bib numbers auto-generated with category prefix; groups (schools/clubs) and agents managed by admin; entries counter on agent home; filtered lists throughout. Agents have basic literacy — UI must be extremely simple. Live at `/marathon` on the production domain, no Toolbox login needed — see `app/marathon/PLAN.md` for status and pending launch-readiness items.

**Overview** (`/`, `app/(dashboard)/page.tsx`) — the shell's home page,
not a `lib/tools.ts` entry (every signed-in user sees it, it's not
team-gated). This already fulfills what the roadmap used to call
"Dashboard" — a read-only overview across all tools — so that's no
longer a separate planned tool. It's a mix of real data (the Marathon
card, reusing `getMarathonHome()`) and clearly-static illustrative
widgets for tools that don't exist yet (pipeline, KPIs, budget bars,
PO table, approvals, people, activity) — swap each widget for a real
query as its tool actually ships, same file, no restructuring needed.

Planned, roughly in build order — **this list will keep growing**; the pattern below for adding a tool matters more than the exact names:

- Indents — site teams request materials, every line tagged to project/plot
- Purchase Orders — created from indent lines, split by vendor, with a well-designed PDF generator (company letterhead quality)
- Inventory / Store — goods receipt against POs, stock by store, issue to manufacturing
- Bills — recording against POs and labour contracts
- Budgets — budget vs actual per project
- Site Tracker — (details TBD as it's scoped)
- Directory, Training — people-side tools
- Projects & Masters, Settings — admin-side tools

Every tool above already has a sidebar entry and a route
(`lib/tools.ts`, grouped Operations/Events/People/Admin) even before
it's built — see "Coming Soon stubs" below.

## Project structure

Two different tool-shell patterns — pick the one that fits, don't
default to copying Marathon:

- **Normal tools** (the vast majority) live *inside* the dashboard
  shell, keeping the sidebar/topbar: `app/(dashboard)/<tool>/`.
- **Kiosk-style tools** — a separate device, its own auth, no sidebar —
  live top-level with their own layout, opting *out* of the dashboard
  shell entirely: `app/<tool>/` (Marathon is the only one so far; its
  `proxy.ts` exemption and separate PIN auth only make sense because
  it's genuinely a standalone kiosk, not the default to reach for).

```
app/
  (auth)/            unauthenticated shell — login
  (dashboard)/        authenticated shell — sidebar + Overview home.
                       Normal tools live here: app/(dashboard)/<tool>/
    _components/       components used only by the Overview page today
  actions/            platform-level server actions (e.g. login/logout).
                       A tool's own actions do NOT go here — see below.
  <tool>/              kiosk-style tools only (see above) — own layout,
                       opts out of the dashboard shell (e.g. app/marathon/)
    _components/       components used only by this tool
    _lib/               route-local helpers only this tool needs (e.g.
                        bilingual copy strings) — NOT the same thing as
                        the top-level lib/ below; see "Two kinds of lib"
    PLAN.md            this tool's own build notes/checklist
components/
  ui/                 shared primitives — Button, Input, Card, Dialog,
                       etc. Every screen in every tool is built from
                       these. Never write one-off styles.
  masters/             (once it exists) shared domain components used
                       across multiple tools — a project picker, a
                       vendor combobox. Not generic enough for ui/, not
                       specific enough to belong to one tool.
  layout/              shell-level components (e.g. the sidebar)
lib/
  <tool>/              each tool's own server data-layer: actions.ts,
                       queries.ts, and anything else tool-specific
                       (Marathon also has session.ts for its kiosk PIN
                       auth). Mirrors app/<tool>/.
  masters/             (once it exists) shared queries/mutations for
                       Projects, Plots, Items, Vendors, Stores — one
                       file per master, used by every tool that needs
                       them. See "Shared masters" below.
  auth/                platform auth helpers (current user, requireUser)
  supabase/            Supabase client setup (admin/server/client/proxy)
  tools.ts             the sidebar registry — every tool adds one entry
                       here to become visible (see checklist below)
supabase/
  migrations/          numbered SQL files, applied in order — see
                       "Database changes" below
```

### Two kinds of "lib"

`app/<tool>/_lib/` and top-level `lib/<tool>/` are both real and both
correct — they're different things that happen to share a word:

- `app/<tool>/_lib/` — the underscore is a Next.js convention meaning
  "not a route." Holds small things private to that tool's UI, like
  Marathon's bilingual copy strings.
- `lib/<tool>/` — the tool's actual server-side data layer: actions,
  queries, session handling. This is where the real logic lives.

### Where server actions live

`app/actions/` is for platform-level concerns only (today: just
login/logout). A tool's own actions — creating an entry, verifying a
PIN, anything tool-specific — belong in `lib/<tool>/actions.ts`,
alongside that tool's `queries.ts`. Don't add tool-specific actions to
`app/actions/`, and don't move `login`/`logout` into a tool folder —
they're genuinely shared across every tool.

## Coming Soon stubs

Every planned tool already has a `lib/tools.ts` entry with
`built: false`, so it shows up in the grouped sidebar and has a real
route today, even before any real work starts — it just renders the
shared `app/(dashboard)/_components/coming-soon.tsx` (a thin wrapper
around `components/ui/empty-state.tsx`) instead of a real screen. Each
stub `page.tsx` looks the same: look up its own entry in `TOOLS` by
`href`, pass its `name`/`description`/icon into `<ComingSoon>`. When a
tool actually gets built, replace that one file's contents (and flip
`built: true` in `lib/tools.ts`) — the route, sidebar entry, and group
are already correct and don't need to change.

## Adding a new tool — checklist

1. Decide the shell: `app/(dashboard)/<tool>/` for a normal tool (the
   default), or top-level `app/<tool>/` with its own `layout.tsx` only
   if it's genuinely kiosk-style like Marathon — see "Two kinds of
   shell" above. If it already exists as a Coming Soon stub, flip
   `built: true` in `lib/tools.ts` and replace that route's `page.tsx`.
2. `lib/<tool>/actions.ts` and `queries.ts` for its data layer. Reuse
   `lib/masters/*` for anything touching Projects/Plots/Items/Vendors/
   Stores — don't re-query or re-implement master data per tool.
3. Build every screen from `components/ui/*` (and `components/masters/*`
   where relevant). Never one-off styles — see DESIGN.md.
4. Add (or update) its entry in `lib/tools.ts` — `group`, `team`,
   `icon`, `built: true` — so it shows up correctly in the sidebar.
5. Start `app/<tool>/PLAN.md` — that tool's own build checklist and
   bookmark, same pattern as `app/marathon/PLAN.md`.
6. Any new tables as a numbered file in `supabase/migrations/` — see
   below. Every transactional table links to a project/plot.
7. If the Overview page (`app/(dashboard)/page.tsx`) has a static
   illustrative widget standing in for this tool, swap it for a real
   query from step 2 — same file and component, not a rebuild.

## Shared masters (Projects, Plots, Items, Vendors, Stores)

These don't exist yet — Marathon never touches them — but Indents (the
next tool) will need them immediately, and every tool after that will
too. Convention, decided now so two tools don't each invent a different
answer:

- Schema: a new numbered migration (e.g. `0003_masters.sql`) written
  when the first tool that needs it actually starts — not speculatively
  ahead of time.
- Queries/mutations: `lib/masters/{projects,plots,items,vendors,stores}.ts`,
  one file per master — the same shape as `lib/tools.ts`, which is
  already the right model for "one small shared file, not per-tool
  duplication."
- Shared UI (a project picker, a vendor combobox): `components/masters/`,
  sibling to `components/ui/`.

## Database changes

All schema changes are numbered SQL files in `supabase/migrations/` —
never ad hoc. Apply a migration by running its SQL against the project
via the Supabase Studio SQL editor, in numbered order (there's no CLI/
local-Postgres setup for this today — see README.md).

## Git workflow

- `master` is production — always deployable, auto-deploys to Vercel on
  every push. No direct feature work on `master`.
- Any tool or sizeable change gets its own `feature/<tool>` branch (e.g.
  `feature/settings-access-model`). Small fixes to an already-live tool
  can go straight to `master`.
- Every push to a `feature/*` branch gets its own Vercel preview URL —
  that's the staging link shared at each review gate, so testing never
  touches production.
- Merge to `master` only after a milestone has been tested in the
  browser and approved — never mid-feature. Pushing a feature branch
  (to get a preview link) is fine at any point; it's merging into
  `master` that waits for sign-off.
- Delete the branch once it's merged.

## Other architecture principles

- Role-based access: users see only their team's tools in the sidebar
  (`lib/tools.ts` + `lib/auth/dal.ts`)
- Keep it simple: no over-engineering, this serves ~200 users max. No
  CI, no test framework, no Prettier/husky setup today — conscious
  tradeoffs for this scale, not oversights. Worth revisiting once a
  tool (Purchase Orders, Budgets) brings real calculation logic worth
  unit-testing.

## Documentation map

This file is the entry point. **DESIGN.md** covers the shared visual
system — colors, type, spacing, components; read it before styling
anything. Each tool keeps its own build plan/checklist colocated with
its code at `app/<tool>/PLAN.md` (e.g. `app/marathon/PLAN.md`) — check
the relevant one before starting or resuming work on that tool.

@AGENTS.md
@DESIGN.md

## Working with me (IMPORTANT — read every session)

I am the founder, not a developer. I direct the product; you handle the code.
Follow these rules in every session without being reminded:

### Communication
- Before starting any task: explain WHAT you will do and WHY in plain,
  non-technical language, in 3–5 short bullet points. Wait for my go-ahead
  if the task touches more than a couple of files.
- After finishing: summarize what changed in 2 sentences max, in plain
  language, and tell me exactly how to see/test it in the browser.
- When something breaks: explain the cause in one plain sentence before
  fixing it. No jargon walls.
- If I ask "explain X", teach me like a smart non-programmer.

### Process discipline
- Work in small steps. One feature or fix at a time — never a big-bang
  change across the whole app.
- After every working piece: commit with a clear plain-English message
  (e.g. "add marathon registration form"). Never leave work uncommitted
  at the end of a task.
- If a change goes wrong, tell me immediately and offer to roll back to
  the last commit rather than patching chaos on top of chaos.
- All database changes as numbered SQL files in supabase/migrations.
  Never modify tables ad hoc.

### Code standards
- Simplicity over cleverness. This app serves ~200 users; no
  over-engineering, no extra libraries unless truly needed.
- Every screen is built from the shared components in components/ui.
  Never write one-off styles.
- Handle the unhappy paths: wrong inputs, empty states, deleted
  references, double submissions.

### My review checkpoints
- I judge the running app in the browser, not the code. Always give me
  a clear "open this page, try this action" checklist after each task.
- Anything I approve in the plan stage, build fully. Anything not in
  the plan, ask before adding.
