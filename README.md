# goodearth-toolbox

Internal tools platform for Goodearth — a design-led real estate company
in Kerala, India. One self-hosted platform replacing an AppSheet suite:
several tools, one per business function, on one shared Supabase
(Postgres) database.

**New here? Read in this order:**

1. **[PLAN.md](./PLAN.md)** — what's shipped, what's next, and which
   decisions are already settled. The living roadmap.
2. **[CLAUDE.md](./CLAUDE.md)** — architecture: how tools are structured,
   where code goes, how to add a new one.
3. **[DESIGN.md](./DESIGN.md)** — the shared visual system. Read before
   styling anything.

Per-tool build notes live beside the code — every built tool has one:
`app/marathon/PLAN.md`, and `app/(dashboard)/<tool>/PLAN.md` for
Masters, Selections, Budgets and Settings.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in the Supabase project values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Node 22 or newer.

### Environment variables

All four live in `.env.local` locally and in the Vercel project settings
for production.

| Variable                        | What it's for                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL. Public — it ships in the browser bundle.                                                                                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key. Safe to expose _because_ every table has row-level security; it is not a secret, but it is also not a permission.                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Bypasses row-level security entirely.** Server-only, never in a client component. Used only by the Marathon kiosk (`lib/supabase/admin.ts`) and the import scripts. |
| `MARATHON_SESSION_SECRET`       | Signs the Marathon kiosk's PIN session cookie. Any long random string — `openssl rand -hex 32`. Changing it signs everyone out of the kiosk.                          |

## Signing in

Users are created in **Supabase Studio → Authentication → Users**. A
`profiles` row is created automatically by a trigger.

**To make someone an admin**, run this in the Studio SQL editor — there
is no UI for it, deliberately, and the app itself refuses to let a
signed-in user change any role but through an existing admin:

```sql
update profiles set role = 'admin' where id = '<the user uuid>';
```

Everyone else is `staff`, and sees only the tools granted to them in
**Settings** (`/settings`). Admins see every tool automatically.

## Database

Schema changes are numbered SQL files in `supabase/migrations/`, applied
by hand through the **Supabase Studio SQL editor**, in numbered order.
There is no CLI or local Postgres for this.

The rules, which exist because of mistakes already made:

- **Apply the migration first, then merge the code that needs it.** Code
  expecting a column that doesn't exist yet must never reach production.
- **Additive only.** New tables and columns; never rename or drop
  something still in use. A real rename is three steps across two
  migrations with a deploy between each.
- **Never edit a migration that has been applied** — not even for a typo.
  A correction is a new, later-numbered file.
- **Write every migration so it can be run twice.** They're applied by
  hand, a partial failure is always possible, and "just run it again"
  has to be a safe answer. Use `if not exists`, `drop … if exists` before
  `create`, and `create or replace` for functions.

After applying one, regenerate the types and commit them with the
migration file:

```bash
npm run db:types    # one-time `npx supabase login` per machine
```

That generated file is what makes a typo'd column name fail
`npm run typecheck` instead of failing silently at runtime.

### If a migration goes wrong

There is no rollback tooling. Because migrations are additive and
re-runnable, the recovery is almost always to write a **new**
later-numbered migration that corrects the previous one — see `0014`,
which fixes an over-strict trigger added by `0013`. Don't edit history.

## Working on it

- `master` is production and **auto-deploys to Vercel on every push**.
- Anything sizeable gets a `feature/<name>` branch. Every push to one
  gets its own Vercel preview URL — that's the link to test on.
- Merge to `master` only after it's been tested in a browser.
- CI runs on every push and pull request. Run the same checks locally
  before pushing:

```bash
npm run format        # Prettier, writes
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # node:test via tsx — lib/**/*.test.ts
npm run build
```

## Scripts

| Script                 | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run dev`          | Dev server                                                        |
| `npm run build`        | Production build                                                  |
| `npm run start`        | Serve a production build                                          |
| `npm run lint`         | ESLint                                                            |
| `npm run format`       | Prettier, writing changes                                         |
| `npm run format:check` | Prettier, checking only — what CI runs                            |
| `npm run typecheck`    | `tsc --noEmit`                                                    |
| `npm test`             | Unit tests. Only pure logic is tested — see `lib/budgets/math.ts` |
| `npm run db:types`     | Regenerate `lib/supabase/database.types.ts` from the live schema  |

### One-off import scripts

Not part of the app; run by hand with `npx tsx`. Both read from `data/`,
which is **git-ignored**, so they can't be run from a fresh clone without
the source files.

- `scripts/import-catalogue.ts` — loads the item catalogue from CSV.
  Dry-run by default; pass `--commit` to write.
- `scripts/fetch-catalogue-images.ts` — downloads product images to
  Supabase Storage and writes thumbnails. Supports `--limit`.

## Deployment

Vercel, connected to `master`. Functions run in Mumbai (`bom1`, see
`vercel.json`) to sit next to the Supabase region — the round trip
dominates every page load, so this is not a detail.
