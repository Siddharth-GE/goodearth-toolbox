# Directory — the rules

Everyone who works here, with a card. Read this before touching the tool.

Migration `0060` (tables, guard, RLS, `directory_emails()`); `0061` adds the photo bucket. The staff sheet was loaded once by `scripts/import-staff.ts`.

## The model, in one paragraph

**One person = one account = one card.** `staff_details` has `id uuid primary key references profiles (id)` — the primary key _is_ that rule, so the schema cannot represent a second card for one person or a card for nobody. A `profiles_seed_staff_details` trigger gives every account a blank card the moment it is created, so a card is never inserted by the app, only updated. Departments are Directory's own list (`staff_departments`), not Relay's.

## The three rules everything else follows from

1. **The column split is the point, and it lives in the database.** Five columns belong to the person (`phone`, `date_of_birth`, `blood_group`, `emergency_contact_name`, `emergency_contact_phone`, plus `photo_path`); four belong to the company (`department_id`, `designation`, `reports_to_id`, `joined_on`). RLS cannot restrict an UPDATE to particular _columns_ — that is why `profiles_guard()` exists and why `staff_details_guard()` is its twin. **Adding a column means deciding which group it joins, and a company column must go into both branches of the guard in the same migration.** A company column forgotten in the guard is silently self-editable and nothing on screen says so.

2. **`has_app('/directory')` is not a boundary here.** Every account in the company holds it, so it is `true` with extra steps. Everything genuinely restricted in this tool says **`is_admin()`** — department writes, the posting fields, the departments screen. The one thing the grant does protect is `directory_emails()`, against an account that has _not_ been granted the tool. **Do not hide anything sensitive behind `/directory` believing it is narrow.**

3. **No PostgREST embeds in this tool. Ever.** `staff_details` has **four** foreign keys to `profiles` (`id`, `reports_to_id`, `created_by`, `updated_by`) and `staff_departments` has two. A `profiles(...)` embed from either answers HTTP 300 `PGRST201` at runtime and is invisible to lint, types, tests and `next build` — Client Relations shipped four dead screens exactly this way. `lib/directory/queries.ts` reads flat and merges through a `Map`, which at fifty rows is faster than the join anyway. Naming the key would also work; not embedding at all cannot be got wrong.

## Where the email comes from

Email lives only in `auth.users`. Before this tool the sole read path was `admin_list_users()`, gated `where is_admin()` — a member of staff could not see a colleague's address at all. `directory_emails()` is that function with a different gate, and **its `where has_app('/directory')` is the entire permission boundary**: it is `security definer`, so it bypasses RLS, and deleting that line hands every address in the company to any signed-in account.

A function rather than a view on purpose: one established shape for reading `auth.users`, one place to audit, and nothing new in `database.types.ts` for the next person to join without thinking. It returns inactive people too — the screens filter, and blanking the email on a deactivated card is exactly wrong for the one person who needs it.

## Things that will bite

- **The importer depends on `auth.uid() is not null` in the guard.** Service-role writes have no `auth.uid()`, which is what lets `scripts/import-staff.ts` set the whole company's departments. That condition came from `0014` so Studio stays a break-glass path. Remove it to "tighten" the guard and both break — the import _silently_, on the one run that matters.
- **`profiles_seed_staff_details` is a trigger on a shared table, firing inside Settings' `inviteUser`.** Declared in Directory's migration so the coupling points the right way, and named in `CLAUDE.md`. The concrete misfire: if `staff_details` ever grows a `not null` column with no default, **`inviteUser` starts failing** and surfaces as "Could not create the account", nowhere near the cause.
- **"Date of birth not in the future" cannot be a CHECK.** `current_date` is `STABLE`, not `IMMUTABLE`, and Postgres refuses it. It lives in the guard. Tidying it into a constraint produces a migration that fails at apply time.
- **A reporting line pointing at someone deactivated must not vanish.** Render it "(inactive)", and keep the current value in the admin's reports-to dropdown even when inactive — otherwise saving any _other_ field on that person silently clears their reporting line.
- **Age is never displayed.** The birth year is stored because it is the fact; the birthday list shows day and month only. That is a decision, not an oversight.
- **Search cannot be a database filter.** It spans `profiles.full_name`, `staff_details.designation` and an email that only exists behind an RPC, so it is a Node filter over a complete `fetchAll` read. Honest at fifty people, fine at 200. Past ~1,000 this needs rethinking; it does not scale and does not pretend to.
- **The roster is a phone screen.** Site engineers open this to get a colleague's number while standing on site. A card grid, not a table, and `tel:`/`mailto:` as full-width tap targets. A ten-column table of fifty people is unusable at 390px and there is no honest way to make it one.

## Accepted gaps

- **A reporting cycle (A → B → A) is representable.** `0060` refuses only self-reporting; a full cycle check in a trigger is a recursive CTE, which is over-engineering for fifty people. The loop is broken in `lib/directory/org.ts` with a `seen` set and a depth cap of 12, in pure code where a test proves it.
- **Three shared mailboxes are people.** `admin@`, `designer@` and `team@` have cards and logins, by founder decision. The cost, recorded once: anything they approve, indent, bill or record names an inbox rather than a person. Reversible by deactivating them.
- **Personal data lives here that has not been in this app before** — blood group and emergency contact are health and next-of-kin data, date of birth is identity data, and all of it is visible to every colleague. That is the tool's purpose, but "My details" says in plain English who can see each field rather than leaving people to assume. No `grantWarning` in `lib/tools.ts`: that field is for grants whose consequence is easy to under-imagine, and "the staff directory shows staff details" is not one.
- **`profiles.team` stays dead.** Repointing it at `staff_departments` is a rename on a shared table, which the additive-only rule forbids.
