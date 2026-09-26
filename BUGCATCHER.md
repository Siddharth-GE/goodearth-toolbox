# Bugcatcher — what a green build does not prove

CI runs prettier, lint, typecheck and test, then build and `check:actions`. **Every bug on this page passed all of them.** Nothing on a developer's machine could have caught these, so the only defence is knowing they exist and running the one check that does. Read this before merging anything that touches a database read, a file upload, a permission or a colour.

## Before you merge

- **Open the page in a browser** — a bad PostgREST `select` compiles and builds, then answers HTTP 300 (#2).
- **Sign in as a single-grant user** (the probe), not as an admin — an admin passes every permission check (#11).
- **Press the button that writes, and look at what landed** — a corrupted upload still reports the right content type (#1).
- **`gh run list`** — a successful push is not a green build.
- **Look at the page in dark mode**, opening every control that opens something (#4).
- **After a smoke test, read the rows** — a sign-in "worked" that never minted a session (#7).
- **Render any new drawing from real data and look at it** (#8).
- **Fire the trigger in a transaction you roll back** (#11).
- **Confirm a Production deployment exists for the merged commit** (#12, #18).
- **Read the number the screen prints for the empty and unknown cases** (#13).
- **Ask whether the founder has seen every feature in the diff on staging** (#14).

## The catalogue

### 1. A raw `Buffer` handed to Supabase Storage is silently text-decoded

A 40 KB JPEG stored as 124 KB of rubbish, every non-UTF-8 byte replaced with `EF BF BD`; Storage still said `image/jpeg`. `supabase-js` builds a multipart body only for a `Blob`, and under Next's patched `fetch` anything else is text-decoded — it does not reproduce outside the Next runtime.

**Rule.** Hand Storage a `Blob`, never a `Buffer`: `new Blob([new Uint8Array(buffer)], { type })`. Scripts too.
**Check.** Upload one real file, read it back, compare the first bytes and the size. `uploadMyPhoto` compares sizes on every upload and refuses on a mismatch.

### 2. A broken PostgREST `select` passes every gate

An ambiguous embed answers HTTP 300 (`PGRST201`) at runtime; it is not a type error and the tests have no database. Client Relations shipped four dead screens this way. A table with two foreign keys to the same target needs the key named — `plots!units_plot_id_fkey` (`units` has had two paths to `plots` since `0029`); `staff_details` has four FKs to `profiles`, which is why Directory forbids embeds and merges through a `Map`.

**Check.** Open the page, or run the `select` string straight at the REST API.

### 3. Supabase's default privileges grant more than the migrations ask for

Any signed-in person could update and delete production POs, bills and budgets through three auto-updatable views (fixed by `0059`). `grant select` adds to the platform's default INSERT/UPDATE/DELETE grants; `revoke … from public` does not remove `anon` or `authenticated`.

**Rule.** Every new view revokes insert, update, delete, truncate from `anon, authenticated`; every new function revokes execute from `public, anon` — same migration.
**Check.** `npm run db:check-views -- --project <ref>` (runs on every pull request).

### 4. `color-scheme` is why every date picker was white

The dark palette never declared `color-scheme`, so ~30 forms drew the browser's own pickers, steppers, selects and scrollbars in light colours on a dark page. One line fixed it; no test can see it.

**Check.** Open the page in dark mode and open every control that opens something.

### 5. `export type` from a `"use server"` file

A re-export — `export type { X }`, `export { type X }`, `export type * from` — in a `"use server"` module crashes every action in its compiled chunk at load. It caused a production outage. A plain `export type X = …` declaration is fine.

**Now gated** by `npm run check:actions`; this entry is why that script exists.

### 6. Reading the theme cookie in the root layout costs static rendering

`cookies()` in the root layout turned `/login`, `/_not-found` and `/_global-error` into render-on-demand, putting first visitors behind a cold start (~1.0s against ~0.2s warm). Everything still worked, only slower.

**Check.** Compare `.next/prerender-manifest.json` before and after any `cookies()` or `headers()` call in a root layout.

### 7. A smoke test can pass in front of your eyes without ever running

"Continue with Google" looked like it worked — the dashboard was an older session. The return leg was built from a hardcoded `SITE_URL` that on a preview pointed at production, so no session was ever minted; two other tests "done" had left zero rows.

**Rule.** Auth flows return to the address the request arrived at (`requestOrigin()`), never a hardcoded URL. A browser pass is a claim, not evidence.
**Check.** Read the receipts: an `auth_verified_sessions` row with the right `method`, a live `auth.sessions` row, `last_sign_in_at` moved, `login_attempts` for the unhappy paths — and after any OAuth hop, confirm the address bar is still the deployment you started on.

### 8. A drawing can be provably correct and still unreadable

Relay's wave had 22 passing tests, and its stage labels printed on top of each other; it was designed for 7 busy villas where production has 43 with work on 4. Tests assert the model, not the picture.

**Check.** Render any new drawing from the busiest real project, at real size, and look — including the empty case and the forty-rows case (`sharp` rasterises an SVG in three lines if no browser is at hand).

### 9. Throwing on a failed read has no retry behind it

For one evening Selections, Budgets and Indents threw "Something went wrong" and nothing reproduced it. Reads throw rather than show half an answer — right — but nothing retried a dropped connection, so one blip was a blank page.

**Rule.** Retry a connection-level failure before throwing; never retry a refusal, a constraint or a bad filter. `isTransient` (`lib/supabase/transient.ts`, tested) draws that line.
**Check.** Ask of any new failure path what one dropped packet shows the user. For a reported error, read `app_errors` (`0066`) first — its digest is the "Reference" on the error screen. A failure that leaves no record is the first bug to fix.

### 10. Copying a project's settings does not copy the settings that are content

On the fresh production project the 2FA email arrived as a magic link, not a code: Supabase sends a code only if the template contains `{{ .Token }}`, and the templates were left at their defaults (and the code length at 8). The schema diff was empty, because none of it lives in the database.

**Rule.** Diff platform configuration field by field, both projects; template text is configuration with behaviour.
**Check.** `GET /v1/projects/{ref}/config/auth` on both and compare every key (`db:compare` now does). Then request a code and read the email: six digits.

### 11. `security definer` changes the role, not `auth.uid()`

The obvious fix for an unguarded definer function — `if not has_app('/client-relations') then raise` — would have stopped Masters creating any unit, because the function's real caller is a trigger firing for a `/masters` user, and `has_app()` reads `auth.uid()`, which a definer never changes. The migration's own assertions would have passed.

**Rule.** A check inside a definer reached from a cross-tool trigger says which caller it means: `pg_trigger_depth() = 0` separates a direct call from a trigger. With no legitimate direct caller, revoke execute from `anon` and `authenticated` — the grant is the boundary.
**Check.** Fire the trigger on staging in a transaction ending in a deliberate `raise`, and count what it created.

### 12. A merge to `master` that never became a deployment

Nine commits merged, CI green, migrations applied, `db:compare` empty — and production served the commit from three hours earlier. Vercel had already built that exact SHA as the staging preview and raised no Production deployment. Promoting the preview is a trap: a preview build has staging's Supabase URL baked in.

**Rule.** A merge is not a deployment. Land on `master` first, then fast-forward `staging`; repair a missing deployment with a fresh commit on `master`, never "Promote to Production".
**Check.** Vercel's own Deployments list, Production, newest row = `git rev-parse --short origin/master`. GitHub's deployments API is an incomplete mirror — it missed real builds.

### 13. An honest model and a lying screen

An estimate with one unpriced material showed **MATERIALS ₹0**: the calculator returned `material: 0` beside `missingMaterialRateCount: 1`, and the screen read only the first half. Thirty tests proved the model right. The same day a mix with nothing in it said "Cost per cum: ₹0".

**Rule.** A total that cannot be known is `null` in the type that reaches the screen, never a number plus a flag. `0` is for things that genuinely cost nothing.
**Check.** Put every screen that prints money in its unknown state and read the numbers aloud.

### 14. Production shipped work the founder had never seen

"Go for the last step and merge to master" arrived in the same message as a correction; the correction was built and carried to production in one session. Every mechanical check passed; the founder had never opened the screen.

**Rule.** An instruction to ship covers only what the founder had seen when they gave it. Anything built since waits on staging for their word.
**Check.** Before `staging → master`: has the founder seen every feature in this diff on `staging.goodearthkannur.org`?

### 15. A native module the deploy forgot took down every button in the file

Vercel stopped packing `sharp`'s Linux binary, and `sharp` was imported at the top of a `"use server"` file, so every action in it died at load — including buttons that never touch an image, and the error screen's own logger. Local builds are fine; the defect is in what the deploy packs.

**Rule.** Load native modules lazily inside the one branch that uses them. `next.config.ts`'s `outputFileTracingIncludes` for sharp stays.
**Check.** A deployed button failing with a Reference `app_errors` lacks → `npx vercel logs <deployment>` within the hour. After a dependency change, press one button in each file that uses `sharp` (staff photo, design view, drawing sheet).

### 16. A type-narrowing filter quietly enforced a schema that no longer exists

After `0086` a takeoff row carries `item_id` and a null `material_id` by design; Supervisors still filtered `material_id !== null`, so every new estimate looked like no estimate at all. Generated view types make every column nullable, so some narrowing is mandatory — and an over-strict one passes every gate.

**Rule.** When a migration changes what can be null in a shared view, grep every consumer in STATUS.md's contract row for its narrowing filter, the same session.
**Check.** Make data shaped like the new world and open every screen in that view's contract row.

### 17. Google Chat answers a bad reply with silence

The door answers Google with hand-built JSON validated against a schema we don't have; a wrong shape shows "Relay not responding" or "Could not load dialog" while our log shows a normal 200. The traps learned: **(a)** Vercel Authentication must be off for the endpoint; **(b)** after an endpoint change, re-save the Chat config; **(c)** new slash commands take minutes to hours to dispatch; **(d)** plain ASCII in every command name and description — an em-dash stops dispatch; **(e)** a button's `onClick.action.function` is the door's URL; **(f)** once Google asks for a dialog, every answer is `action.navigations[].pushCard`; **(g)** a dialog submit is closed by the `createMessageAction` envelope alone, a private word is `action.notification.text`; **(h)** a card in a reply is `createMessageAction.message.cardsV2`; **(i)** `interaction: "OPEN_DIALOG"` lives inside `onClick.action`; **(j)** a card button accepts the same reply as a command; **(k)** a press on the bot's own card carries the bot as sender and the person in `chat.user`; **(l)** an error the person must act on stays in the dialog (`updateCard`, entries kept), not a toast.

**Rule.** Anything the door sends Google is not done until typed in the staging test space and seen. Prove a new shape with a hard-coded reply first; record what Google accepted beside the code.
**Check.** In the test space: `/court` with a baton in hand, press a button, open and save a dialog. An empty court proves nothing.

### 18. A green CI and a production deployment that failed before it built

`CRON_SECRET`, pasted into Vercel with invisible whitespace and saved as "sensitive", made every production deployment fail in one second; production kept serving the old build, so nothing looked broken.

**Rule.** Done means Vercel's Production row for the SHA says Ready. Secrets go through the API (`scripts/vercel-env.ts`), never pasted, never "sensitive".
**Check.** After every push to `master`: `gh api repos/<owner>/<repo>/commits/<sha>/status --jq '.statuses[0].description'` says "Deployment has completed", then one call to the changed route.

## Adding to this file

When something breaks that a green build said was fine, it belongs here, numbered next. Four things, short: **what happened, why every gate missed it, the rule, and the one check** — the check is the part that matters. Keep the whole page readable in five minutes.
