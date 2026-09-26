# SECURITY.md — the boundary rules

Auth, permissions, money, the line chain and the cross-tool contracts. CLAUDE.md carries each rule's one-line form; this file is the mechanics and the why. Read it before touching any of this — every rule here either broke once or was designed against a break.

## Auth and permissions

- **The app grant IS the permission boundary.** Every query and action calls `requireTool("<href>")` (`lib/auth/access.ts`) first. Sidebar visibility is cosmetic. Admins get everything. Grants are per-user (`user_apps`) + role bundles (`role_apps`), unioned per request, enforced in the database by `has_app()`.
- **Signing in is password → emailed 6-digit code** (10 minutes; a 30-day trusted device skips the code, never the password), or Google for an email that already has an account; public signups are off. Both steps are rate-limited in the database: 10 wrong in 10 minutes locks for 10. The enforcing half is `auth_verified_sessions` (`0062`): since `0063`, `has_app()` and `is_admin()` answer **false for any session without its row**, so a session minted from the auth API with a stolen password reaches nothing gated. So **redefining `has_app()` or `is_admin()` must carry `session_is_verified()` forward**, and only the server ever writes `auth_verified_sessions` — a self-service marking function would let the session being screened pass itself.
- **Every unauthenticated route goes in `PUBLIC_PATHS`** (`lib/supabase/proxy.ts`) as an **exact string** — a missing entry 302s to /login before the route runs; a prefix would make neighbouring routes silently public. **`/deck/` is the one prefix** (`PUBLIC_PREFIXES`): Dexter's viewer serves assets relative to itself, and its gate is the token inside the route. A second prefix needs the same argument written here first.
- **All database access is server-side.** No browser Supabase client exists — do not add one.
- **Tools use the RLS-scoped client** (`lib/supabase/server.ts`), never the admin client. The sanctioned exceptions, each for want of a session: `inviteUser` (auth-admin API); the sign-in flow's `lib/auth/rate-limit.ts` and `markSessionVerified` (deny-all tables); the OAuth callback's delete of a signup-leak account; the keep-alive's one-row read (a cron, gated by `CRON_SECRET`); the Google Chat door's `lib/google-chat/`; Marathon's kiosk; and **Dexter's public door**, the one inside a tool (two reads, never a write).
- **RLS on for every table, always.** A new table without policies is a bug.
- **A view is a read surface.** Views are owned by `postgres` and bypass RLS, and Supabase grants writes on every new relation, so a view left writable is an RLS bypass. Every new view revokes insert, update, delete, truncate from **`anon, authenticated`** (naming them — `from public` does not), and every new function revokes execute from `public, anon`, in the same migration. `drop view` restores the default grants every time. `npm run db:check-views` fails a pull request on a writable view (BUGCATCHER #3).
- **Every `security definer` function checks `has_app(...)` or `is_admin()` in its own body** — that check is its whole boundary — unless no client role may execute it (revoked from `anon` and `authenticated`, reached only by a trigger), in which case the grant is. `security definer` changes the role, not `auth.uid()`, so a check inside a function reached from a cross-tool trigger uses `pg_trigger_depth() = 0` to tell a direct call from the trigger (BUGCATCHER #11).
- **Actions return `ActionState`** (`lib/action-state.ts`), never throw. Queries may throw — a failed read has no partial answer worth showing.
- **Never seed a real default credential.** `0002` seeded a Marathon PIN whose hash and salt are in this public repo; `0070` deletes anything matching it and `npm run rotate-marathon-pins -- --project <ref>` finds the rest. The kiosk has no Supabase session, so the PIN is all that stands in the way.

## The Google Chat door

The app's one unauthenticated POST (`app/api/google-chat/route.ts`). Everything under `lib/google-chat/` follows from having **no browser session**; its plan is `lib/google-chat/PLAN.md`.

- **The lock is the token, and its email claim is load-bearing.** `verify.ts` checks each request's Google ID token with `node:crypto`: RS256, issuer `accounts.google.com`, audience `GOOGLE_CHAT_AUDIENCE`, **and** `email` = `service-<GOOGLE_CHAT_PROJECT_NUMBER>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`. Any Google service account can mint a token for our audience; only the email says it is our Chat app. The body is not read until the token passes. `route.ts` holds only this; everything after lives in `dispatch.ts`.
- **Who typed is Google's word, mapped to one account.** `identity.ts` maps the sender email to an active account holding `/relay`, and refuses anyone else in five fixed sentences that never reveal who exists.
- **Reads go through the admin client on `pusher_chain_state`** (plus `pusher_chain_legs`, names from `profiles`, `projects`, `units`) — the same everyone-signed-in-sees-every-trail view Relay reads. `google_chat_spaces` (`0094`) is the door's own deny-all table.
- **Writes are made as the person, never as the system.** `act-as.ts` is the only place that mints a session for somebody else — admin `generateLink` → `verifyOtp` → the verified-session row → the write → **always** delete the row and revoke the session (`"local"`, never `"global"`). `has_app('/relay')` and Relay's guard stay the boundary; every event carries the person's `actor_id`. It has one caller and must never grow a second.
- **The app's own credential may do one thing.** `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` lets `outbound.ts` rewrite a card the app itself posted, after a press. It never touches the database, mints a session or moves a baton. Unset, the door behaves as before.
- **Nothing logs message text, an email, a token or a session id.** No replay table yet — Google's token `exp` and the single-use magic link cover it; a deferral, not a decision.

## Dexter's public door

A client opens `/deck/<token>/index.html` and sees an uploaded presentation.

- **The token is the whole gate, checked for shape before anything is read** — 22 base64url characters, pinned by `0095`'s CHECK and the route's pattern. A switched-off deck answers exactly like a token that never existed; "New link" kills the old one.
- **Admin client, reads only.** No `anon` policy exists on `dexter_projects`, `dexter_decks` or the bucket (`0095` asserts it), so the public side can be widened only by editing this route. `safeDeckPath` refuses traversal and joins every path under `decks/<id>/`.
- **The page is untrusted HTML on our own origin**, so every document carries `Content-Security-Policy: sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals` — **never `allow-same-origin`**, which would hand an uploaded deck the viewer's session. SVG gets the same header; `nosniff` and a content type from the extension stop disguised files.
- No view counting (a write from an unauthenticated route), passwords or expiry, by decision.

## The line chain

Design flows to payment through the database, never through shared code. The two files deciding what carries forward (`lib/budgets/carry-forward.ts`, `lib/indents/pull-rules.ts`) are pure and import nothing.

| Hop                | Anchor                                             |
| ------------------ | -------------------------------------------------- |
| selection → budget | composite FK `(selection_id, line_key)`            |
| budget → indent    | composite FK `(budget_id, line_key)`               |
| indent → PO        | FK `purchase_order_lines.indent_line_id`, not null |
| PO → receipt       | FK `goods_receipt_lines.po_line_id`, not null      |
| PO → bill          | FK `bills.po_id`, header level only                |

- **Anchor on stable ids or the composite FK — never a bare `line_key`.**
- **Deletion is refused, not cascaded.** Issued revisions are immutable (`selection_lines_draft_only`) and the FKs restrict. Drift is flagged instead: `classifyDesignDrift` marks changed lines, `getDownstreamImpact` shows the indents and POs a change would hit.

## Money stays confined

Indents and Inventory carry no money. PO money is RLS-gated to `/purchase-orders`; everyone else reads the money-free views (`po_facts`, `po_line_facts`, `approved_budgets(_lines)`, `bill_facts`). **`po_billing_totals` is not money-free** — it carries ordered and billed totals and is the one sanctioned window between POs and bills, gated in its own `WHERE` to `/purchase-orders` or `/bills`.

- **Two named exceptions, by founder decision.** `/reporter` reads PO, bill, budget and margin money (`0055`) by widening each table's one SELECT qual to `has_app('/x') or has_app('/reporter')`. `/financial-management` reads client money, bill money and plan targets (`0058`) through owner views with a three-way `WHERE`, plus `bill_money_facts`. Both grants carry an amber `grantWarning` in `lib/tools.ts` — keep it. `budget_report_lines` is the one `security_invoker` view, so it inherits RLS. `crm_milestone_facts`/`crm_receipt_facts` omit the CRM's prose (details, notes, bottlenecks), which is its stronger secret.
- **`/estimator` is a self-contained money surface** (`0074`): every table gated on SELECT too, no cross-tool money reads. Its one view, `estimate_takeoff_facts`, is the rate-free window Indents, Inventory and Supervisors read. The material rate is `items.indicative_price`, visible to all; only what the Estimator computes from it is gated.
- **`vendor_payment_details` is the one gated Masters table** (`0089`/`0090`) — bank details: SELECT needs `/masters`, `/purchase-orders` or `/bills`, writes need `/masters`.
- **Never add a money column to a fact view.** Its `WHERE` and column list are the boundary; no policy stands behind them. `scripts/view-manifest.ts` pins every view's columns, guards, barrier/invoker flags and absent write grants, and `npm run db:check-views` runs on every pull request. Changing a view means changing its manifest row in the same commit, with a sentence saying why.
- **Never add a second SELECT policy to a gated table** — permissive policies OR together and the second is invisible. Widen the existing qual.
- **Redefining `crm_milestone_facts`, `crm_receipt_facts` or `business_plan_target_facts` must carry the three-way `WHERE` forward** — re-running `0056`/`0057` as they are strips Financial Management's access.

## Cross-tool reads and writes

STATUS.md's contract table lists every read a tool makes outside itself; it IS the contract. **One tool never imports another tool's code, and shared code never imports a tool's** — when two tools want the same read, the answer is a shared module (`lib/design-views/`, `lib/drawings/`), not an import. `lib/overview/` is the shell's home and the one module that may import tools' queries, each call wrapped so one tool's failure cannot take the home page down.

**No tool's code writes another tool's table**, except these, each deliberate:

- `indent_approvers` / `bill_approvers` are Settings'-owned, though they live in Indents' and Bills' migrations.
- The `projects_seed_schedule` trigger (`0045`): creating a project in Masters seeds Relay's schedule — declared by Relay's migration, so the coupling points the right way.
- Client Relations writes Masters (`0050`, `0051`) through two column-narrow definer functions and the `units_seed_engagement` trigger.
- Directory's `profiles_seed_staff_details` trigger (`0060`) gives every new account a blank card inside Settings' `inviteUser` — give `staff_details` a `not null` column without a default and `inviteUser` breaks. Plus `updateMyName`: a person's own `profiles.full_name`.
- Inventory resolves Supervisors' `issue_requests` (`0084`) — fulfil stamps `fulfilled_issue_id`, decline records a reason; `issue_requests_guard()` lets that side move only `requested → fulfilled/declined`.
- Selections proposes catalogue items: the "items proposable by selections app" INSERT policy admits `/selections` for `is_provisional` rows only, through the invoker function `create_item_request`; Masters approves or merges them later.

**A cross-tool trigger or definer function not listed here is what nobody finds until it misfires.**

`pusher_chain_state` has been redefined six times and has two readers outside Relay: a seventh definition must check Client Relations and Reporter, carry the `entry` lateral's clock-anchor exclusions forward, and re-issue the revokes.

## Reads

- **PostgREST caps a select at 1,000 rows.** Anything needing completeness goes through `fetchAll` (`lib/supabase/fetch-all.ts`), which throws if a page fails. Lists show "N of M" from a real count, never `rows.length`.
- **Always check `error`, not just `data`.** An empty result and a failed read mean opposite things; conflating them has destroyed priced budget lines, cleared drift warnings and re-opened double-buying.
- **An embed through a table with two FKs to the same target names the key** (`plots!units_plot_id_fkey`). A bare one answers HTTP 300 at runtime, and nothing local catches a bad `select` string — open the page, or run the query (BUGCATCHER #2).
