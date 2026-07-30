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
- [x] 8. Admin PIN gate + Members/Groups tabs — add agents, add groups
- [x] 9. Admin Entries tab — all entries across agents, filterable, with totals

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
entries (most recent first) with a total count. Filtering has three
dropdowns — Group, Race, and the specific Category — any combination of
which narrows the list via `?group=`, `?run=`, `?category=` on pressing
Filter. A "My Entries" link was added to the entry page's header, and a
"+ New Entry" button on the list screen goes back. Backed by
`getAgentEntries(agentId, filters)` in `lib/marathon/queries.ts`.

The filter dropdowns live in a client component,
`app/marathon/_components/list-filters.tsx` — the Category list narrows
to the selected Race *live*, before Filter is even tapped (Fun Run only
ever has "Open", so the rest would be noise). It follows the same
hidden-field pattern as the registration form's dropdowns: the visible
`<select>`s are display-only, and hidden inputs mirrored from the same
state are what actually submit, so a stray tap can't submit the wrong
filter.

Verified directly against the database: created test entries across
different groups/races/categories, confirmed each filter (and the "no
filter" case) returned exactly the right rows, then deleted them.

Step 8 is also built: a separate admin PIN login at `/marathon/admin`
(shared PIN, seeded to `2026` — see `supabase/migrations/0002_marathon.sql`)
leading to two tabs, `/marathon/admin/members` and `/marathon/admin/groups`,
each with a list and an "add" form. New agents get a name + a 4–6 digit
PIN (hashed the same way as the seeded Test Agent); new groups just need
a name, with a friendly "already exists" message on a duplicate rather
than a crash. A small "Admin" link was added to the bottom of the home
screen. New actions `verifyAdminPinAction`, `adminLogout`, `createAgent`,
`createGroup` in `lib/marathon/actions.ts`; new reads `getAdminAgents`,
`getAdminGroups` in `lib/marathon/queries.ts`.

Verified directly end-to-end against the database and running server
(no browser available in this environment): logged in with the real
admin PIN, added a test agent and confirmed its PIN actually verifies,
added a test group, confirmed a duplicate group name returns the
friendly error instead of a crash, and confirmed `/marathon/admin/members`
redirects to the PIN screen when not logged in. Both test rows were then
deleted. Not yet clicked through by the founder in an actual browser.

Step 9 is also built: a third admin tab, `/marathon/admin/entries`,
listing every entry across all agents (most recent first), with the
count of matches (and the grand total when a filter narrows it). Filters
are Agent, Group, Race, and Category — the same live-narrowing,
hidden-field-submits pattern as step 7's `ListFilters`, generalized into
`app/marathon/admin/_components/admin-entry-filters.tsx` with an Agent
dropdown added. Each row shows which agent registered that runner. This
is now the admin section's landing tab (both the PIN page and admin
login redirect here instead of Members). Backed by
`getAdminEntries(filters)` in `lib/marathon/queries.ts`.

Verified directly against the database and running server: confirmed
unauthenticated access redirects to the PIN screen, created a test entry
and confirmed it appeared with the correct agent attribution, confirmed
the Agent filter narrowed correctly and the Race filter correctly
excluded it when set to the wrong race, then deleted the test entry.

This completes the full 9-step Marathon build plan from the original
design session.

## UX refinement pass (2026-07-30)

After the 9 steps, the founder asked for a deliberate design pass:
no layout jank as content appears/disappears, a decision on fixed
headers, and a home screen that scales past a handful of agents
(confirmed: expect 15–50+ agents on the shared kiosk device). Built:

- **No more layout "shaking"**: the entry form's live category-preview
  card, "no match" card, and duplicate-mobile warning now animate in
  via a grid-rows-to-auto CSS transition instead of popping in/out
  (`app/marathon/_components/entry-form.tsx`). Both PIN screens
  (`pin-pad.tsx`, `admin-pin-pad.tsx`) reserve a fixed-height error slot
  so the Continue button doesn't hop down on a wrong PIN.
- **Sticky headers**: the entry form, My Entries, and every admin tab
  now have a `sticky top-0` header (title/tabs + Exit) with a quiet
  `bg-background/95 backdrop-blur` + hairline border treatment — stays
  reachable while the rest of the page scrolls underneath, without a
  heavy app-bar look.
- **Sticky Save button**: the entry form's Save button (the single most
  repeated action in the app) is now `sticky bottom-0`, always a thumb
  reach away regardless of scroll position.
- **Home screen search**: a new `app/marathon/_components/member-list.tsx`
  client component adds a live, client-side substring filter above the
  existing tap list — no separate search screen, no autocomplete, no
  autofocus (this is a shared kiosk screen, the keyboard shouldn't pop
  up uninvited). The admin Entries tab's Agent filter stays a plain
  native `<select>` — those already scale fine on their own.
- **One moment of delight**: the `BibCard` success banner now has a
  brief fade+scale entrance (`@keyframes card-in` in `app/globals.css`)
  — the payoff moment of the flow. Nowhere else was decorated further,
  per "inviting without fluff."

Verified directly against the running dev server and database (no
browser available in this environment): confirmed the search input and
both sticky elements render with the right classes on the actual pages,
confirmed the CSS keyframe compiled into the real bundle (not just
present in source), and exercised the bib-card animation end-to-end
with a real saved entry before cleaning it up. Not yet clicked through
by the founder in an actual browser.
