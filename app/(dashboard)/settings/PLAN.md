# Settings — build notes

**Status: shipped.** Migration `0003`, hardened in `0013`.

The admin console for per-user app access: one row per person, one
checkbox per grantable tool.

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
aren't shown checkboxes. There is no role-editing UI, deliberately — a
role is changed in the Studio SQL editor (see README).

**A staff user cannot change any role, including their own.** Until
migration `0013` they could: `profiles` lets you edit your own row so you
can change your name, and `role` is on that row, with the public anon key
in every browser. One request bought every app grant, including
`/budgets`. A trigger now refuses it; `0014` narrowed that to requests
carrying a signed-in user, so Studio still works.

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
