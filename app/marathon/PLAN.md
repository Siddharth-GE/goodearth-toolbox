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
- [ ] 6. Success screen — colored "bib card" showing the assigned bib
- [ ] 7. My list — an agent's own entries, filtered, with counts
- [ ] 8. Admin PIN gate + Members/Groups tabs — add agents, add groups
- [ ] 9. Admin Entries tab — all entries across agents, filterable, with totals

## Where we stopped (2026-07-30)

Steps 1–5 are built. Step 5's entry form is verified against the real
database (a live `marathon_create_entry` call correctly returned bib
`M0001` for a 30-year-old male on the 10.5K run, then the test row was
deleted) and the page was confirmed to render correctly with the
`Test Agent` session. Not yet clicked through in an actual browser by the
founder — see the checklist in this session's summary before checking
step 5 off as founder-approved. Not yet committed/pushed.

## What step 6 starts with

Replace the plain "Saved — {bib}" text banner at the top of
`app/marathon/entry/page.tsx` (added in step 5, driven by the `?saved=`
query param) with a proper colored "bib card" — something that reads
well as a physical hand-off to the runner, using the category's `color`
via `CategoryBadge`/the new color-lookup table in
`app/marathon/_components/category-badge.tsx`.
