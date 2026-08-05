# Settings — build notes

**Status: shipped.** Migration `0003`, hardened in `0013`, people
management added in `0032`.

The admin console for who exists and what they can open. Three screens:

- **People** (`/settings`) — everyone, searchable, with their app count
  and approval rights. Invite from here.
- **A person** (`/settings/people/[id]`) — name, account switches
  (admin, active), apps grouped by area, approval rights, and the
  access history read from `audit_log`.
- **Overview** (`/settings/overview`) — the old who-has-what grid,
  **read-only**. It used to be the editor, which made every one of
  sixteen columns a place to mis-click.

A person's display name is set here (`NameField`, save-on-blur →
`setFullName`) — for accounts made before invites existed, which never
asked for one; until it's set every attribution renders as a dash.
`inviteUser` now passes the name as `user_metadata`, so new people
never start out nameless.

## This is the permission system

Not a sidebar filter. `user_apps` plus `requireApp()` (`lib/auth/access.ts`)
**is** the access-control mechanism for the whole platform.
`visibleTools()` decides what appears in the sidebar, but that's cosmetic
— the real check is the one every tool's own queries and actions make.

Two layers, and both matter:

- **In the app**, `requireApp(user, "/budgets")` at the top of every
  query and action. Redirects rather than erroring.
- **In the database**, RLS policies calling `has_app('/budgets')`. This
  is what holds when the app layer has a bug — and it has had one.

## Roles

Only two: `admin` and `staff`. Admins have every tool automatically and
aren't shown checkboxes.

**Admin is now changed in the app** (`setAdmin`, on a person's page) —
reversing the earlier Studio-only stance, on the founder's call. Three
things make it safe to hand over, all in the database: `profiles_guard()`
lets only an admin change a role, it refuses to remove the **last active
admin** (demotion _or_ deactivation), and `audit_profiles` records every
change with who made it. Studio stays the break-glass path, because the
guard only applies when `auth.uid()` is not null (`0014`'s reasoning).

**A staff user cannot change any role, including their own.** Until
migration `0013` they could: `profiles` lets you edit your own row so you
can change your name, and `role` is on that row, with the public anon key
in every browser. One request bought every app grant, including
`/budgets`. A trigger now refuses it; `0014` narrowed that to requests
carrying a signed-in user, so Studio still works.

## Inviting and deactivating (`0032`)

`inviteUser` creates the account with a starting password the admin
chooses and hands over themselves. Email-invite links were the other
option and were declined: they need SMTP configured on the project, and
a mail failure leaves a half-made account nobody can get into.

**The one sanctioned service-role call in the dashboard.** `auth.users`
has no RLS path for the `authenticated` role at all, so creating a login
cannot go through the scoped client. `inviteUser` alone calls
`createAdminClient()`, only for `auth.admin.createUser`, never for a
table write. Everywhere else in the dashboard uses the RLS-scoped
client, always.

Deactivation (`setActive`) is a flag, never a delete: the auth user, the
grants and every "recorded by" line survive untouched, and reactivating
restores them. `is_admin()` and `has_app()` both answer false for a
deactivated person, so all ~80 RLS policies close at once; `dal.ts`
returns null so every screen redirects; and login signs them straight
back out with a plain message.

**Accepted gap:** a deactivated person's already-issued JWT can still
reach authenticated _reads_ (masters lists and other open selects) until
it expires, ~1h. Writes and every gated screen are closed immediately.

## Why Settings isn't grantable

Granting access is itself a privileged action, so it can't be delegable
through the same mechanism it manages. Settings checks `requireAdmin()`
— role directly — rather than an app grant. `GRANTABLE_TOOLS` in
`lib/tools.ts` excludes it for the same reason.

## Known gaps

- **Granting `/marathon` does nothing.** Marathon is a kiosk with its own
  PIN auth and no `requireApp` call anywhere, so the checkbox is
  cosmetic. Either wire it up or stop offering it.
- **No object-level permissions.** Anyone with `/selections` can open any
  unit's design; anyone with `/budgets` can open any budget. The app
  boundary is the permission boundary — a real decision, not an
  oversight, but worth stating to anyone who asks about per-project
  confidentiality.
- **A tool with no grants is invisible to everyone but admins.** After
  shipping one, remember to grant it.
