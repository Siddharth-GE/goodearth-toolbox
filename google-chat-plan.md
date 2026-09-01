# Relay × Google Chat slash commands — approved build plan

Approved by the founder 2026-08-31, concept finalized in conversation. Pick up at **Phase 1**.

## What this is

A Google Chat **custom app** ("Relay bot") in the company's spaces: slash commands to open trails, check status, push, bounce, finish and mark with-client, answered with tappable cards. Private to the Goodearth Workspace, plain deterministic code — **no AI, no tokens, zero new running cost** (free Cloud project registration; runs on the existing Vercel + Supabase).

This is the app's **first unauthenticated POST endpoint** (nothing under `app/api/**` accepts one today) and first runtime call to an external service.

**Founder's settled choices:** all seven commands in round one; trails picked by **tappable card buttons**, never typed IDs; **actions post to the space, lookups stay private**; **spaces are scoped** — each space links to a unit or project, self-configured when the bot joins.

## Architecture — four trust steps on every command

1. **Prove it's Google.** Verify the Google-signed JWT on every request (issuer `chat@system.gserviceaccount.com`, audience = our Cloud project number) with `node:crypto` against Google's published certs. No new library. Reject before reading the body.
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
- **Phase 2 — Google-side setup (with the founder; needs Workspace admin).** Free Cloud project, Chat API on, **staging** Chat app registered (endpoint `https://staging.goodearthkannur.org/api/google-chat`, slash commands declared), bot added to a test space. Acceptance: the stub says hello in chat.
- **Phase 3 — Identity.** Email→person mapping, refusal cards for unlinked/inactive accounts.
- **Phase 4 — Space linking.** Migration `google_chat_spaces` (staging first: `npm run db:apply -- --project <ref> --commit`); `ADDED_TO_SPACE` auto-match + announcement; `/link` dialog.
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
