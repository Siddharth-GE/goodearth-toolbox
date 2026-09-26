# Settings — the rules

People, grants, role templates and approver lists. Admin only. Migrations `0003`, `0013`/`0014`, `0032`, `0034`.

Four screens: **People** (`/settings`), **a person** (`/settings/people/[id]`), **Roles** (`/settings/roles`) and **Overview** (`/settings/overview`) — the who-has-what grid, **read-only** (as an editor it made sixteen columns of mis-clicks). Actions refresh the whole `/settings` layout, so a person's page never shows stale access after a change.

## This is the permission system

`user_apps` + `requireTool()` **is** access control for the whole platform; `visibleTools()` (the sidebar) is cosmetic. Two layers, both needed: the app gate at the top of every query and action, and RLS calling `has_app()` — what holds when the app layer has a bug.

## Roles

- **Only two roles: `admin` and `staff`.** Admins have every tool and see no checkboxes.
- **Admin is changed in the app** (`setAdmin`). `profiles_guard()` lets only an admin change a role, refuses to remove the **last active admin** (demotion or deactivation), and `audit_profiles` records it. Studio stays the break-glass path (the guard applies only when `auth.uid()` is not null).
- **A staff user cannot change any role, including their own** — until `0013` one request through the anon key bought every grant.

## Role templates

A role names a job (Site Engineer, Purchase, Accounts) and bundles apps plus approval rights.

- **Effective access = the role's bundle ∪ the person's grants, computed at read time, never copied** — editing a role takes effect at once, and **a role only ever adds** (a hole in a bundle is invisible on screen).
- **`has_app()` is the whole mechanism** — teaching it about bundles taught every policy at once. `lib/settings/access-model.ts` mirrors it for the screens; if they disagree, the database is right.
- **Approval rights** (`can_approve_indents`, `can_approve_bills`, `bill_approval_limit`) resolve personal ∪ role, taking the more generous — unlimited beats a number.
- Deleting a role someone holds is refused (`on delete restrict`).

## Inviting and deactivating

- **`inviteUser`** creates the account with a starting password the admin hands over (email invites were declined: a mail failure leaves a half-made account). It is the dashboard's one service-role call, for `auth.admin.createUser` only — never a table write.
- **Deactivation is a flag, never a delete** — grants and every "recorded by" survive, and `has_app()`/`is_admin()` answer false, closing every policy at once. Accepted gap: an already-issued token still reaches open reads for up to ~1h.

## Boundaries

- **Settings isn't grantable** — granting access can't be delegated through the mechanism it manages. It checks `requireAdmin()`, and `GRANTABLE_TOOLS` excludes it.
- **It writes two other tools' tables**, `indent_approvers` and `bill_approvers` — both `is_admin()`-gated, a documented exception (`SECURITY.md`).
- **`bill_approval_cap(uid)` answers about the caller only** (`0071`) and **raises** for anyone else's id unless the caller is an admin — never null, which means unlimited. `can_approve_bills`/`can_approve_indents` return `false` the same way.
- **`admin_list_users()`** reads `auth.users` behind `is_admin()`; with Directory's `directory_emails()` it is one of two such functions.

## Known gaps

- **Granting `/marathon` does nothing** — the kiosk has its own PIN auth.
- **No object-level permissions** — anyone with `/selections` opens any unit, anyone with `/budgets` any budget. A real decision; state it to anyone asking about per-project confidentiality.
- **A tool nobody is granted is invisible to all but admins** — grant it after shipping.
