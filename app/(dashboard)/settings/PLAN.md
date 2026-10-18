# Settings — the rules

People, grants, team leads, role templates, approver lists and the sidebar's teams. Admin only. Migrations `0003`, `0013`/`0014`, `0032`, `0034`, `0114`, `0122`.

Five screens: **People** (`/settings`), **a person** (`/settings/people/[id]`), **Roles** (`/settings/roles`), **Overview** (`/settings/overview`) — the who-has-what grid, **read-only** (as an editor it made sixteen columns of mis-clicks) — and **Teams** (`/settings/teams`). Actions refresh the whole `/settings` layout, so a person's page never shows stale access after a change; Teams' actions refresh every page, because every page carries the sidebar.

## Teams

The headings in everyone's sidebar, on the home page and over the grant lists here (founder, 2026-10-13: "a place where you can make all the team tags so that we can rearrange as needed").

- **Teams arrange; grants decide.** `tool_teams` and `tool_team_apps` (`0114`) are read by every signed-in person and written by admins; no policy, view or `has_app()` reads them. Like `user_apps`, they are the shell's tables (`lib/nav/`) that Settings manages.
- **One team per tool** (`app` is the key). A tool with no team — a new one, or one whose team was deleted — sits under **Other**, always last, so a tool never vanishes for want of a heading. "Other" is refused as a team name.
- **Deleting a team frees its tools to Other** (the FK cascades their rows) — nothing to refuse, because nothing is granted.
- **No CHECK on the slug**, unlike `user_apps`/`role_apps`: `setToolTeam` checks `lib/tools.ts`, and a row for a slug the registry no longer has is never drawn — so a new tool needs no third CHECK.
- **Order is `sort_order`, renumbered 1…n on every move**; tools inside a team keep `lib/tools.ts` order (Operations reads in chain order).
- **The sidebar's read never takes a page down** (`getToolArrangement`): a failed read is logged and every tool shows under Other. This screen uses the throwing form, because an empty list here would look like "no teams yet".

## This is the permission system

`user_apps` + `requireTool()` **is** access control for the whole platform; `visibleTools()` (the sidebar) is cosmetic. Two layers, both needed: the app gate at the top of every query and action, and RLS calling `has_app()` — what holds when the app layer has a bug.

## Team leads

In a tool the founder makes scoped (`scoped` in `lib/tools.ts` — today Client Relations), each person sees only their own work; a **team lead** sees everyone's (founder, 2026-10-17: "admin and team lead"). The mechanics are SECURITY.md's; the screen's rules are here.

- **The tick sits under the grant it belongs to**, on a person's page, and only for a scoped tool they hold — personally or through their role. Without the grant it does nothing (`is_lead()`), so it is never offered alone.
- **Per person, not per role.** Leading is a judgement about one person; a role that made everyone holding it a lead would undo the point.
- **Removing the app removes the lead tick with it** (`revokeApp`), so a later grant never brings back a lead nobody remembers giving. A role taken away leaves the tick, inert, until the grant returns.
- **`tool_leads` (`0122`)**: a person reads their own rows, admins read and write all, no update policy, audited — the person's access history says "Made team lead in …".
- **Admins are leads everywhere** and see no tick.

## Roles

- **Only two roles: `admin` and `staff`.** Admins have every tool and see no checkboxes.
- **Admin is changed in the app** (`setAdmin`). `profiles_guard()` lets only an admin change a role, refuses to remove the **last active admin** (demotion or deactivation), and `audit_profiles` records it. Studio stays the break-glass path (the guard applies only when `auth.uid()` is not null).
- **A staff user cannot change any role, including their own** (`0013`): otherwise one request through the anon key buys every grant.

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
- **`admin_list_users()`** reads `auth.users` behind `is_admin()` (one of two such functions — `directory/PLAN.md`).

## Known gaps

- **Object-level permissions in one tool only** — Client Relations shows each person their own plots and actions (`0123`). Elsewhere anyone with `/selections` opens any unit, anyone with `/budgets` any budget. A tool joins by being made `scoped` with its own migration — first it has to record who is assigned to what (Supervisors does not, yet).
- **A tool nobody is granted is invisible to all but admins** — grant it after shipping.
