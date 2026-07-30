# goodearth-toolbox

Internal tools platform for Goodearth. Start with **[CLAUDE.md](./CLAUDE.md)**
— that's the real entry point: architecture, how tools are structured, and
how to add a new one. **[DESIGN.md](./DESIGN.md)** covers the shared visual
system (colors, type, components). Each tool also keeps its own build
notes at `app/<tool>/PLAN.md`.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in the Supabase project values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

Schema changes are numbered SQL files in `supabase/migrations/`. Apply a
new migration by running its SQL against the project via the Supabase
Studio SQL editor, in numbered order — there's no CLI/local-Postgres setup
for this yet.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build/start
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
