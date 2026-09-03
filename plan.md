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
- **Phase 5 — Reads.** ✅ Done 2026-09-03 (PRs #60, #61; vetted on staging the same day). Detail below.
- **Phase 6 — Writes, buttons first.** ✅ Done 2026-09-03 with Phase 7 (PRs #61–#63; vetted on staging: open, push, bounce all as the founder). Detail below. `act-as.ts` session minting (reuse the row-write inside `markSessionVerified` in `lib/auth/verified-session.ts`; extract a shared helper if it proves cookie-coupled); push / finish / hold / return via `CARD_CLICKED`; public confirmations; revalidation.
- **Phase 7 — Dialogs.** ✅ Done 2026-09-03 (see Phases 6 and 7 below). **Phase 7b** (custom trails, choosing the people) is planned below and waits for the founder's "build". `/bounce`, then `/newtrail`.
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

- [x] **1. Prove the card envelope on staging.** _Proven 2026-09-03 after the build, on the real card — trap (h) below._ `[Opus]` Hard-code one `cardsV2` card (header, one decoratedText, one openLink button) behind `/court`, push the branch so staging deploys, type `/court` in the DM **and** the test space. What is being proven: that `cardsV2` inside `createMessageAction.message` renders at all, that `privateMessageViewer` still works beside it, and that `openLink` opens without a callback. If Google wants a different envelope for cards, this is where it is learned, on a ten-line change — not after the reads are written. Record the answer as trap **(h)** below, whichever way it goes.
- [x] **2. Pure rules + tests.** `[Sonnet]` `trail-rules.ts`, `commandText` in `events.ts`, and the two card builders in `cards.ts`, each with tests: scope from every link shape; words from blank / punctuation / mixed case; every-word matching; the ten-cap; the four bottom-label sentences (on time, cold, with client, with client and cold); the empty and no-words sentences; the origin in every link.
- [x] **3. Reads.** `[Sonnet]` `relay-reads.ts`. `[Opus]` vets the two `select` strings against the live view (`select pg_get_viewdef('pusher_chain_state'::regclass, true)` on staging, never an older migration — relay `PLAN.md`'s six-definitions warning) before it is committed.
- [x] **4. Dispatch.** `[Opus]` Wire the five command ids; keep the log line as it is (kind, space, command id, identity decision — never text, never an email; the search words are message text and are **not** logged).
- [x] **5. Checks and push.** `npm test`, lint, typecheck, `check:actions`; push; `gh run list` green; PR into `staging`. _Done 2026-09-03: PR #60._
- [x] **6. Founder's vet on staging** — done 2026-09-03: the card, the scope, the links and `/trail` all as specified.

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

- **[Sonnet, step 2]** `trailCard`'s bottom label: the brief's literal quoted example is `"with Anil — day 4 of 3, cold"` — holder plus the day sentence, with no leg number or leg label. But the file-by-file description says `trailCard` "plus"-es the holder's name onto "the same row widget" `courtCard` uses, whose bottom label leads with `Leg 2 of 5 · <legLabel> —`. Those two read as different sentences (one drops the leg info, one keeps it and prepends the holder). I built to the literal quoted example — `trailBottomLabel` in `cards.ts` is `with ${holder} — day X of Y, <status>`, no leg number — since it was given to me in quotes as the exact string, and pinned it in `cards.test.ts`. Not blocking (the interface contract's function signatures don't pin the wording), but worth a look before the founder's vet: should `/trail` rows also say which leg the trail is on?
  - **[Fable, 2026-09-03] Yes — keep the leg.** `/trail` rows read `Leg 2 of 5 · <label> · with Anil — day 4 of 3, cold`: someone asking where a trail is wants the leg as much as the holder. The quoted example in the brief was the holder half only, not the whole sentence. Fixed in `cards.ts` before commit.

### Google traps learned in this phase

- **(h)** **Cards render in the ordinary reply envelope** (proven 2026-09-03, the founder's first `/court` in the linked Saarang space): `hostAppDataAction.chatDataAction.createMessageAction.message.cardsV2 = [{ cardId, card: { header, sections } }]`, with `privateMessageViewer` beside it — the card came back "Only visible to you", the `decoratedText` rows showed top label, bold text and bottom label, and the `openLink` button rendered without any callback. No second envelope shape was needed. One cosmetic finding from the same card: a trail laid down from a trail type has its title equal to its activity name, so the title line is now dropped when it merely repeats the bold line.

## Phases 6 and 7 in detail — writes (written by Fable, 2026-09-03)

Merged into one build at the founder's request ("start a new trail in this space, then push, bounce, court"), ordered the way they will use it: open a trail, then the buttons, then bounce. Phase 5's reads stay exactly as they are; this adds the buttons to the court card and three writes behind them.

**The idea.** Every write in chat is the same one-line insert or RPC the app's own Relay actions do, made **as the person**: the door mints a short-lived real session for the sender, writes through a client bound to it, and throws the session away. The database guard (`pusher_chain_events_guard`, `0036`) stays untouched and keeps enforcing holder-or-admin, leg arithmetic, the mandatory bounce note and the switched-off refusals — chat gains no power the app doesn't have, and every event is attributed to the real person. Confirmations post to the space; refusals stay private (the founder's settled choice).

### The one piece that touches auth — `lib/google-chat/act-as.ts` `[Opus]`, reviewed line by line by `[Fable]`

`actAs(identity, work)`, `server-only`, admin client, never throws to the door:

1. `admin.auth.admin.generateLink({ type: "magiclink", email })` — the sender's verified email, carried on the `ok` identity from this phase. This mints **no email**: the admin API returns the link's `hashed_token` directly (the browser-smoke technique proven 2026-08-19).
2. A fresh plain client (`@supabase/supabase-js` `createClient` with the anon key, `persistSession: false`, `autoRefreshToken: false`) calls `verifyOtp({ type: "magiclink", token_hash })` → a real session. The token is single-use and consumed within milliseconds; it is never logged, stored or sent anywhere.
3. The access token's `session_id` claim (decoded from the JWT payload, no verification needed — it came from Supabase over TLS a moment ago) is upserted into `auth_verified_sessions` with `method: "oauth"` — the honest word from the three the `0062` CHECK allows: the person's Google sign-in is what proved them, exactly as the OAuth path does. **No migration.** Without this row `has_app('/relay')` answers false (`0063`) and every write is refused, which is the point of that row.
4. `work(client)` runs with a client bound to that token (`global.headers.Authorization = Bearer …`, same anon key) — RLS-scoped, `auth.uid()` = the person, `session_is_verified()` true.
5. **Always**, in `finally`: delete the `auth_verified_sessions` row, then `admin.auth.admin.signOut(accessToken)` to revoke the session. Both best-effort and logged; a leftover row dies in the 30-day sweep anyway.

Failure at any step → `{ ok: false }` and the door's "couldn't act for you just now" sentence. The log line stays as it is: never the email, never a token. **SECURITY.md (Phase 8)** gets this as a new sanctioned admin-client entry with the threat note: the door's JWT check in `verify.ts` is what stands between anyone on the internet and "act as any employee" — which is why the service-agent email check there is load-bearing and stays.

### Files, with owners

1. **`identity-rules.ts` / `identity.ts`** `[Sonnet]` — the `ok` identity carries `email` (the normalised sender email `resolveIdentity` already matched on). Test updated.
2. **`trail-rules.ts`** `[Sonnet]`, pure, tests:
   - `type ButtonAction = "push" | "finish" | "bounce" | "hold" | "return"` and `buttonsFor(row): ButtonAction[]` — the app's own `MoveBatonButtons` rules restated: push when `currentLeg < legCount`; finish when `currentLeg === legCount`; bounce when `currentLeg > 1`; hold when not with the client; return when with the client. Nothing when `currentLeg` is null.
   - `BOUNCE_REASONS`: `rework` "Rework needed" · `missing_info` "Missing information" · `wrong_person` "Wrong person" · `client_change` "Client changed something" · `other` "Other" — the `0036` list, in this order.
   - `parseButton(params: Record<string, string> | undefined)` → `{ action, chainId, fromLeg }` or null; `parseBounceForm(values)` → `{ toLeg, reason, note }` or a plain-English error (the three checks `bounceBaton` in the app makes: reason picked, note not blank, target earlier than current); `parseNewTrailForm(values)` → `{ unitId, setId, start }` or an error.
3. **`events.ts`** `[Sonnet]` — `buttonParams(event)`: `commonEventObject.parameters` as a plain record, `{}` when absent. `formValue` already reads dialog inputs; a switch arrives as a `stringInputs` value too (its `value` when on, absent when off) — pin that in the test.
4. **`relay-reads.ts`** `[Sonnet]` — `getTrailSummary(chainId): TrailSummary | null` (one row of the view, same enrichment — for the confirmation sentence after a write), `listTrailSets()` (active `pusher_trail_sets` with their items, ordered — the dialog's dropdown), `listLegs(chainId)` (leg_no, label, assignee name — the bounce dialog's target list). All admin-client reads of what every signed-in person can see.
5. **`relay-writes.ts`** `[Opus]`, `server-only`, **every function takes the minted client** and returns `{ ok: true; chainId? } | { ok: false; error: string }`; errors through `dbErrorMessage` from `lib/db-error` with the relay phrase list **copied** (`baton`, `trail`, `leg`, `switched off`, `permanent`, `signed-in`), so the guard's own sentences reach chat intact:
   - `pushBaton`, `finishTrail`, `holdForClient`, `clientReturned`, `bounceBaton` — the same inserts as `lib/relay/actions.ts`, one each.
   - `openTrailFromSet(client, { unitId, setId, start })` — `applyTrailSet` restated: the unit's project from `units`; the set's activities; each activity's default person and days from its most recent leg anywhere (the `getActivityDefaults` read, on the minted client so RLS applies), skipping switched-off people; the unstaffed-activity refusal in the app's own words, ending "open it once in the toolbox by hand and this type will fill itself in"; then `open_chain` with `p_start`, then best-effort `set_chain_departments` from the last trail of that type. Not `requireTool` — the minted session's RLS is the gate.
   - Each success ends with `revalidatePath("/relay", "layout")` so the app is fresh behind chat.
6. **`cards.ts`** `[Sonnet]`, tests:
   - The court row's `buttonList` grows the action buttons from `buttonsFor(row)` before "Open in the toolbox": **Push** · **Finish** · **Bounce** · **With client** · **Back from client**. Each `onClick.action = { function: submitUrl, parameters: [{action},{chain},{leg}] }` — the URL rule, trap (e). Bounce alone adds `interaction: "OPEN_DIALOG"`. `courtCard` gains `submitUrl`; the Phase 5 `note` line and `buttonsComingNote()` go.
   - `bounceDialog({ trail, legs, submitUrl })`: a paragraph naming the trail and its current leg; dropdown `to_leg` of earlier legs ("Leg 1 · Client sign-off · Anil"), default the previous one; dropdown `reason` from `BOUNCE_REASONS`; `textInput` `note`, multi-line, hint "What needs to change — a bounce is never silent"; Save with `action: "bounce"`, chain and leg parameters.
   - `newTrailDialog({ units, sets, selectedUnit, submitUrl })`: dropdown `unit` of every villa as "Project · Villa" (pre-selected from the space link; a project-linked space pre-selects nothing); dropdown `set` of trail types; a `decoratedText` with a `switchControl` `start` **on by default** — "Start now (the clock begins today)"; Save with `action: "newtrail"`.
   - Public confirmation sentences, one per write, built from the fresh `TrailSummary`: "**Sid** pushed _Standard villa_ on Villa 12 to leg 3 of 8 · Client sign-off — now with Anil." · "… finished _Standard villa_ on Villa 12 🎉" · "… bounced _…_ back to leg 1 · Client sign-off (Rework needed): <note>" · "… marked _…_ as with the client." · "… took _…_ back from the client." · "… opened _Standard villa_ on Villa 12 — leg 1 of 8 · Client sign-off, with Anil." / "… queued _Standard villa_ on Villa 12 — not started."
   - Private sentences: `cannotActNow()` "I couldn't act as you just now. Please try again in a moment."; `newTrailNeedsDialog()` (the "Opens a dialog" tick missing on `/newtrail`, same shape as `/link`'s).
7. **`route.ts`** `[Opus]`:
   - `buttonClickedPayload` without a dialog step → `parseButton(buttonParams(event))`: `push` / `finish` / `hold` / `return` → `actAs` → the write → `getTrailSummary` → **public** `card(confirmation)`; a refusal → **private** `card(error, privateTo)`. `bounce` never arrives here (it opens a dialog).
   - `REQUEST_DIALOG` on a button with action `bounce` → `listLegs` + `getTrailSummary` → `pushCard(bounceDialog)`; `SUBMIT_DIALOG` with action `bounce` → `parseBounceForm` → `actAs` → write → `closeDialog(confirmation)` public, or `closeDialog(error, privateTo)` — the three close shapes, trap (g).
   - `/newtrail` (id 6) → must be `REQUEST_DIALOG` (else `newTrailNeedsDialog()`) → `listLinkTargets` + `listTrailSets` → `pushCard(newTrailDialog)`; `SUBMIT_DIALOG` with action `newtrail` → `parseNewTrailForm` → `actAs` → `openTrailFromSet` → `closeDialog(confirmation)` / `closeDialog(error, privateTo)`.
   - `handleLinkSubmit` now runs only when the Save's action is `link` — every dialog's Save names its action.
   - `/push`, `/bounce`, `/finish` → the court card, no note: the buttons are on it.

### Steps, in order

- [x] **1. Act-as + the first write.** `[Opus]` `act-as.ts`, `relay-writes.ts` (all six writes), the reads in step 4 of the file list. `[Fable]` reviews `act-as.ts` before anything is pushed.
- [x] **2. Rules, readers, cards.** `[Sonnet]` items 1, 2, 3, 6 with tests.
- [x] **3. Dispatch.** `[Opus]` item 7.
- [x] **4. Checks, push, PR, CI green, merge to staging on the founder's word.** _PR #61, then fixes #62 and #63._
- [x] **5. Founder ticks "Opens a dialog" on `/newtrail`** _(done 2026-09-03, before the build)_ (command 6) in the Google Cloud console — the same tick `/link` needed. **Not** on `/bounce`: it answers with the court card, and the dialog opens from the row's button.
- [x] **6. Founder's vet, in this order** _(done 2026-09-03 after two fixes, traps (i) and (k) below — "all working so far")_, each answer recorded as a trap if Google surprises us: `/newtrail` in the Villa 12 space (dialog pre-filled with Villa 12; pick a type; Save → public "opened … leg 1 of N") · `/court` (the new trail with Push / Bounce / With client buttons) · tap **Push** (public confirmation — **this is trap (i): whether a message-card button click accepts the same reply envelope**) · `/court` again (leg 2) · tap **Bounce** (dialog; pick reason, type a note, Save → public confirmation) · `/court` (back on leg 1) · tap **With client**, then **Back from client** · open `/relay/court` in the browser and confirm the same trail, same leg, and the events named to you.

### What is NOT in this build

- No editing of who is on a leg, no hand-off, no discard of a queued trail, no `/newtrail` without a trail type (the app's hand-built form stays the place for that).
- No updating of the court card in place after a button press — the confirmation posts, and `/court` again shows the new state. (Editing the original message is a later refinement, if the founder wants it.)
- No replay or rate-limit table: Google's token `exp` and the single-use magic-link token cover round one (the deferral SECURITY.md notes in Phase 8).
- No migration. `0094` stays staging-only until Phase 8.

### Acceptance

- Every event chat creates carries the sender's `actor_id` and lands in the app's court, trail page and audit exactly as if pressed there.
- A person who is not the holder pressing a button they somehow have (a stale card) gets the guard's own sentence privately; nothing moves.
- A bounce without a note never reaches the database.
- `auth_verified_sessions` holds no chat rows a minute after any command; `auth.sessions` shows the minted session revoked.
- The log line still carries no email, token or text.

### Questions for the tier above

- **[Opus, step 1] `generateLink` can create an account, and the userId check is what makes that harmless.** Supabase's admin API documents `generateLink` as _creating_ the user for `signup`, `invite` and `magiclink`. `actAs` is only ever reached after `identity.ts` has already found a live account for that exact email, so the address is never new — but the belt is worth naming: step 2 compares `session.user.id` to the `userId` identity resolved and aborts on any mismatch, so even a freshly minted stranger account could not be acted as. For Fable's line-by-line: is that comparison enough, or should `actAs` also refuse an email that `listUsers` did not just return?
- **[Opus, step 1] Every button press mints and revokes one session.** A press costs `generateLink` + `verifyOtp` + an `auth_verified_sessions` upsert + the write + a delete + `signOut` — six round trips inside Google's ~30s, comfortably fine, but it does mean `auth.sessions` gains and loses a row per press. If `signOut` fails (logged, best effort) the row lingers until Supabase expires it, with its `auth_verified_sessions` row already deleted so it can reach nothing gated. Recorded rather than asked: no change made.
- **[Opus, step 3] There is no "Done." sentence in `cards.ts`.** The dispatch brief said to use a generic public sentence from cards if Sonnet provided one, else `card("Done.")`. Sonnet's contract has no such export, so the literal string `"Done."` appears in four places in `route.ts` — the fallback when a write succeeded but the follow-up `getTrailSummary` came back null. Worth one `doneAnyway()` in `cards.ts` if Fable wants every sentence the bot says to live in one file, which is that file's stated rule.
- **[Opus, step 1] `openTrailFromSet` does not filter the trail type to active ones**, matching `applyTrailSet` (which reads the list with `includeInactive`) rather than the dialog's own list (`listTrailSets()`, active only). So a type switched off in the seconds between opening the dialog and pressing Save still lays down instead of vanishing mid-action. Noted rather than asked; say the word if the refusal is preferred.

- **[Fable, 2026-09-03 — answers to the four above.]** (1) The user-id check is enough: `identity.ts` has already found this exact email in `listUsers`, so `generateLink` never meets an unknown address, and signups are disabled at the project besides; the comparison closes the last gap. (2) Recorded as a settled trade-off — six round trips per press is the price of the guard staying untouched, and a session whose verified row is gone reaches nothing gated. (3) Sonnet's contract does carry `doneText()`; `route.ts` uses it, not a literal. (4) Correct as built — it matches the app. **One finding of my own, fixed before commit:** `signOut(token, "global")` would have signed the person out of the toolbox in every browser on every button press; it is `"local"`, this session only.

### Google traps learned in this build

- _Vet so far (2026-09-03): `/newtrail` with a standard type opened a trail on Villa 12 as the founder — the dialog, the minted session, `open_chain` through the guard and the public confirmation all work. Push not yet pressed._
- **(i), first half (2026-09-03):** a button's `interaction: "OPEN_DIALOG"` belongs INSIDE `onClick.action`, beside `function` and `parameters`. One level up, on `onClick`, Google rejects the whole card silently — the door logs a normal event and answers 200, and the space shows "Relay not responding". The tell: the same card rendered with no rows and broke the moment a row (and its buttons) appeared. Fixed in PR #62.
- **(i), second half (2026-09-03):** a button on a message card accepts the ordinary `createMessageAction` reply — the confirmation posts to the space; the original card stays as it was (stale until the next `/court`).
- **(k)** When someone presses a button on the bot's OWN card, Google sends that card as `buttonClickedPayload.message` — whose `sender` is the bot — with the person in `chat.user`. A reader that refuses on any bot in the envelope turns every card button into "Google didn't tell me who you are"; only a bot in `chat.user` is a bot talking to us (fixed in PR #63).

## Phase 7b in detail — custom trails and choosing the people (written by Fable, 2026-09-03)

**Why this exists.** The 2026-08-31 plan settled that people are never hand-picked in chat. On the first vet of `/newtrail` (2026-09-03, a standard type opened on Villa 12 as the founder, through the minted session) the founder asked for the rest of the app's form in chat too: a **custom trail** (pick the steps yourself) and **choosing who carries each step**, for both kinds. This phase reverses that settled choice at the founder's request, and does it without touching the standard one-tap path they already have.

**The idea.** `/newtrail` becomes a two-page dialog, and the second page appears only when it is needed:

- **Page 1** (today's dialog, grown): _Which house_ · _Trail type_ — the list now starts with **"Custom — I'll pick the steps"** · a new switch **"Choose the people myself"**, off · _Start now_, on · Save.
- Save with a standard type and the switch off → opens at once, exactly as today. Nothing changes for the one-tap case.
- Otherwise the reply to that Save is **page 2**, a fresh dialog card (`action.navigations[].updateCard` in answer to the `SUBMIT_DIALOG` — the documented way to move a dialog to its next page; **trap (j)** records whether Google accepts it):
  - **Standard type, choosing people:** one row per activity of the type — "Step 1 · Client sign-off" — with a dropdown `person_1` of every active person (the usual person pre-selected) and a text `days_1` pre-filled with the usual days.
  - **Custom:** a text `title` ("What is this trail for"), then **six** step rows, each a dropdown `activity_n` (active activities, none selected), a dropdown `person_n` (people, none selected) and a text `days_n` (hint "days"). Blank rows are skipped. Six is the ceiling on purpose: a longer trail is a trail type's job, made once in the toolbox.
  - An **Open trail** button whose parameters carry what page 1 decided (`action: "newtrail-open"`, `unit`, `set` or `custom`, `start`), so the door needs no memory between pages.
- The write is the app's `openTrail` restated, with its five checks in its own words ("Step 2 needs someone to carry it.", "The same activity appears twice…", at least one step, whole days ≥ 1) — then `open_chain` with the legs typed, `p_trail_set_id` for a type, `p_title` the custom title or the type's name, `p_activity_id` the single activity when there is exactly one step. Department tags: from the type's last trail as today; a custom trail gets none, and the confirmation says "add its departments on the trail page if it needs them".

### Files, with owners

1. **`trail-rules.ts`** `[Sonnet]`, pure, tests: `CUSTOM_SET = "custom"`, `MAX_CUSTOM_STEPS = 6`; `parseNewTrailPage(values)` (page 1: unit, set, `pick_people` switch, `start`); `parseTrailSteps(values, { mode: "set" | "custom"; count })` → `{ ok: true; title: string | null; legs: { activityId; assigneeId; expectedDays }[] }` or the app's own error sentences; `PersonOption = { id; name }`, `ActivityOption = { id; name }`, `StepDefault = { activityId; activityName; assigneeId: string | null; expectedDays: number }`.
2. **`relay-reads.ts`** `[Opus]`: `listPeople()` (active profiles, by name) and `listActivities()` (active, by sort order) through the admin client; and the two reads `relay-writes.ts` made privately — the set with its activities, and the per-activity defaults — moved here as `readSet(db, setId)` and `readActivityDefaults(db)` taking a client, so the dialog (admin client) and the write (minted client) ask the same question the same way.
3. **`relay-writes.ts`** `[Opus]`: `openTrail(db, { unitId; setId: string | null; title: string | null; legs; start })` — the app's `openTrail` restated (five checks, `open_chain`, best-effort departments for a type). `openTrailFromSet` becomes "read the set's defaults, then `openTrail`" — one write path, not two.
4. **`cards.ts`** `[Sonnet]`, tests: page 1 grows the custom row (first, value `custom`) and the `pick_people` switch (off); `trailStepsDialog({ mode, title?, steps: StepDefault[] | null, people, activities, params: { unit, set, start }, submitUrl })` builds page 2; a sentence for the custom confirmation's department note.
5. **`route.ts`** `[Opus]`: `SUBMIT_DIALOG` action `newtrail` → parse page 1 → standard and no people → today's path; else read what page 2 needs → `Response.json({ action: { navigations: [{ updateCard: <page 2> }] } })`. Action `newtrail-open` → `parseTrailSteps` from `formValue`s (`activity_n`, `person_n`, `days_n`, `title`) with the button's parameters → `actAs` → `openTrail` → `closeDialog(openedText)` public, or the error private.

### Steps

- [ ] **1.** `[Sonnet]` items 1 and 4, with tests. `[Opus]` items 2, 3, 5. Parallel, disjoint files, as before.
- [ ] **2.** `[Fable]` review; checks; push; PR; CI; merge to staging on the founder's word.
- [ ] **3.** Founder's vet in the Villa 12 space: `/newtrail` → **Custom** → Save → page 2 (**trap (j)**) → two steps with people and days → Open → public line · `/newtrail` → a standard type + **Choose the people myself** → page 2 pre-filled → change one person → Open → public line · `/court` shows both · the trail pages on staging show the people chosen.

### What is NOT in it

- No changing the people on a trail that already exists (the app's `replaceFutureLegs` is still unwired even there); no hand-off from chat; no department picker for custom trails; no more than six custom steps.
- No auto-fill of a custom row's person and days when its activity is picked — that needs a dialog that re-renders on change (`onChangeAction`), a further Google surface to prove; the person picks all three.

### Questions for the tier above

_(none yet)_

### Google traps learned in this phase

- **(j)** _to be written at the first page 2: whether `updateCard` in reply to a `SUBMIT_DIALOG` shows the next page, and whether the Open button's parameters come back with page 2's form values._
