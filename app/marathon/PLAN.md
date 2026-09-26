# Marathon — the rules

Race-day kiosk: PIN login, entry capture, atomic bib numbering, admin panel. Live since 2026-07-30. Migrations `0002`, `0015`, `0070`.

## Why it is different

**Marathon is the one kiosk, and not a pattern to copy.** It sits outside Supabase Auth — `/marathon` is exempt in `lib/supabase/proxy.ts`, there is no session, and every query runs through the **service-role client**. The PIN is the only thing in the way. Its `marathon_*` tables have RLS on with **zero policies** — deny-all to signed-in roles, correct.

**The bib numbering is worth copying**: `marathon_create_entry` allocates inside one database function — atomic, one round trip, a per-row result. It is the shape for any row-by-row loop elsewhere that ever needs atomicity (`indents/PLAN.md`).

## Before a real race day

- **No agent on a published PIN.** `0002`'s seeded PIN, hash and salt are in this public repo; every agent was rotated 2026-08-17, and `npm run rotate-marathon-pins -- --project <ref>` finds any that come back. Admin → Members resets one by hand.
- The duplicate-mobile warning wants a Malayalam translation, never done.
- One walkthrough on the actual devices.

## Things that will bite

- **PIN lockout is real**: 10 wrong tries against an agent or the admin PIN locks it for 10 minutes (`lib/marathon/rate-limit.ts`), checked before the PIN is examined.
- **Counts never come from `rows.length`** — lists cap at `MARATHON_LIST_LIMIT` and say so; totals are exact counts.
- **`getSavedEntry` filters on `agent_id`** — without it any agent could walk bib numbers and read every runner. The toolbox's one per-caller scoping.
- **The kiosk home needs `export const dynamic = "force-dynamic"`** — it reads no cookies, so Next prerendered it once and new agents appeared only after the next deploy.
- **Dropdowns submit mirrored hidden inputs, not the `<select>`** — the select silently fell back to its first option. Don't simplify it back.
- **`MARATHON_SESSION_SECRET` signs the PIN cookie** — changing it signs every agent out mid-event.

## Design notes worth keeping

Built on `DESIGN.md` (`PageHeader`, `NavTabs`, `EmptyState`, `AnimatedReveal`); `PinPad` and `ExitButton` serve both agent and admin paths. Asked for explicitly: content reveals via a grid-rows transition (no layout shake); PIN screens reserve a fixed error slot so Continue never hops; the entry form's Save is `sticky bottom-0`; the member search is a live filter with **no autofocus** (a shared kiosk screen). The `BibCard` entrance is the one decorated moment.
