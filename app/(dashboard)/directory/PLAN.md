# Directory — the rules

Everyone who works here, with a card. Grant `/directory` (held by everyone). Migrations `0060`, `0061` (photos). The staff sheet was loaded once by `scripts/import-staff.ts`.

## The model

**One person = one account = one card.** `staff_details.id` is `profiles.id` — the primary key is the rule, so no second card and no card for nobody. The `profiles_seed_staff_details` trigger gives every account a blank card as it is created; the app only ever updates cards. Departments are Directory's own list (`staff_departments`), not Relay's.

## The rules everything follows from

1. **The column split lives in the database.** The person's own: `phone`, `date_of_birth`, `blood_group`, the emergency contact, `photo_path`. The company's: `department_id`, `designation`, `reports_to_id`, `joined_on`. RLS cannot restrict an UPDATE by column, so `staff_details_guard()` does (the twin of `profiles_guard()`). **A new company column goes into both branches of the guard in the same migration** — forgotten, it is silently self-editable.
2. **`has_app('/directory')` is not a boundary** — everyone holds it. Everything genuinely restricted here says **`is_admin()`**. The grant protects one thing: `directory_emails()`, against an account without the tool. Hide nothing sensitive behind it.
3. **No PostgREST embeds, ever.** `staff_details` has four FKs to `profiles` and `staff_departments` two; reads are flat and merge through a `Map` (BUGCATCHER #2).

## Emails

Email lives only in `auth.users`. `directory_emails()` (`security definer`) reads it, and **its `where has_app('/directory')` is its entire boundary** — delete that line and every address goes to any signed-in account. It returns inactive people too; the screens filter. It is one of two definer functions reading `auth.users` (with Settings' `admin_list_users()`); neither may grow a column without deciding who it is for.

## Things that will bite

- **The guard's `auth.uid() is not null` is what lets service-role scripts write** (and Studio stay a break-glass path). Remove it to "tighten" the guard and the importer breaks silently.
- **The seed trigger fires inside Settings' `inviteUser`** — a `not null` column without a default on `staff_details` makes account creation fail as "Could not create the account", far from the cause.
- **"Date of birth not in the future" cannot be a CHECK** (`current_date` isn't immutable); it lives in the guard.
- **A reporting line to someone deactivated must not vanish** — render "(inactive)" and keep them in the admin's dropdown, or saving any other field clears it.
- **Age is never displayed**; the birthday list shows day and month.
- **Search is a Node filter over a complete read** — it spans name, designation and an email behind an RPC. Fine at 200 people, not at 1,000.
- **The roster is a phone screen**: a card grid with full-width `tel:`/`mailto:` targets, never a wide table.

## Accepted gaps

- **A reporting cycle (A → B → A) is representable**; `lib/directory/org.ts` breaks loops with a `seen` set and a depth cap, under test.
- **Three shared mailboxes are people** (`admin@`, `designer@`, `team@`) by founder decision — what they approve names an inbox, not a person.
- **Health, next-of-kin and identity data is visible to every colleague** — the tool's purpose; "My details" says in plain English who sees each field.
- **`profiles.team` stays dead** — repointing a shared column is a rename, which additive-only forbids.
