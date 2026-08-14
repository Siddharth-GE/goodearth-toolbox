# Marathon — the rules

**Live on Vercel since 2026-07-30.** Race-day kiosk: PIN login, entry capture, atomic bib numbering, admin panel. Migration `0002` (+ `0015` for rate limiting).

_Trimmed 2026-08-14: the nine-step build checklist and the dated session logs live in git._

## What makes this tool different from every other one

**Marathon is the one kiosk pattern, and it is not to be copied.** It sits outside Supabase Auth entirely — `/marathon` is exempted in `lib/supabase/proxy.ts`, there is no session, and every query runs through the **service-role client**, which bypasses RLS. The PIN is therefore the only thing in the way. Its tables (`marathon_*`) have RLS enabled with **zero policies**, which is deny-all to `anon` and `authenticated` — correct, and not a gap.

**The bib-numbering pattern is worth stealing even though the kiosk isn't.** `marathon_create_entry` does the whole allocation inside one database function: atomic, one round trip, and it returns a per-row result. Everywhere else in the toolbox that loops row-by-row in JavaScript (the line pulls) could have both atomicity and per-row messages this way — see `AUDIT.md` QUAL-03.

## Pending before a real race day

- **Reset any agent still on the published test PIN `1234`, and delete "Test Agent".** The seeded PINs are in plaintext in a public repo, so rotation is the only remedy — rewriting the migration fixes nothing. Admin → Members has a form; no SQL needed. (`TODO.md` §2, `AUDIT.md` SEC-05.)
- The duplicate-mobile warning ("already registered, save anyway?") is English-only; flagged during the design pass as wanting a native-speaker Malayalam translation, never done.
- One final walkthrough on the actual devices agents will use on the day.

## Things that will bite

- **PIN lockout is real and DB-backed.** 10 wrong tries against the same target (an agent, or the admin PIN) locks that target for 10 minutes with a countdown. `lib/marathon/rate-limit.ts` over `marathon_pin_attempts`; the check runs _before_ the PIN is examined, and a successful login clears the counter.
- **Counts never come from `rows.length`.** Lists cap at `MARATHON_LIST_LIMIT` and say so on screen, but every total is an exact database count — so on race day the numbers stay right even when a list is truncated.
- **`getSavedEntry` filters on `agent_id` on purpose.** Without it any agent could walk bib numbers and read every runner's details. This is the one place in the toolbox with genuine per-caller scoping rather than role-based access.
- **The kiosk home screen needs `export const dynamic = "force-dynamic"`.** It reads no cookies and no `searchParams`, so Next silently prerendered it once at deploy time and a newly-added agent didn't appear until the _next_ deploy. Invisible in local dev, which always renders fresh. This was found in production by a founder-added agent not showing up.
- **Dropdowns submit hidden fields, not the `<select>`.** Run Type and T-Shirt Size both silently fell back to the first item in the list. The visible `<select>` is display-only and a mirrored hidden input is what submits, so what saves always matches the live preview. `ListFilters` and `AdminEntryFilters` follow the same pattern; don't "simplify" it back.
- **`MARATHON_SESSION_SECRET` signs the PIN cookie.** Changing it signs every agent out of the kiosk mid-event.

## Design notes worth keeping

Every screen is built on the toolbox design system (`DESIGN.md`), not its own patterns — `PageHeader`, `NavTabs`, `EmptyState`, `AnimatedReveal`, the `danger`/`warning` tokens. `PinPad` and `ExitButton` are each one shared component serving both the agent and admin paths.

Three UX decisions that were asked for explicitly and should survive a refactor: content animates in via a grid-rows transition rather than popping (no layout shake), the PIN screens reserve a fixed-height error slot so the Continue button never hops, and the entry form's Save button is `sticky bottom-0` — it is the single most repeated action in the app and must always be a thumb's reach away. The home screen's member search is a live client-side substring filter with **no autofocus**: this is a shared kiosk screen and the keyboard should not pop up uninvited.

The `BibCard` entrance animation is the one decorated moment — the payoff of the flow. Nowhere else, per "inviting without fluff."
