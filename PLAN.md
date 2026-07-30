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
- [ ] 5. New entry form — full runner form with live category/bib preview,
      duplicate-mobile warning, saves via the atomic bib-assignment function
- [ ] 6. Success screen — colored "bib card" showing the assigned bib
- [ ] 7. My list — an agent's own entries, filtered, with counts
- [ ] 8. Admin PIN gate + Members/Groups tabs — add agents, add groups
- [ ] 9. Admin Entries tab — all entries across agents, filterable, with totals

## Where we stopped (2026-07-30)

Steps 1–4 are built, tested, committed, and pushed to GitHub
(Siddharth-GE/goodearth-toolbox). The founder tested step 4 in the browser:
tapping "Test Agent" → wrong PIN shows an error → PIN 1234 signs in → lands
on a placeholder page ("Signed in as Test Agent") → Exit returns home →
visiting /marathon/entry directly without signing in correctly bounces back
to the home screen. All confirmed working.

## What step 5 starts with

Replace the placeholder at `app/marathon/entry/page.tsx` with the real
runner registration form:

- Fields: group (dropdown), name, mobile (10-digit), age (3–99), gender,
  t-shirt size, run type — matching the approved mockup.
- A live category + bib-prefix preview as the agent fills in age/gender/run,
  reusing the same `marathon_categories` rows already fetched for the run
  picker (so the matching rule is never duplicated against the database's
  version).
- A "warn but allow" notice if the mobile number already has an entry.
- On save, calls the `marathon_create_entry` database function (already
  built and tested in step 1) so bib numbers stay race-safe under
  concurrent submissions.

New files expected: `app/marathon/_components/entry-form.tsx`,
`components/ui/badge.tsx`, `app/marathon/_components/category-badge.tsx`,
and a `createEntry` action added to `lib/marathon/actions.ts`.
