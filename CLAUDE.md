# goodearth-toolbox

Internal tools platform for Goodearth, a design-led real estate company in Kerala, India (~70 staff plus contractors). Replacing spreadsheet- and AppSheet-based workflows with one self-hosted platform: multiple tools, one per business function, used independently by different teams but connected through one shared Supabase (Postgres) database.

## Planned tools (build order)

1. Marathon — event registration app: field agents with simple PIN logins register runners (name, age, gender, mobile, t-shirt size, run type); category auto-assigned from age+gender; bib numbers auto-generated with category prefix; groups (schools/clubs) and agents managed by admin; entries counter on agent home; filtered lists throughout. Agents have basic literacy — UI must be extremely simple.
2. Indents — site teams request materials, every line tagged to project/plot
3. Purchase Orders — created from indent lines, split by vendor, with a well-designed PDF generator (company letterhead quality)
4. Inventory — goods receipt against POs, stock by store, issue to manufacturing
5. Bills — recording against POs and labour contracts
6. Budgets — budget vs actual per project
7. Dashboard — read-only overview across all tools

## Architecture principles

- One Next.js app; each tool is a route group under app/
- Shared component library in components/ui — build every screen from these, never one-off styles; visual direction and full design system documented in DESIGN.md
- Masters shared across tools: Projects, Plots, Items, Vendors, Stores
- Every transaction links to a project/plot
- Role-based access: users see only their team's tools in the sidebar
- All schema changes as numbered SQL files in supabase/migrations — never ad hoc
- Keep it simple: no over-engineering, this serves ~200 users max

## Documentation map

This file is the entry point. Each tool keeps its own build plan/checklist
colocated with its code at app/<tool>/PLAN.md (e.g. app/marathon/PLAN.md) —
check the relevant one before starting or resuming work on that tool.

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