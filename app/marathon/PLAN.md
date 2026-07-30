# Marathon tool — build plan

Full design/decisions (routing, session design, database security, data
model) were worked out and approved on 2026-07-30. This file is the build
checklist and a bookmark for picking work back up.

## Steps

- [x] 1. Database migration — groups, agents, run types, categories, entries,
      atomic bib-numbering function (`supabase/migrations/0002_marathon.sql`)
- [x] 2. Service-role client + kiosk session (signed PIN cookie) + proxy
      exemption so `/marathon` needs no Toolbox login
- [x] 3. Home screen — live totals, run-type split, groups count, member list
- [x] 4. PIN entry + agent session — tap a name, enter PIN, land on a
      protected placeholder page
- [x] 5. New entry form — full runner form with live category/bib preview,
      duplicate-mobile warning, saves via the atomic bib-assignment function
- [x] 6. Success screen — colored "bib card" showing the assigned bib
- [x] 7. My list — an agent's own entries, filtered, with counts
- [ ] 8. Admin PIN gate + Members/Groups tabs — add agents, add groups
- [ ] 9. Admin Entries tab — all entries across agents, filterable, with totals

## Where we stopped (2026-07-30)

Steps 1–5 are built, tested by the founder in the browser, committed, and
pushed. Testing caught two real bugs along the way (both fixed, committed,
pushed): the duplicate-mobile "Save Anyway" step was clearing the form,
and — more seriously — the Run Type and T-Shirt Size dropdowns weren't
reliably saving what was shown on screen (both silently fell back to the
first item in the list). Root cause and fix: those two dropdowns now only
drive an in-page value that's submitted via a hidden field, so what saves
always matches the live preview. All test entries created while trying
this out were deleted and every category's bib counter was reset to 1, so
the database is clean for real registrations.

Step 6 is also built: the plain text banner was replaced with a colored
`BibCard` (`app/marathon/_components/bib-card.tsx`) showing the bib
number, runner name, category, run, and t-shirt size, colored to match
the category. It's driven by a new `getSavedEntry(bib)` query
(`lib/marathon/queries.ts`) that looks up the entry's category/run by ID
rather than guessing from the bib prefix. Verified directly against the
database (created a test Women's entry, confirmed the purple card
rendered with the right details, then deleted it and reset that
category's bib counter back to 1). Founder-tested and pushed.

Step 7 is also built: `app/marathon/list/page.tsx` shows an agent's own
entries (most recent first) with a total count. Filtering is a plain GET
form (no client JS) with three dropdowns — Group, Race, and the specific
Category (each option labelled with its race, e.g. "Men — 10.5 K Quarter
Marathon") — any combination of which narrows the list via `?group=`,
`?run=`, `?category=`. A "My Entries" link was added to the entry page's
header, and a "+ New Entry" button on the list screen goes back. Backed
by `getAgentEntries(agentId, filters)` in `lib/marathon/queries.ts`. The
Category dropdown only offers categories belonging to the selected Race
(Fun Run only ever has "Open"), so it can't offer choices that could
never match anything.

Verified directly against the database: created test entries across
different groups/races/categories, confirmed each filter (and the "no
filter" case) returned exactly the right rows, then deleted them.

## What step 8 starts with

Admin PIN gate + Members/Groups tabs — a separate admin login (already
has `requireAdminSession`/`verifyAdminPin` in `lib/marathon/session.ts`
from step 2, unused until now) leading to screens for adding agents
(name + PIN) and groups (schools/clubs), so real event setup doesn't
require touching the database by hand.
