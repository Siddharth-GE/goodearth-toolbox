# Settings — the rules

**Shipped.** Migration `0003`, hardened in `0013`/`0014`, people management in `0032`, role templates in `0034`.

Four screens: **People** (`/settings`), **a person** (`/settings/people/[id]`), **Roles** (`/settings/roles`), and **Overview** (`/settings/overview`) — the who-has-what grid, **read-only**. It used to be the editor, which made every one of sixteen columns a place to mis-click.

_Trimmed 2026-08-14._

## This is the permission system

Not a sidebar filter. `user_apps` plus `requireApp()` **is** the access-control mechanism for the whole platform. `visibleTools()` decides what appears in the sidebar, and that is cosmetic. Two layers, and both matter:

- **In the app** — `requireApp(user, "/budgets")` at the top of every query and action. Redirects rather than erroring.
- **In the database** — RLS policies calling `has_app('/budgets')`. This is what holds when the app layer has a bug, and it has had one.

## Roles

Only two: `admin` and `staff`. Admins have every tool automatically and aren't shown checkboxes.

**Admin is changed in the app** (`setAdmin`, on a person's page), reversing the earlier Studio-only stance on the founder's call. Three things in the database make it safe to hand over: `profiles_guard()` lets only an admin change a role, it refuses to remove the **last active admin** (demotion _or_ deactivation), and `audit_profiles` records every change with who made it. Studio stays the break-glass path, because the guard only applies when `auth.uid()` is not null.

**A staff user cannot change any role, including their own.** Until `0013` they could: `profiles` lets you edit your own row so you can change your name, `role` is on that row, and the anon key is in every browser. **One request bought every app grant, including `/budgets`.** A trigger now refuses it; `0014` narrowed that to requests carrying a signed-in user, so Studio still works.

## Role templates

A role names a job — Site Engineer, Purchase, Accounts — and bundles a set of apps plus approval rights.

**Effective access = the role's bundle ∪ the person's own grants, computed at read time, never copied.** Two deliberate consequences: editing a role takes effect immediately, because there is no stored copy to drift; and **a role only ever ADDS**. There is no way to give a role and take one app back, because a hole in a bundle is invisible on screen.

**`has_app()` is the whole mechanism.** ~80 RLS policies already call it, so teaching that one function about bundles taught all of them with no policy edits. The definition is a strict superset for an active user, so every pre-existing `user_apps` row keeps working by construction. `lib/settings/access-model.ts` mirrors it in pure TS for the screens; **if the two disagree, the database is right.**

Approval rights ride along (`can_approve_indents`, `can_approve_bills`, `bill_approval_limit`), resolved personal ∪ role and taking the **more generous** — unlimited beats a number, otherwise the larger. Being named personally must never leave someone able to approve less than their role alone would have allowed.

Deleting a role someone holds is refused by the FK (`on delete restrict`) — silently stripping access was the alternative, and it isn't one.

## Inviting and deactivating

`inviteUser` creates the account with a starting password the admin chooses and hands over themselves. Email-invite links were declined: they need SMTP configured on the project, and a mail failure leaves a half-made account nobody can get into.

**This is the one sanctioned service-role call in the dashboard.** `auth.users` has no RLS path for the `authenticated` role at all, so creating a login cannot go through the scoped client. `inviteUser` alone calls `createAdminClient()`, only for `auth.admin.createUser`, **never for a table write.**

Deactivation (`setActive`) is a flag, never a delete: the auth user, the grants and every "recorded by" line survive, and reactivating restores them. `is_admin()` and `has_app()` both answer false for a deactivated person, so all ~80 RLS policies close at once.

> **Accepted gap:** a deactivated person's already-issued JWT can still reach authenticated _reads_ (masters lists and other open selects) until it expires, ~1h. Writes and every gated screen are closed immediately.

## Why Settings isn't grantable

Granting access is itself a privileged action, so it can't be delegable through the same mechanism it manages. Settings checks `requireAdmin()` — role directly — rather than an app grant, and `GRANTABLE_TOOLS` excludes it for the same reason.

## Settings owns two other tools' tables

`indent_approvers` (declared in `0019`) and `bill_approvers` (declared in `0025`) are written from `lib/settings/actions.ts`. This is a documented exception to "no tool's code writes another tool's table": both are `is_admin()`-gated, and deciding who approves things is Settings' job. `CLAUDE.md` records it.

## Known gaps

- **Granting `/marathon` does nothing.** Marathon is a kiosk with its own PIN auth and no `requireApp` call anywhere, so the checkbox is cosmetic. Either wire it up or stop offering it.
- **No object-level permissions.** Anyone with `/selections` can open any unit's design; anyone with `/budgets` can open any budget. The app boundary is the permission boundary — a real decision, not an oversight, but worth stating to anyone who asks about per-project confidentiality.
- **A tool with no grants is invisible to everyone but admins.** After shipping one, remember to grant it.
- **`bill_approval_cap(uid)` answers about the caller only**, since `0071` (`AUDIT.md` SEC-04, closed 2026-08-17). It **raises** for anyone else's id unless the caller is an admin — not returns null, because null in that function means _unlimited_ and a refusal must never read as one. `can_approve_bills` and `can_approve_indents` are the same shape and return `false`. Settings reads the `roles` table for what it shows, not these functions, so nothing on its screens changed.
