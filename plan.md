# Relay × Google Chat slash commands — approved build plan

Approved by the founder 2026-08-31, concept finalized in conversation. Pick up at **Phase 1**.

## What this is

A Google Chat **custom app** ("Relay bot") in the company's spaces: slash commands to open trails, check status, push, bounce, finish and mark with-client, answered with tappable cards. Private to the Goodearth Workspace, plain deterministic code — **no AI, no tokens, zero new running cost** (free Cloud project registration; runs on the existing Vercel + Supabase).

This is the app's **first unauthenticated POST endpoint** (nothing under `app/api/**` accepts one today) and first runtime call to an external service.

**Founder's settled choices:** all seven commands in round one; trails picked by **tappable card buttons**, never typed IDs; **actions post to the space, lookups stay private**; **spaces are scoped** — each space links to a unit or project, self-configured when the bot joins.

## Architecture — four trust steps on every command

1. **Prove it's Google — and OUR Google.** _(Corrected 2026-09-01 from Google's real tokens: new Chat apps register as Workspace add-ons, which sign with an ID token — issuer `https://accounts.google.com`, audience = the exact endpoint URL — not the classic `chat@system.gserviceaccount.com` / project-number pair.)_ Verify the token on every request with `node:crypto` against Google's OIDC certs: RS256, issuer `accounts.google.com`, audience = `GOOGLE_CHAT_AUDIENCE` (the registered URL), **and** email claim = `service-<projectNumber>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`, verified — the email check is load-bearing, because any Google service account can mint an ID token for our audience. No new library. Reject before reading the body.
2. **Prove the person.** Map the verified sender email → toolbox account (admin lookup, ~70 accounts); profile must be active. No match → polite refusal card.
3. **Act AS the person, never as the system.** The relay event guard (`supabase/migrations/0036_pusher.sql`, `pusher_chain_events_guard`) refuses `auth.uid() is null` — "Only a signed-in person can move a baton" — and stamps `actor_id` itself; it stays **untouched**. The adapter mints a short-lived real session (the proven smoke technique: admin `generateLink` email_otp → `verifyOtp` → mark session verified) and writes through a client bound to it. So `has_app('/relay')` RLS stays THE permission boundary, holder-only/bounce-note/leg-arithmetic rules are all enforced by the existing DB guard, every event is attributed to the real person, and the relay layer needs **zero changes**. Best-effort sign-out of the minted session afterwards. Trust note: the person's Google sign-in stands in for the app's 2FA here.
4. **Answer fast, plainly.** Google allows ~30s; always answer 200 with a card. DB guard messages ("This trail only has 3 legs") pass through as-is. Never throw out of the handler.

**Reads** (`/trail`, `/court`) skip step 3: after mapping, read `pusher_chain_state` via the admin client — the same view every relay list reads, under the everyone-signed-in-sees-every-trail invariant; same sanctioned pattern as `lib/client-relations/queries.ts` reading the view directly.

**Code home:** `app/api/google-chat/route.ts` (the door, added to `PUBLIC_PATHS` as an exact string) + `lib/google-chat/` (verify, identity, act-as, commands, cards, queries/writes). It never imports `lib/relay/queries.ts` or `actions.ts` — every function there opens `requireTool`, which needs a browser session. Its writes are the same one-line event inserts and RPCs relay's own actions use (`pushed`/`bounced`/`completed`/`client_held`/`client_returned`, `open_chain`), followed by the same `revalidatePath` set so app screens stay fresh behind chat.

**Space scoping:** new table `google_chat_spaces` — `space_id` (unique; Google's ID, stable across renames), `project_id` → projects, nullable `unit_id` with the composite `(project_id, unit_id)` FK like `pusher_chains`, `linked_by`, timestamps. RLS on, deny-all for signed-in roles, service-role only (the `login_attempts` idiom). On `ADDED_TO_SPACE` the bot name-matches the space against unit names (then project names), links on a confident match and announces it; `/link` (needs `/relay`) sets or changes it via dialog. **The rule:** in a linked space every command defaults to that unit/project; in a DM or unlinked space, commands span everything.

## The commands

| Command          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/court`         | Private card: your batons (scoped in a linked space), coldest first, day X of Y, stuck/with-client chips, Push / Bounce / more buttons per trail                                                                                                                                                                                                                                                                                   |
| `/push`          | Same card; tapping **Push** inserts `pushed` (guard enforces holder-or-admin, `to_leg = from_leg + 1`); confirmation posts publicly                                                                                                                                                                                                                                                                                                |
| `/bounce`        | Pick trail → dialog: target leg (any earlier, default previous), reason dropdown (`rework/missing_info/wrong_person/client_change/other`), mandatory note — a bounce is never silent in chat either; posts publicly                                                                                                                                                                                                                |
| `/finish`        | Last leg only (guard enforces); posts publicly with a small celebration                                                                                                                                                                                                                                                                                                                                                            |
| `/trail <words>` | Private status card(s): search by villa/project/activity/title; no words in a linked space → that unit's running trails; several matches → pick-list                                                                                                                                                                                                                                                                               |
| `/newtrail`      | Dialog: project → villa → trail type (pre-filled in a linked space); same `open_chain` path and defaults as `applyTrailSet` — people are never hand-picked in chat, each activity gets its usual person; unstaffed-activity errors surface in the dialog and send the person to the app's full form; **"Start immediately" toggle, on by default** (founder-approved — unlike the app's house queue, which queues); posts publicly |
| Hold / return    | Buttons on the court card (`client_held`/`client_returned`, note optional); posts publicly                                                                                                                                                                                                                                                                                                                                         |
| `/link`          | Bind this space to a project/unit; auto-runs on name match when the bot joins                                                                                                                                                                                                                                                                                                                                                      |

Visibility mechanics: private replies via `privateMessageViewer`; action confirmations as ordinary space messages.

## The phases

Branch `feature/google-chat`; each phase committed and pushed separately with a plain-English message; CI confirmed via `gh run list` (a successful push is not a green build).

- **Phase 1 — The door.** ✅ Done 2026-09-01 (`feature/google-chat`, PR #54). JWT verification + route handler answering every event with a friendly stub + `PUBLIC_PATHS` entry + env vars + pure-logic tests. _(Detailed below.)_ Verified locally: POST without/with garbage token → 401, GET → 405, other API paths still redirect. Note for Phase 2: Vercel's SSO protection blocks preview URLs entirely, so the Chat app endpoint must be `staging.goodearthkannur.org` (custom domain, unprotected) — a raw preview URL will never reach the route.
- **Phase 2 — Google-side setup (with the founder; needs Workspace admin).** ✅ Done 2026-09-01. Cloud project `goodearth-relay-staging` (number `172003223574`), Chat API on, staging app registered at the clean endpoint URL, bot live in a test space and DM — greets on join, answers messages and mentions. Hard-won knowledge: **(a)** Vercel's SSO protection also covered the staging custom domain and Google appears to validate the endpoint at save time, so **Vercel Authentication is now switched OFF for the project** (staging's login page is public, production's posture; the bypass-secret detour didn't survive because the secret would sit inside the signed token's audience). **(b)** Google saves after an endpoint change only start delivering after a re-save once the endpoint answers — re-save the config if deliveries seem dead. **(c)** Slash commands are declared (ids 1–7, `/court`…`/link`) and reached the door on 2026-09-02 — message/mention/join delivery took minutes, commands took overnight. **(d)** One command stayed dead while the other six worked: `/court`, whose description contained an em-dash. Google's client half-knew it (the space marked it "Only visible to you", the DM sent it as plain text) and the dispatcher never sent it — silently, with no "not responding" error. Retyping the description in plain ASCII fixed it within a minute. **Rule: plain ASCII in every command name and description.** The door now logs one line per event (`google-chat event {kind, space, commandId}`, never the text) — `npx vercel logs staging.goodearthkannur.org --json` is how "did Google send it?" gets answered.
- **Phase 3 — Identity.** ✅ Done 2026-09-02 (PR #56, vetted on staging). Email→person mapping, refusal cards for unlinked/inactive accounts. _(Detailed below.)_
- **Phase 4 — Space linking.** ✅ Done 2026-09-02 (PRs #57–#59, vetted on staging the same evening). _(Detailed below.)_ Migration `google_chat_spaces` (staging first: `npm run db:apply -- --project <ref> --commit`); `ADDED_TO_SPACE` auto-match + announcement; `/link` dialog.
- **Phase 5 — Reads.** `/trail` and `/court` cards, scope-aware.
- **Phase 6 — Writes, buttons first.** `act-as.ts` session minting (reuse the row-write inside `markSessionVerified` in `lib/auth/verified-session.ts`; extract a shared helper if it proves cookie-coupled); push / finish / hold / return via `CARD_CLICKED`; public confirmations; revalidation.
- **Phase 7 — Dialogs.** `/bounce`, then `/newtrail`.
- **Phase 8 — Docs & ship.** SECURITY.md: new sanctioned admin-client entry (email lookup, session minting, verified-session write, `google_chat_spaces`) + first webhook rule line; STATUS.md contract table rows (`google-chat` reads `pusher_chain_state`, `pusher_chain_legs`, `units`, `projects`); relay `PLAN.md` seams note. Then: **founder vets the staging bot in the test space** → migration to production, `db:compare` empty → **production** Chat app registered against the live site, env vars set in Vercel → `staging` → `master` → one real command pressed in production.

**Out of scope (later builds):** outbound notifications (bot announcing stuck trails, morning court summaries — relay PLAN.md's seam); other tools' commands; a replay/rate-limit table (Google's JWT `exp` suffices for round one — note the deferral in SECURITY.md).

---

## Phase 1 in detail — the door

**Goal:** a deployed endpoint that provably accepts only genuine Google Chat traffic and answers politely. No identity, no relay reads, no writes, no migration.

### Files

1. **`lib/google-chat/verify.ts`** — split for testability:
   - `verifyChatToken(token, keys, audience, nowSeconds)` — **pure**: decode header/payload, look up `kid` in `keys` (Map of kid → PEM), verify the RS256 signature via `node:crypto`, check `iss === "chat@system.gserviceaccount.com"`, `aud === audience`, `exp > nowSeconds`. Returns the claims or `null` — never throws.
   - `keyFromPem(pem)` — accepts an x509 cert (`new crypto.X509Certificate(pem).publicKey`) or a bare public key, so tests inject plain keys while production feeds Google's certs.
   - `getGoogleKeys()` — fetches `https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com` (kid → cert), module-scope cache honouring `Cache-Control: max-age`, stale-on-error fallback so a key rotation can't take the bot down.
   - `projectNumber()` — throw-by-name accessor for `GOOGLE_CHAT_PROJECT_NUMBER` (the `MARATHON_SESSION_SECRET` idiom from `lib/marathon/session.ts`).
2. **`app/api/google-chat/route.ts`** — `POST` only:
   - `Authorization: Bearer <token>` extracted; missing or failed verification → **401** plain text, before the body is read.
   - Optional allow-list: `GOOGLE_CHAT_ALLOWED_SPACES` (comma-separated space IDs; unset = allow all) → polite "this space isn't set up for Relay" text otherwise.
   - Dispatch, all 200 JSON: `ADDED_TO_SPACE` → hello text; `MESSAGE` → stub acknowledging the command by name; `REMOVED_FROM_SPACE` → empty 200.
   - Whole handler wrapped: unexpected error → 200 with plain-English "something went wrong on our side" text (a 500 shows a raw Google error to the user), `console.error` for Vercel logs.
3. **`lib/supabase/proxy.ts`** — add `"/api/google-chat"` to `PUBLIC_PATHS` (exact string, comment naming the JWT verifier as the real gate; omission = invisible 302 to the login page).
4. **`.env.local.example`** — `GOOGLE_CHAT_PROJECT_NUMBER` (server-only; the audience Google stamps; **different values staging vs production**) and optional `GOOGLE_CHAT_ALLOWED_SPACES`, each with a one-line comment.
5. **`lib/google-chat/verify.test.ts`** — no network: generate an RSA keypair in-test, sign tokens, assert valid passes and wrong-audience / wrong-issuer / expired / unknown-kid / mangled-signature / not-a-JWT all return `null`.

### Acceptance before Phase 2

- `npm test` green; full CI green confirmed via `gh run list`.
- Against the preview/staging deployment: `POST /api/google-chat` with no token → 401 (not a 302 — proves the `PUBLIC_PATHS` entry); garbage token → 401; `GET` → 405.
- Committed and pushed on `feature/google-chat`.

### What the founder sees after Phase 1

Nothing in chat yet — this phase is the locked door. The demo moment is the end of Phase 2, when the bot says hello in the test space. Phase 2 needs a short sit-down with Workspace admin access.

---

## Phase 3 in detail — identity

**Goal:** every command and message knows WHO typed it, as a toolbox account, before anything else happens. Refusals are polite, private and specific. Still no relay reads, no writes, no migration. Owner tags: `[Opus]` builds the mapping and the door; `[Sonnet]` writes the words; `[Fable]` reviews, and each commit carries its builder's own co-author line.

### The idea

Google names the sender on every event. The door turns that into one of six answers and never anything else:

| Decision   | Meaning                                                                        | What the person sees                                                                              |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `ok`       | A live toolbox account holding `/relay` (admins hold everything)               | The command proceeds — for Phase 3, the stub reply greets them by first name                      |
| `no-email` | Google sent no usable email (external user, a bot, or a shape we haven't seen) | "Google didn't tell me who you are, so I can't act for you. Ask an admin to check the Relay bot." |
| `unknown`  | The email matches no toolbox account                                           | "I don't know you yet: there's no toolbox account for this email. Ask an admin in Settings."      |
| `inactive` | The account exists and is deactivated                                          | "Your toolbox account is switched off, so I can't act for you. Ask an admin in Settings."         |
| `no-relay` | Live account, but no `/relay` grant                                            | "You don't have the Relay tool yet. Ask an admin to grant it in Settings."                        |
| `failed`   | The lookup itself broke (auth API down, profile read error)                    | "I couldn't check who you are just now. Please try again in a moment."                            |

Two things that never happen: the email is never logged or echoed, and the door never says more about who exists in the system than these fixed sentences.

**Admin-client use, sanctioned here:** the door has no browser session, so the email lookup (`auth.admin.listUsers`) and the profile-plus-grants read go through `createAdminClient()`. Both are reads of shell-owned tables, and the result is only ever a decision — the same shape as `markSessionVerified`. `SECURITY.md`'s sanctioned list gains one line in the same commit, not in Phase 8.

### Where the email is

Google's docs are silent on whether `chat.user.email` is populated for add-on-style events (the `User` resource lists no email; classic events carried `user.email` for same-Workspace users). So the code reads the first of `chat.user.email`, `chat.messagePayload.message.sender.email`, `chat.appCommandPayload.message.sender.email` that is a string, and treats absence as the `no-email` decision — a polite reply, not a crash. **The founder's first `/court` on staging after this deploys is the probe:** the log line says which decision was reached, and if it says `no-email` the fix is a shape change in one function, not a redesign. Also refused before any lookup: `chat.user.type === "BOT"`.

### Files

1. **`lib/google-chat/events.ts`** `[Opus]` — the `ChatEvent`/`ChatMessage`/`ChatSpace` types move here out of `route.ts`, and grow a `ChatUser` (`name?: string` — `users/<id>`; `displayName?`; `email?`; `type?: "HUMAN" | "BOT" | string`) on `chat.user` and on `message.sender`. Plus pure helpers, tested in `events.test.ts`: `senderEmail(event): string | null` (trimmed, lower-cased, must contain `@`, null for a BOT sender), `senderName(event): string | null` (the `users/…` resource name, for private replies), and `spaceName(event)` / `commandId(event)` lifted from the route so it reads as dispatch only. The `COMMANDS` map moves here too.
2. **`lib/google-chat/identity.ts`** `[Opus]` — split pure/impure. _(Built as two files, Fable 2026-09-02: `identity-rules.ts` holds the pure `decideIdentity`, the `Identity` type and `IdentityProfile` and imports nothing; `identity.ts` carries `import "server-only"` and only `resolveIdentity`, re-exporting the type — the `lib/indents/pull-rules.ts` precedent, and the only shape a pure test can import.)_
   - `export type Identity = { kind: "ok"; userId: string; fullName: string | null; firstName: string; isAdmin: boolean; grantedApps: string[] } | { kind: "no-email" | "unknown" | "inactive" | "no-relay" | "failed" }`.
   - `decideIdentity(email: string | null, authUser: { id: string } | null, profile: { id: string; full_name: string | null; role: string; is_active: boolean; apps: string[] } | null): Identity` — **pure**, no I/O, the whole decision table above in one function. Admin (`role === "admin"`) counts as holding `/relay`. `firstName` is the first word of `full_name`, or `"there"` when blank, so the greeting reads "Hi there".
   - `resolveIdentity(event): Promise<Identity>` — the I/O wrapper: `senderEmail` → `null` short-circuits to `no-email`; `admin.auth.admin.listUsers({ perPage: 1000 })` and a case-insensitive match on `user.email` (about 70 accounts, one page; **the `perPage` is load-bearing** — the default page is 50 and would silently miss people); then the profile read with the exact `dal.ts` select — `id, full_name, role, is_active, user_apps(app), roles!profiles_role_id_fkey(role_apps(app))` — **the FK is named** (BUGCATCHER #2). Any `error` → `failed` with a `console.error` that never includes the email. Never throws.
   - `lib/google-chat/identity-rules.test.ts` `[Opus]` — `decideIdentity` for all six decisions, plus: an admin with no explicit grant is `ok`; a grant through a role bundle is `ok`; a profile row for a different id than the auth user is `failed`.
3. **`lib/google-chat/cards.ts`** `[Sonnet]` — words only, no I/O: `identityRefusal(kind: Exclude<Identity["kind"], "ok">): string` returning the six-table sentences above verbatim, and `greeting(firstName: string, command: string | null): string` for the Phase 3 stub ("Hi Siddharth! I heard /court — it isn't wired up yet, but now I know who's asking." / without a command: "Hi Siddharth! Slash commands are on their way — nothing to run just yet."). Message text may use em-dashes; trap (d) was about the command _description_ field in Google's console, not about replies. `cards.test.ts` `[Sonnet]` pins every sentence and that no text contains an `@`.
4. **`app/api/google-chat/route.ts`** `[Opus]` —
   - imports the types and helpers from `events.ts`; keeps the token gate and allowed-spaces logic byte-for-byte.
   - `card(text)` gains an optional viewer: `card(text, privateTo?: string)` sets `message.privateMessageViewer = { name: privateTo }` when given — refusals go private to the sender; the `ADDED_TO_SPACE` hello stays public. If Google rejects the field inside the add-on envelope, the fallback is a public reply, noted in the phase's trap list — not a debugging round.
   - After the allow-list check, for `messagePayload` and `appCommandPayload` events only: `const identity = await resolveIdentity(event)`. Not `ok` → `card(identityRefusal(identity.kind), senderName(event))`. `ok` → the existing stub, now `greeting(identity.firstName, commandName)`.
   - The one log line gains `sender: identity.kind` (and stays free of the email and the text). `ADDED_TO_SPACE`/`REMOVED` never look up identity.
   - The outer `try` still turns any surprise into the polite 200.
5. **`SECURITY.md`** `[Opus]` — the sanctioned-exceptions sentence in "Auth and permissions" gains the Google Chat door's `lib/google-chat/identity.ts` (email → account lookup via the auth admin API plus a profile-and-grants read — reads only, no session, decision-only).
6. **`lib/supabase/admin.ts`** `[Opus]` — its comment names the Chat door as a caller (one line).

### What is NOT in Phase 3

No session minting (Phase 6), no relay reads (Phase 5), no `google_chat_spaces` (Phase 4), no per-Google-user cache table (round-one deferral; the auth API is one call per command at this size), no domain allow-list beyond "matches an existing account".

### Acceptance

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` green locally; full CI green via `gh run list`.
- On staging, in the test space: the founder types `/court` and sees a greeting with their first name, visible only to them. The refusal paths are proven by the tests; never deactivate a real colleague to try one. If a Workspace member without a toolbox account is at hand, their `/court` proves `unknown`.
- `npx vercel logs staging.goodearthkannur.org --json` shows `sender: "ok"` on the founder's command.

### What the founder sees after Phase 3

The bot greets you by name and knows which command you asked for; anyone without an account or without the Relay tool is told so, privately. Still no trails moving — that is Phases 5 and 6.

### Steps, ticked as they land

- [x] `[Opus]` `events.ts` + `events.test.ts`, `identity-rules.ts` + `identity-rules.test.ts`, `identity.ts`, route wiring, `SECURITY.md` line, `admin.ts` comment. _(2026-09-02; prettier, lint, typecheck, tests and check:actions green locally.)_
- [x] `[Sonnet]` `cards.ts` + `cards.test.ts`.
- [ ] `[Fable]` review the diff against this section and `SECURITY.md`; builders commit with their own co-author lines; push `feature/google-chat`; CI green; PR into `staging`.
- [x] Founder vets on staging (the probe above); trap list updated if the email lived somewhere else. _(2026-09-02 evening: `/court` in the DM answered "Hi Siddharth! I heard /court…", marked "Only visible to you". So: Google DOES send the sender's email on add-on-style events, `senderEmail` finds it, and `privateMessageViewer` works inside the `createMessageAction` envelope — two open questions closed by one screenshot.)_

### Questions for the tier above

**Q1 `[Opus]`, 2026-09-02 — `identity.ts` cannot be both `server-only` and testable.** `server-only` is not an installed package here (only Next's bundler and a type declaration know it), so `tsx --test` dies with `Cannot find module 'server-only'` the moment a test imports such a file — and `lib/supabase/admin.ts` carries the same import, so even a static `createAdminClient` import breaks the test.

Resolved by Fable 2026-09-02: split into identity-rules.ts (pure) + identity.ts (server-only), the pull-rules precedent.

**Q2 `[Opus]`, 2026-09-02 — the plain-message reply is now private too.** The plan's acceptance says the `/court` greeting is "visible only to them", and refusals are private; it doesn't say what a plain non-command message gets. Phase 1's reply to a plain message was public. It is now private as well, on the reading that everything about one person stays private until Phase 6 starts posting action confirmations. Easy to flip back if the founder wants the bot audible when someone just says hello. Accepted by Fable 2026-09-02.

---

## Phase 4 in detail — space linking

**Goal:** a space knows which villa or project it is for. The bot works it out from the space's name when it joins, `/link` sets or changes it, and the answer is stored once in one deny-all table. Later phases read it to scope `/court`, `/trail` and `/newtrail`; this phase only stores and announces it. Owner tags: `[Fable]` the migration and its application; `[Opus]` the matching, the storage module and the door; `[Sonnet]` the words and the dialog card; `[Founder]` one tick in Google's console.

### The idea

- **The table** — `google_chat_spaces` (`0094`): `space_id` (Google's stable `spaces/…` id, primary key), `space_name` (a label, never a key), `project_id` (not null), `unit_id` (null = the whole project), the `0036` composite FK so a villa must belong to its project, `linked_by` (null when the bot did it on joining), timestamps. RLS on, **zero policies**, every privilege revoked from `public`/`anon`/`authenticated` by name, assertion at the end — the `0062` idiom, because only the door's service-role client ever touches it.
- **Joining** (`ADDED_TO_SPACE`): a DM is never linked. For a space, the display name is matched against every villa and every project (rule below). Exactly one villa → link it and say so publicly ("I've linked this space to Saarang · Villa 12. Commands here default to it; /link changes that."). No villa but exactly one project → link the project. Nothing or several → the plain hello plus "Use /link to tell me which villa or project this space is for." No identity check on joining: whoever can add the bot to a space may let it read the space's name.
- **`/link`** (identity `ok` required, as every command): in a DM, "A DM can't be linked — commands here already span everything." In a space, Google opens a **dialog**: one dropdown, "Link this space to", listing "Not linked — commands here span everything", every project as "Saarang (whole project)", every villa as "Saarang · Villa 12" (about fifty rows today — one list, no dependent dropdowns; simple beats clever), current choice pre-selected, a Save button. Submit → upsert (or delete for "Not linked") with `linked_by` = the person → the dialog closes and a **public** confirmation posts ("This space is now linked to Saarang · Villa 12." / "This space is no longer linked."). Cancel → the dialog just closes.
- **The matching rule** (pure, tested): lower-case, split into tokens on anything that isn't a letter or digit. A villa or project matches when its name's tokens appear as a **contiguous run** of the space's tokens, or the space's tokens as a run of its name's, or its code equals one token. Villas are tried first; exactly one match wins, several is ambiguous (no link, say so), none falls through to projects the same way. Pinned examples: "Saarang Villa 12" → Villa 12, never Villa 1; "Villa 12 - site chat" → Villa 12; "V12 updates" → Villa 12 by code; "Saarang" → the project; "Baveli 1" → Baveli's unit named "1"; "Villa" alone → ambiguous; "Design team" → none.

### Where Google's dialog machinery lives (read before touching the door)

Add-on-style apps answer a dialog request with `{ action: { navigations: [{ pushCard: <card> }] } }` — **not** the `hostAppDataAction` envelope the text replies use. The command arrives as `appCommandPayload` with `isDialogEvent: true` and `dialogEventType: "REQUEST_DIALOG"` **only if "Opens a dialog" is ticked on that command in the Chat app's configuration** — otherwise it arrives as an ordinary command and a pushCard answer goes nowhere. The submitted form arrives as `buttonClickedPayload` with `dialogEventType: "SUBMIT_DIALOG"` and the values under `commonEventObject.formInputs.<name>.stringInputs.value[0]`. Closing is `{ action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }] }, hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text } } } } }` — the public confirmation rides along on the close. Cancel is `dialogEventType: "CANCEL_DIALOG"`. **Two traps from the first vet (2026-09-02): (e)** for an HTTP app a button's `onClick.action.function` is a **URL** — the door's own registered endpoint URL, `chatAudience()` — not a name; with "link" there Google showed "the app is not responding" and never called us. **(f)** once Google has asked for a dialog, every answer must BE a dialog: a message envelope in reply to `REQUEST_DIALOG` is "invalid" ("Could not load dialog"), so a refusal at that moment is a one-paragraph `noticeDialog`. **(g)** answering a `SUBMIT_DIALOG`: the public confirmation is the `hostAppDataAction`/`createMessageAction` envelope ALONE — it closes the dialog by itself; putting `endNavigation` beside it is "invalid" (second vet). A private word on closing is `action.notification.text` (a toast) on the close navigation; a bare close is the navigation alone.

### Files

1. **`supabase/migrations/0094_google_chat_spaces.sql`** `[Fable]` — drafted as above. Applied to **staging only** (`npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`), then `npm run db:types:staging`, both committed together. Production waits for Phase 8's ship, as every migration does.
2. **`lib/google-chat/events.ts`** `[Opus]` — the types grow: `ChatSpace` gets `type?: "ROOM" | "DM" | string` and `spaceType?: "SPACE" | "GROUP_CHAT" | "DIRECT_MESSAGE" | string`; `appCommandPayload` gets `isDialogEvent?: boolean` and `dialogEventType?: string`; a new `buttonClickedPayload?: { message?; space?; isDialogEvent?; dialogEventType?; }`; and top-level `commonEventObject?: { formInputs?: Record<string, { stringInputs?: { value?: string[] } }>; invokedFunction?: string; parameters?: Record<string, string> }`. New pure helpers, tested in `events.test.ts`: `isDirectMessage(event)` (either field), `spaceDisplayName(event)`, `dialogEventType(event): "REQUEST_DIALOG" | "SUBMIT_DIALOG" | "CANCEL_DIALOG" | null`, `formValue(event, name): string | null`; `spaceName` and `senders` learn the `buttonClickedPayload`.
3. **`lib/google-chat/space-match.ts`** `[Opus]` — pure, imports nothing: `matchSpaceName(displayName, units: { id; name; code: string | null; projectId }[], projects: { id; name; code: string | null }[]): { kind: "unit"; unitId; projectId } | { kind: "project"; projectId } | { kind: "ambiguous"; count } | { kind: "none" }`, the rule above. `space-match.test.ts` `[Opus]` pins every example listed and that an empty display name is `none`.
4. **`lib/google-chat/spaces.ts`** `[Opus]` — `server-only`, admin client: `listLinkTargets()` → `{ projects: { id, name, code }[]; units: { id, name, code, projectId }[] }` (read to completion with `fetchAll`; the one shared read of `projects`/`units` names — every signed-in person can read these tables anyway); `getSpaceLink(spaceId)` → `{ projectId; unitId; label } | null` where `label` is "Saarang · Villa 12" or "Saarang (whole project)"; `linkSpace({ spaceId, spaceName, projectId, unitId, linkedBy })` — upsert on `space_id`; `unlinkSpace(spaceId)`. Every `error` checked, `console.error` without the space's people, never throws — a failed write returns `false` and the door says "I couldn't save that just now."
5. **`lib/google-chat/cards.ts`** `[Sonnet]` — still words and plain objects, no I/O: `joinHello(label: string | null)`; `dmCannotLink()`; `dialogNotEnabled()` ("The /link command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console."); `linkSaveFailed()`; `linkConfirmation(label: string | null)`; and `linkDialog(targets: { value: string; text: string }[], current: string)` returning the pushCard object: one section, a `selectionInput` (`name: "target"`, `type: "DROPDOWN"`, `label: "Link this space to"`, items with `selected` on `current`), a `buttonList` with one "Save" button whose `onClick.action.function` is `"link"`. Values are `none`, `project:<id>`, `unit:<id>`. `cards.test.ts` grows to pin each sentence, the dialog's shape, and that the selected item is the current one.
6. **`app/api/google-chat/route.ts`** `[Opus]` —
   - `ADDED_TO_SPACE`: DM → the existing hello. Space → `listLinkTargets()` + `matchSpaceName(spaceDisplayName)`; unit/project → `linkSpace` with `linkedBy: null` → `joinHello(label)`; ambiguous/none → `joinHello(null)`. Public, as today.
   - `/link` (id 7) with identity `ok`: DM → `card(dmCannotLink(), privateTo)`. `dialogEventType === "REQUEST_DIALOG"` → `Response.json({ action: { navigations: [{ pushCard: linkDialog(targets, current) }] } })` where `current` comes from `getSpaceLink`. Any other shape → `card(dialogNotEnabled(), privateTo)` — the console tick is missing.
   - `buttonClickedPayload`: identity `ok` required (a refusal answers with the close-dialog envelope plus the refusal as a private message). `SUBMIT_DIALOG` → `formValue("target")` → `none` → `unlinkSpace`; `unit:`/`project:` → `linkSpace` with `linkedBy: identity.userId` → close + public `linkConfirmation(label)`; a failed write → close + private `linkSaveFailed()`. `CANCEL_DIALOG` → close only.
   - The log line gains `dialog: dialogEventType(event)`. Every other command still gets the Phase 3 greeting — scoping them is Phase 5.
7. **`SECURITY.md`** `[Opus]` — the identity.ts entry in the sanctioned list widens to "`lib/google-chat/identity.ts` and `spaces.ts` (… plus `google_chat_spaces`, the one deny-all table the door owns, and the `projects`/`units` name reads)". `TODO.md`'s Google Chat paragraph is Fable's at the end.
8. **Google console** `[Founder]`, with Fable in the chair: on the staging Chat app, edit command id 7 (`/link`) and tick **"Opens a dialog"**; keep its description plain ASCII (trap (d)). Without the tick the bot answers `/link` with the sentence in item 5 rather than a dialog — so the misconfiguration explains itself.

### What is NOT in Phase 4

No scoping of the other commands (Phase 5 reads `getSpaceLink`), no screen in the app listing links, no re-matching on a space rename (Google sends no event for it; `/link` is the fix), no multi-villa spaces.

### Acceptance

- `0094` applied to staging via `db:apply`, `db:types:staging` committed with it; `npm run db:check -- --project ipstebqawrvhkyntctrv` clean.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:actions` green locally; CI green on the PR via `gh run list`.
- Staging vet, in this order: **(a)** rename the test space to "Saarang Villa 12", remove the bot and add it back → it announces the link to Saarang · Villa 12; **(b)** `/link` → a dialog with the dropdown pre-selected on Villa 12 → choose "Saarang (whole project)" → Save → a public "This space is now linked to Saarang (whole project)."; **(c)** in the DM, `/link` → "A DM can't be linked…". If (b) answers with the "needs 'Opens a dialog'" sentence, item 8 is missing.

### What the founder sees after Phase 4

Add the bot to a space named after a villa and it says which villa it is working for; `/link` opens a picker to change that. Still no trails moving.

### Steps, ticked as they land

- [x] `[Fable]` `0094` drafted, applied to staging, types regenerated, committed. _(fde2def, 2026-09-02; db:check level on staging.)_
- [x] `[Opus]` `events.ts` growth + tests, `space-match.ts` + tests, `spaces.ts`, route wiring, `SECURITY.md` line. _(2026-09-02; prettier, lint, typecheck, tests and check:actions green locally. Not committed — Fable reviews first.)_
- [x] `[Sonnet]` `cards.ts` growth + tests.
- [x] `[Fable]` review; builders commit under their own names; push; CI; PR into `staging`. _(PR #57 merged 2026-09-02; two follow-up fixes from the vet, PRs #58 and #59 — traps (e), (f), (g) above.)_
- [x] `[Founder]` "Opens a dialog" ticked on `/link`; staging vet (a)–(c). _(2026-09-02 evening: the renamed space auto-linked to Saarang · Villa 12 on join; `/link` opened the dropdown, Save closed it and posted "This space is now linked to Saarang (whole project)." publicly; `/link` in the DM showed the one-paragraph notice dialog.)_

### Questions for the tier above

**Q1 `[Opus]`, 2026-09-02 — the matching rule, read literally, makes "Villa" alone `none`, not `ambiguous`.** The rule says a candidate matches when "its name's tokens appear as a contiguous run of the space's tokens": "Villa" does not contain "Villa 12", so under that reading a space called just "Villa" matches nothing, while the pinned example says it is ambiguous. Implemented as **symmetric** containment instead — one name's tokens must be a contiguous run of the other's, either way round — which makes every pinned example come out as written, "Saarang Villa 12" → Villa 12 (never Villa 1) included, because contiguity is what keeps those apart. The practical difference is only ever `ambiguous` vs `none`, and Phase 4 answers both with the same sentence; narrowing it back to one direction is a two-line change if that reading was meant. Accepted by Fable 2026-09-02: symmetric containment is the rule; the plan's one-direction wording was the inconsistency, not the code.

**Q2 `[Opus]`, 2026-09-02 — what `/link` says when the villa list itself can't be read.** The phase names five sentences and none covers "I couldn't load the list" — `linkSaveFailed()` is about a write. Rather than invent a sixth sentence in someone else's file, that path reuses the door's existing "Something went wrong on our side. Please try again in a moment.", now a named constant in route.ts and shared with the outer catch. A failed read on **joining** just gives the unlinked hello, which already says to use `/link`. Accepted by Fable 2026-09-02.
