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
- Shared component library in components/ui — build every screen from these, never one-off styles; visual direction: minimal, clean, Apple-like but colorful
- Masters shared across tools: Projects, Plots, Items, Vendors, Stores
- Every transaction links to a project/plot
- Role-based access: users see only their team's tools in the sidebar
- All schema changes as numbered SQL files in supabase/migrations — never ad hoc
- Keep it simple: no over-engineering, this serves ~200 users max

@AGENTS.md
