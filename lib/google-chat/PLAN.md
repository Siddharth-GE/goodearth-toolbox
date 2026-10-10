# The Google Chat door — plan and record

Relay's slash commands and card buttons inside the company's Google Chat spaces, on staging (production: the checklist below). Plain deterministic code, no AI, no new running cost. Shell code, not a tool: `app/api/google-chat/route.ts` (the door) + this folder. It never imports `lib/relay/`; its writes are the same event inserts and RPCs Relay's own actions use, made **as the person**.

## On every event

Prove it is our Google, prove the person, act as the person — the three trust steps are `SECURITY.md`, _The Google Chat door_. Then **answer within 30s, always 200, always a card**; database guard messages pass through as-is.

**Space scoping:** `google_chat_spaces` (`0094`, service-role only, deny-all for signed-in roles) links a space to a unit or project — auto-matched on join, set by `/link`. In a linked space every command defaults to it; in a DM, commands span everything.

## Code map

`verify.ts` the lock · `events.ts` Google's envelope, pure readers · `identity-rules.ts` / `identity.ts` who typed · `space-match.ts` / `spaces.ts` scoping · `trail-rules.ts` pure ordering, search, parsers · `relay-reads.ts` admin reads · `relay-writes.ts` writes through the minted client · `act-as.ts` the one place that mints a session for somebody else · `outbound-rules.ts` / `outbound.ts` the app's own voice (round two: the service-account token and the one PATCH that rewrites a pressed card) · `cards.ts` every sentence the bot says · `route.ts` the lock and the 401 · `dispatch.ts` everything after it. Pure files are tested; `server-only` files cannot be imported by `tsx --test`, which is why rules live apart from reads.

## Round two — the pressed card rewrites itself (2026-09-07)

Google takes **one answer per button press**, and its data action is _create a message_ or _update the pressed message_, never both. The answer stays what it was — the public confirmation — and just before sending it the door rewrites the pressed card through the Chat REST API (`PATCH spaces/…/messages/…?updateMask=cardsV2`) authenticated **as the app**: a service account in the Chat app's own Cloud project, scope `chat.bot`, its JSON key in `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY`. The rebuilt card is the person's current court from the same renderer `/court` uses (`buildCourtCards` in dispatch.ts), with what just happened on top. Five-second ceiling, never blocks or changes the answer; **key unset = the card stays as it was and nothing else changes**, which is how production runs until its own key exists. The log line gains `messageName` (true/false) and `refresh` (`off` / `done` / `skipped` / `failed:<status>`). Option A — answering with `updateMessageAction` and dropping the public confirmation — was the no-setup alternative the founder declined.

### The usage test

`npm run chat:usage -- --as <email>` drives the door in-process against staging with envelopes shaped as Google sends them (`/court`, `/trail`, `/newtrail`, `/link`; `--bounce`; `--press push|finish|hold|return` with `--commit` moves a real baton; `--dm`). It refuses any database but staging and fails on a throw, a non-200, an unexpected envelope or the door's own apology. It proves **our** side only — **Google is still the only judge of the card JSON** (BUGCATCHER #17), so the vet in a real space stays required.

## Invariants

- Replies about one person are private (`privateMessageViewer`); confirmations post to the space.
- What the app credential and the log line may do: `SECURITY.md`.
- Identity `ok` gates every command and button; joining a space needs none.
- A dialog error re-renders the page with every value kept, never a toast.
- A trail from a type never stamps `activity_id`.
- Plain ASCII in every command name and description in the Google console.

**Google traps (a)–(l)** are BUGCATCHER.md #17 and the comments beside the code that sends each shape. Vercel Authentication is **off** for the project (Google validates the endpoint at save time), and after an endpoint change re-save the Chat app config or deliveries stay dead.

## Shipping to production — the checklist

After the founder's vet on staging: `0094` to production (`npm run db:apply -- --project pajfrgnkapicdgangjey --commit`, `db:types`, `db:compare` empty) → a production Cloud project and Chat app registered at `https://toolbox.goodearthkannur.org/api/google-chat` → `GOOGLE_CHAT_PROJECT_NUMBER` + `GOOGLE_CHAT_AUDIENCE` in Vercel **Production** (through the API, never pasted — BUGCATCHER #18) → a `relay-outbound` service account + JSON key in that production Cloud project → `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` in Vercel **Production** the same way (`npx tsx scripts/vercel-env.ts --name GOOGLE_CHAT_SERVICE_ACCOUNT_KEY --target production --commit`) → merge → one real command pressed in production, and one button, and the card must rewrite.

Vetted on staging 2026-09-03: `/court`, `/trail`, `/newtrail` (standard, custom, people chosen), Push, Bounce, in-dialog errors. Round two's vet is **still the founder's to do**. First the founder's part: a `relay-outbound` service account in the staging Cloud project, its JSON key handed to a session as one line under `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` in `.env.local`, written to Vercel Preview through `scripts/vercel-env.ts` and `staging` redeployed. Then, in the linked test space with a baton in hand: `/court` → Push — the card must rewrite while the space still hears the confirmation; then Finish, With client, Back from client and a Bounce saved from its dialog, once each on real rows; then `/court` from a DM and one press; then the failure path — key blanked on Preview, redeploy, Push: the baton moves, the space is told, the card stays, the log says `refresh: "off"`. Restore the key. Still never pressed: `/trail <words>` in the DM.

## Next build — the founder picks

1. Hand-over and changing the people on a trail from chat, for admins (`hand_baton`, `replace_future_legs`).
2. Auto-fill on custom rows (`onChangeAction` + `updateCard`, one more Google surface to prove).
3. Outbound messages — morning "your court" DMs, cold-trail alerts. The transport exists since round two (`outbound.ts`, the app token); what is missing is a schedule (a Vercel cron, the keep-alive's pattern), the DM lookup (`spaces.findDirectMessage`) and the words. Fire-and-forget, never block a write on them.

Out of scope until asked: other tools' commands; a replay table (Google's JWT `exp` suffices).
