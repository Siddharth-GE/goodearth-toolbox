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

- **Phase 1 — The door.** ✅ Done 2026-09-01 (`feature/google-chat`, PR #54). JWT verification + route handler answering every event with a friendly stub + `PUBLIC_PATHS` entry + env vars + pure-logic tests. _(Short form below; full detail in git.)_ Verified locally: POST without/with garbage token → 401, GET → 405, other API paths still redirect. Note for Phase 2: Vercel's SSO protection blocks preview URLs entirely, so the Chat app endpoint must be `staging.goodearthkannur.org` (custom domain, unprotected) — a raw preview URL will never reach the route.
- **Phase 2 — Google-side setup (with the founder; needs Workspace admin).** ✅ Done 2026-09-01. Cloud project `goodearth-relay-staging` (number `172003223574`), Chat API on, staging app registered at the clean endpoint URL, bot live in a test space and DM — greets on join, answers messages and mentions. Hard-won knowledge: **(a)** Vercel's SSO protection also covered the staging custom domain and Google appears to validate the endpoint at save time, so **Vercel Authentication is now switched OFF for the project** (staging's login page is public, production's posture; the bypass-secret detour didn't survive because the secret would sit inside the signed token's audience). **(b)** Google saves after an endpoint change only start delivering after a re-save once the endpoint answers — re-save the config if deliveries seem dead. **(c)** Slash commands are declared (ids 1–7, `/court`…`/link`) and reached the door on 2026-09-02 — message/mention/join delivery took minutes, commands took overnight. **(d)** One command stayed dead while the other six worked: `/court`, whose description contained an em-dash. Google's client half-knew it (the space marked it "Only visible to you", the DM sent it as plain text) and the dispatcher never sent it — silently, with no "not responding" error. Retyping the description in plain ASCII fixed it within a minute. **Rule: plain ASCII in every command name and description.** The door now logs one line per event (`google-chat event {kind, space, commandId}`, never the text) — `npx vercel logs staging.goodearthkannur.org --json` is how "did Google send it?" gets answered.
- **Phase 3 — Identity.** ✅ Done 2026-09-02 (PR #56, vetted on staging). Email→person mapping, refusal cards for unlinked/inactive accounts. _(Short form below; full detail in git.)_
- **Phase 4 — Space linking.** ✅ Done 2026-09-02 (PRs #57–#59, vetted on staging the same evening). _(Short form below; full detail in git.)_ Migration `google_chat_spaces` (staging first: `npm run db:apply -- --project <ref> --commit`); `ADDED_TO_SPACE` auto-match + announcement; `/link` dialog.
- **Phase 5 — Reads.** `/trail` and `/court` cards, scope-aware. **Detail written 2026-09-03 (below) — build next.**
- **Phase 6 — Writes, buttons first.** `act-as.ts` session minting (reuse the row-write inside `markSessionVerified` in `lib/auth/verified-session.ts`; extract a shared helper if it proves cookie-coupled); push / finish / hold / return via `CARD_CLICKED`; public confirmations; revalidation.
- **Phase 7 — Dialogs.** `/bounce`, then `/newtrail`.
- **Phase 8 — Docs & ship.** SECURITY.md: new sanctioned admin-client entry (email lookup, session minting, verified-session write, `google_chat_spaces`) + first webhook rule line; STATUS.md contract table rows (`google-chat` reads `pusher_chain_state`, `pusher_chain_legs`, `units`, `projects`); relay `PLAN.md` seams note. Then: **founder vets the staging bot in the test space** → migration to production, `db:compare` empty → **production** Chat app registered against the live site, env vars set in Vercel → `staging` → `master` → one real command pressed in production.

**Out of scope (later builds):** outbound notifications (bot announcing stuck trails, morning court summaries — relay PLAN.md's seam); other tools' commands; a replay/rate-limit table (Google's JWT `exp` suffices for round one — note the deferral in SECURITY.md).

---

## What Phases 1–4 left behind (the short form — full detail is in git: `git show b89f06b:plan.md`)

**Code map, `lib/google-chat/`:** `verify.ts` (the lock: RS256 + issuer + audience + service-agent email, pure and tested) · `events.ts` (Google's envelope types and the pure readers: sender email/name, space id/display name, DM check, command id, dialog step, form values) · `identity-rules.ts` (pure decision table: `ok` / `no-email` / `unknown` / `inactive` / `no-relay` / `failed`) · `identity.ts` (server-only: `listUsers({perPage:1000})` + the named-FK profile read, admin client, never throws) · `space-match.ts` (pure: symmetric token-run matching of a space name to a villa or project, labels, dropdown rows) · `spaces.ts` (server-only: `google_chat_spaces` reads/writes + project/unit names) · `cards.ts` (every sentence the bot says, the `/link` dialog card, the notice dialog) · `app/api/google-chat/route.ts` (the door: token gate → allow-list → identity → dispatch; `card()` for messages, `pushCard()` for dialogs, `closeDialog()` for submits). Pure files are tested; `server-only` files cannot be imported by `tsx --test`, which is why the rules live apart from the reads.

**Invariants to keep:** every reply about one person is private (`privateMessageViewer`); the log line never carries message text or an email; identity `ok` (live account holding `/relay`, or admin) gates every command and button; joining a space needs no identity; `0094` is on **staging only** until Phase 8.

**Google traps, all learned the hard way (with (a)–(d) in the Phase 2 bullet above):**

- **(e)** For an HTTP app a card button's `onClick.action.function` is a **URL** — the door's registered endpoint, `chatAudience()` — never a name. With a name there, Google shows "the app is not responding" and never calls the door.
- **(f)** Once Google has asked for a dialog (`appCommandPayload.dialogEventType: "REQUEST_DIALOG"`, only sent when "Opens a dialog" is ticked on that command in the console), every answer must BE a dialog: `{ action: { navigations: [{ pushCard }] } }`. A message envelope there is "Could not load dialog". A refusal at that moment is a one-paragraph `noticeDialog`.
- **(g)** Answering a `SUBMIT_DIALOG` (`buttonClickedPayload`, values under `commonEventObject.formInputs.<name>.stringInputs.value[0]`): the public confirmation is the `hostAppDataAction`/`createMessageAction` envelope **alone** — it closes the dialog by itself, and `endNavigation` beside it is invalid. A private word on closing is `action.notification.text` (a toast) on the close navigation; a bare close is the navigation alone.
- Google does send the sender's email on add-on-style events (`chat.user.email`), and `privateMessageViewer` works inside `createMessageAction`.

## Phase 5 in detail — reads (written by Fable, 2026-09-03)

**The idea.** The bot answers two questions without touching anything: _what is in my hand?_ (`/court`) and _where is that trail?_ (`/trail <words>`). Both are private cards built from `pusher_chain_state` — the same view every relay list reads, so the chat answer and the app's court can never disagree about who holds what or how cold it is. A linked space narrows both answers to its villa or project; a DM or an unlinked space spans everything. The card carries **no action buttons yet**: each trail gets one _Open in the toolbox_ link, and the Push / Bounce / Finish / Hold buttons arrive in Phase 6, which is "buttons first" precisely so this phase can ship a card that cannot show "the app is not responding" (trap (e) — a callback button with nothing behind it is exactly that).

**Why reads go through the admin client, and nothing else does.** The door has no browser session, and `lib/relay/queries.ts` opens every function with `requireTool`, so it cannot be imported (the architecture section's rule, and Client Relations' own reason for reading the view directly). The identity step already proved the person holds `/relay` or is an admin, and the view is granted to every signed-in person with no gate of its own — so an admin-client `select` on it, filtered to that person, reveals nothing the same person couldn't open at `/relay/court`. Two shared reads ride with it and nothing more: `pusher_chain_legs` (the current leg's label) and `profiles.full_name` (holder names on `/trail`). No migration. `0094` stays staging-only.

### Files, with owners

1. **`lib/google-chat/trail-rules.ts`** — pure, may import nothing but types. `[Sonnet]`, tests in `trail-rules.test.ts`.
   - `TrailSummary`: the one row shape both cards read — `chainId, projectName, unitName, activityName, title, currentLeg, legCount, legLabel, holderName, daysInLeg, expectedDays, isStuck, isWithClient, withClientDays`.
   - `Scope = { kind: "all" } | { kind: "project"; projectId } | { kind: "unit"; unitId }` and `scopeOf(link: SpaceLink | null): Scope` — unit link → unit, project link → project, null → all. (`SpaceLink` from `spaces.ts` by **type import only**, so the file stays importable by `tsx --test`.)
   - `searchWords(text: string): string[]` — lower-cased, trimmed, punctuation stripped, empty for blank input. Same idea as `space-match.ts`'s `tokens()` but _not_ a run match: a trail matches when **every word** is a substring of the joined `projectName · unitName · activityName · title` (case-insensitive). "villa 12" finds "Villa 12 — Structural drawings"; "12" alone finds every villa with a 12 in it, which is fine — the card lists up to ten.
   - `orderColdestFirst(rows)`: `isStuck` desc, then `daysInLeg` desc, then `chainId` — the app's order, restated once in Node because the court is split by scope there.
   - `CARD_LIMIT = 10` and `takeForCard(rows) → { shown, more }`.
2. **`lib/google-chat/relay-reads.ts`** — `server-only`, admin client, never throws (null on failure, logged, the `spaces.ts` shape). `[Sonnet]`, vetted by `[Opus]` before commit.
   - `listCourt(userId): Promise<TrailSummary[] | null>` — `fetchAll` over `pusher_chain_state` where `holder_id = userId` and `is_finished = false`, ordered as `listMyCourt` orders (`is_stuck` desc, `days_in_leg` desc, `chain_id`). **Unscoped on purpose**: the door splits it by scope in Node so the linked-space card can say "and N more elsewhere" from one read.
   - `listRunning(scope): Promise<TrailSummary[] | null>` — `fetchAll` over the view where `is_finished = false` **and `is_queued = false`** (a queued trail has no holder and no clock, and the app's running list excludes it for the same reason — relay `PLAN.md`), plus `eq("unit_id")` or `eq("project_id")` per scope. Word matching happens in Node with `searchWords` — no `.or(ilike...)` string, because a bad PostgREST filter is invisible to every CI gate (BUGCATCHER: a green build proves nothing about a select string).
   - Both end in the same enrichment: one `in("chain_id", …)` read of `pusher_chain_legs` for the `leg_no = current_leg` labels, and one `in("id", …)` read of `profiles(id, full_name)` for holder names. The view's column list from `lib/relay/queries.ts` is **copied, not imported** (one tool never imports another's code; the columns are the contract row STATUS.md gains in Phase 8).
   - No embeds anywhere: the view is flat, and the legs and profiles reads are plain tables by design.
3. **`lib/google-chat/cards.ts`** — grows two builders and their sentences. `[Sonnet]`, tests in `cards.test.ts`.
   - `courtCard({ firstName, scopeLabel, rows, moreElsewhere, more, origin })` → one `cardsV2` entry: header _Your court_ (subtitle: the scope label, or _everything_); one `decoratedText` per trail — top label `Project · Villa`, text `<b>activity</b>` (title beneath if set), bottom label **"Leg 2 of 5 · Structural drawings — day 4 of 3, cold"** / **"… with the client 6 days"** / **"… on time"**; a `buttonList` with one `openLink` to `${origin}/relay/trails/${chainId}`. A footer paragraph when `more > 0` ("and N more — open your court in the toolbox", linking `${origin}/relay/court`) and when `moreElsewhere > 0` ("You also hold N outside this space."). An empty court is the app's own sentence: _Court cleared — nothing is waiting on you._
   - `trailCard({ words, scopeLabel, rows, more, origin })` — the same row widget plus the holder's name in the bottom label ("with Anil, day 4 of 3, cold"); header _Trails_, subtitle `matching 'villa 12'` or the scope label. No match: _Nothing running matches 'villa 12'. Finished and waiting trails are in the toolbox._ with the `/relay/trails` link. No words in a DM or an unlinked space: _Tell me what to look for — a villa, a project or an activity, e.g. /trail villa 12._
   - Day sentences are pure string work on the row — **no date maths in this phase**: `days_in_leg`, `expected_days` and `with_client_days` come from the view, which is the one IST-day clock (relay `PLAN.md`), so the bot never disagrees with the app by a day.
   - `origin` is `new URL(chatAudience()).origin` — the registered endpoint's own host, so staging links to staging and production to production with **no new env var** (BUGCATCHER #7's hardcoded-URL lesson).
4. **`app/api/google-chat/route.ts`** — dispatch only. `[Opus]`.
   - `/court` (id 1) → `getSpaceLink(spaceId)` → `listCourt(identity.userId)` → split by `scopeOf(link)` → private `courtCard`.
   - `/trail` (id 5) → words from the message: add a pure `commandText(event)` reader to `events.ts` (`appCommandPayload.message.argumentText`, falling back to `text` with the leading `/trail` stripped; tested) → `listRunning(scope)` → filter by words → private `trailCard`. No words and `scope.kind === "all"` → the "tell me what to look for" sentence, no read.
   - `/push` (2), `/bounce` (3), `/finish` (4) → the **same court card** with one extra subtitle line: _Push, Bounce and Finish buttons arrive with the next release — Open a trail to move it in the toolbox._ One line of dispatch, and three commands stop saying "isn't wired up yet". `/newtrail` (6) keeps the Phase 3 greeting.
   - A null from either read → the existing `SOMETHING_WENT_WRONG` sentence, private.
   - `card()` learns to carry `cardsV2` beside `text`: `createMessageAction.message` takes `{ text?, cardsV2?, privateMessageViewer? }`. **Step 1 proves this envelope before any read exists.**

### Steps, in order

- [ ] **1. Prove the card envelope on staging.** `[Opus]` Hard-code one `cardsV2` card (header, one decoratedText, one openLink button) behind `/court`, push the branch so staging deploys, type `/court` in the DM **and** the test space. What is being proven: that `cardsV2` inside `createMessageAction.message` renders at all, that `privateMessageViewer` still works beside it, and that `openLink` opens without a callback. If Google wants a different envelope for cards, this is where it is learned, on a ten-line change — not after the reads are written. Record the answer as trap **(h)** below, whichever way it goes.
- [ ] **2. Pure rules + tests.** `[Sonnet]` `trail-rules.ts`, `commandText` in `events.ts`, and the two card builders in `cards.ts`, each with tests: scope from every link shape; words from blank / punctuation / mixed case; every-word matching; the ten-cap; the four bottom-label sentences (on time, cold, with client, with client and cold); the empty and no-words sentences; the origin in every link.
- [ ] **3. Reads.** `[Sonnet]` `relay-reads.ts`. `[Opus]` vets the two `select` strings against the live view (`select pg_get_viewdef('pusher_chain_state'::regclass, true)` on staging, never an older migration — relay `PLAN.md`'s six-definitions warning) before it is committed.
- [ ] **4. Dispatch.** `[Opus]` Wire the five command ids; keep the log line as it is (kind, space, command id, identity decision — never text, never an email; the search words are message text and are **not** logged).
- [ ] **5. Checks and push.** `npm test`, lint, typecheck, `check:actions`; push; `gh run list` green; PR into `staging`.
- [ ] **6. Founder's vet on staging** (the checklist below), then tick the phase and hand to Phase 6.

### What is NOT in this phase

- No Push / Bounce / Finish / Hold buttons on the card, no `CARD_CLICKED` handling beyond the existing `/link` Save, no session minting — all Phase 6.
- No pick-list for `/trail` (the command table's "several matches → pick-list" is for acting on one, which is Phase 6): this phase lists up to ten matches as status lines, which answers "where is it?" outright.
- No finished or queued trails on either card; both say where to find them.
- No admin view of _someone else's_ court — `/court` is always the sender's. A leader asking about a trail uses `/trail`.
- No change to the view, no migration, no SECURITY.md edit yet — Phase 8 adds `pusher_chain_state`, `pusher_chain_legs` and `profiles.full_name` to the door's sanctioned admin-client entry and the STATUS.md contract row.

### Acceptance

- `/court` in the DM lists every unfinished baton the sender holds, coldest first, with day X of Y and the cold / with-client wording matching the app's `/relay/court` for the same person at the same moment.
- `/court` in the linked test space lists only that villa's (or project's) batons and says how many the sender holds elsewhere.
- `/trail <villa name>` lists that villa's running trails with holder names; `/trail` alone in the linked space lists the same set; `/trail` alone in the DM asks for a word.
- Every reply is private to the sender; nothing is posted to the space by these commands.
- The Open link lands on the right trail on **staging**, not production.
- A person without `/relay` still gets the Phase 3 refusal; the log line still carries no text.
- `npm test` covers every sentence and every scope path; `gh run list` green.

### What the founder sees (the staging checklist)

1. In the Relay bot DM, type `/court`. Expect a card with your batons, coldest first, each with a day count and an _Open in the toolbox_ link. If you hold nothing: "Court cleared".
2. Open `/relay/court` on staging in the browser. The trails, order and day counts should match the card exactly.
3. In the test space (linked to a villa on 2026-09-02), type `/court`. Expect only that villa's batons, and a line saying how many you hold elsewhere.
4. In the test space, type `/trail` with nothing after it. Expect that villa's running trails with who holds each.
5. In the DM, type `/trail` followed by a villa or activity name. Expect matches; then type `/trail` alone and expect to be asked for a word.
6. Tap one _Open in the toolbox_ link: it should open that trail on staging.goodearthkannur.org.
7. Type `/push`: the court card again, with the line saying the buttons come next.

### Questions for the tier above

_(none yet — a builder who hits one writes it here and stops on that step)_

### Google traps learned in this phase

- **(h)** _to be written at step 1: the card envelope that actually renders, verbatim._
