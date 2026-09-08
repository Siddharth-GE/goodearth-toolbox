# The Google Chat door — plan and record

Relay's slash commands and card buttons inside the company's Google Chat spaces. Approved 2026-08-31; Phases 1–7b built and vetted on staging by 2026-09-03. Plain deterministic code, no AI, no new running cost. Shell code, not a tool: `app/api/google-chat/route.ts` (the door) + this folder. It never imports `lib/relay/`; its writes are the same event inserts and RPCs Relay's own actions use, made **as the person**.

## Four trust steps on every event

1. **Prove it is our Google.** Add-on-style ID token verified with `node:crypto`: RS256, issuer `accounts.google.com`, audience = `GOOGLE_CHAT_AUDIENCE` (the registered endpoint URL), **and** email = `service-<GOOGLE_CHAT_PROJECT_NUMBER>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`. The email check is load-bearing. Reject before reading the body.
2. **Prove the person.** Sender email → toolbox account (admin lookup); must be active and hold `/relay` (or be admin). Five fixed private refusals.
3. **Act as the person.** `act-as.ts` mints a short-lived real session (admin `generateLink` → `verifyOtp` → mark verified) and writes through it, so `has_app('/relay')` RLS and the `pusher_chain_events_guard` stay the boundary, untouched. Reads (`/court`, `/trail`) use the admin client on `pusher_chain_state`, the sanctioned view.
4. **Answer within 30s, always 200, always a card.** Database guard messages pass through as-is.

**Space scoping:** `google_chat_spaces` (`0094`, service-role only, deny-all for signed-in roles) links a space to a unit or project — auto-matched on join, set by `/link`. In a linked space every command defaults to it; in a DM, commands span everything.

## Code map

`verify.ts` the lock · `events.ts` Google's envelope, pure readers · `identity-rules.ts` / `identity.ts` who typed · `space-match.ts` / `spaces.ts` scoping · `trail-rules.ts` pure ordering, search, parsers · `relay-reads.ts` admin reads · `relay-writes.ts` writes through the minted client · `act-as.ts` the one place that mints a session for somebody else · `outbound-rules.ts` / `outbound.ts` the app's own voice (round two: the service-account token and the one PATCH that rewrites a pressed card) · `cards.ts` every sentence the bot says · `route.ts` dispatch. Pure files are tested; `server-only` files cannot be imported by `tsx --test`, which is why rules live apart from reads.

## Round two — the pressed card rewrites itself (2026-09-07)

Google takes **one answer per button press**, and its data action is _create a message_ or _update the pressed message_, never both. The answer stays what it was — the public confirmation — and just before sending it the door rewrites the pressed card through the Chat REST API (`PATCH spaces/…/messages/…?updateMask=cardsV2`) authenticated **as the app**: a service account in the Chat app's own Cloud project, scope `chat.bot`, its JSON key in `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY`. The rebuilt card is the person's current court from the same renderer `/court` uses (`buildCourtCards` in route.ts), with what just happened on top. Five-second ceiling, never blocks or changes the answer; **key unset = the card stays as it was and nothing else changes**, which is how production runs until its own key exists. The log line gains `messageName` (true/false) and `refresh` (`off` / `done` / `skipped` / `failed:<status>`). Option A — answering with `updateMessageAction` and dropping the public confirmation — was the no-setup alternative the founder declined.

## Invariants

- Replies about one person are private (`privateMessageViewer`); confirmations post to the space.
- The app credential (`outbound.ts`) edits only cards the app itself posted. It never reads or writes the database and never moves a baton — every write is still made as the person through `act-as.ts`, which keeps its one caller.
- The log line never carries message text, an email or a token.
- Identity `ok` gates every command and button; joining a space needs none.
- A dialog error re-renders the page with every value kept, never a toast.
- A trail from a type never stamps `activity_id`.
- Plain ASCII in every command name and description in the Google console.

**Google traps (a)–(l)** are BUGCATCHER.md #17 and the comments beside the code that sends each shape. Vercel Authentication is **off** for the project (Google validates the endpoint at save time), and after an endpoint change re-save the Chat app config or deliveries stay dead.

## Shipping to production — the checklist

Standing instruction (2026-09-03): everything lands on `staging`; one merge to `master` after the founder has tested everything. Then: `0094` to production (`npm run db:apply -- --project pajfrgnkapicdgangjey --commit`, `db:types`, `db:compare` empty) → a production Cloud project and Chat app registered at `https://toolbox.goodearthkannur.org/api/google-chat` → `GOOGLE_CHAT_PROJECT_NUMBER` + `GOOGLE_CHAT_AUDIENCE` in Vercel **Production** (through the API, never pasted — BUGCATCHER #18) → a `relay-outbound` service account + JSON key in that production Cloud project → `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` in Vercel **Production** the same way (`npx tsx scripts/vercel-env.ts --name GOOGLE_CHAT_SERVICE_ACCOUNT_KEY --target production --commit`) → merge → one real command pressed in production, and one button, and the card must rewrite.

Vetted on staging 2026-09-03: `/court`, `/trail`, `/newtrail` (standard, custom, people chosen), Push, Bounce, in-dialog errors. Round two's vet (plan.md step 7) covers the card rewrite, Finish, With client, Back from client, and a Bounce saved from its dialog. Still never pressed: `/trail <words>` in the DM.

## Next build — the founder picks

1. Hand-over and changing the people on a trail from chat, for admins (`hand_baton`, `replace_future_legs`).
2. Auto-fill on custom rows (`onChangeAction` + `updateCard`, one more Google surface to prove).
3. Outbound messages — morning "your court" DMs, cold-trail alerts. The transport exists since round two (`outbound.ts`, the app token); what is missing is a schedule (a Vercel cron, the keep-alive's pattern), the DM lookup (`spaces.findDirectMessage`) and the words. Fire-and-forget, never block a write on them.

Out of scope until asked: other tools' commands; a replay table (Google's JWT `exp` suffices).

Full phase-by-phase history: `git show 2a37489:plan.md`.
