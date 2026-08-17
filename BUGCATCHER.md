# Bugcatcher — what a green build does not prove

CI runs prettier → lint → typecheck → test → build → check:actions. It is a good gate and it catches a lot.

**Every bug on this page passed all six.** Some of them shipped to production and sat there. They are collected here because they share one property: **nothing on this machine could have caught them**, so the only defence is knowing they exist and running the one check that does.

Read this before merging anything that touches a database read, a file upload, a permission, or a colour.

---

## Before you merge

Ten checks, each earned by a bug below.

| Check                                                                         | Because                                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Open the page in a browser.** Not the build output — the page.              | A bad PostgREST `select` compiles, type-checks and builds, then answers HTTP 300 at runtime. Four dead screens shipped this way.                          |
| **Sign in as a real single-grant user**, not as yourself.                     | An admin passes every permission check in the app and will never once see a grant bug.                                                                    |
| **Press the button that writes.** Upload the file, save the form.             | Binary uploads were silently corrupting for as long as the feature existed. Nothing errored.                                                              |
| **Look at what landed**, not at what the code sent.                           | Storage reported `image/jpeg` for a file that was not an image. The row wrote fine.                                                                       |
| **`gh run list`** — a successful push is not a green build.                   | CI stops at the first failure. A trivial formatting error silently skips every check that matters after it.                                               |
| **Look at the page in dark mode.**                                            | An entire class of browser-drawn furniture ignored the palette for months.                                                                                |
| **After a smoke test, read the traces.** The database says what actually ran. | A Google sign-in "worked" that never minted a session, and two tests reported done had left zero rows. Eyes lie; rows don't.                              |
| **Render any new drawing from real data and look at it.**                     | A wave with 22 passing tests still overlapped its own labels, and was designed for 7 villas where production has 43.                                      |
| **Fire the trigger, in a transaction you roll back.**                         | A permission check added to a definer function would have blocked the trigger it exists for — and the migration's own assertions would still have passed. |
| **Confirm a Production deployment exists for the merged commit.**             | A merge, a green CI and an applied migration all say "done" while the site serves the commit from three hours ago.                                        |

---

## The catalogue

### 1. A raw `Buffer` handed to Supabase Storage is silently text-decoded

_Found 2026-08-14, by the first photo the app had ever uploaded._

**What happened.** A 40KB JPEG stored as 124KB of rubbish — every byte that was not valid UTF-8 replaced with `EF BF BD`. Supabase still reported the file as `image/jpeg`. The database row wrote fine. No error appeared anywhere. The only symptom was a broken image.

**Why nothing caught it.** `supabase-js` builds a multipart body only when handed a `Blob`; anything else is passed to `fetch` as a raw body, and Next patches global `fetch`. **It does not reproduce locally** — the same code with the plain `@supabase/supabase-js` client stores clean bytes every time. It only fails under the Next runtime.

**The rule.** Hand Supabase Storage a `Blob`, never a raw `Buffer`:

```ts
const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
```

**The check.** Upload one real file, then read the object back and confirm its first three bytes are `ffd8ff` and its size matches what was sent. `uploadMyPhoto` now compares those sizes on every upload and refuses rather than storing rubbish.

**The near miss.** The identical line sat in Selections' design-view upload and had **never run** — that bucket was completely empty. The first render a designer uploaded would have corrupted the same way and gone into a client's quote PDF.

---

### 2. A broken PostgREST `select` passes every gate

_Client Relations shipped four dead screens behind a fully green CI._

**What happened.** An ambiguous embed answers HTTP 300 (`PGRST201`) at runtime. It is not a type error, `next build` compiles it, and the tests have no database.

**The trap.** A table with two foreign keys to the same target needs the key named — `plots!units_plot_id_fkey`. `units` has had two paths to `plots` since `0029`. The Directory's `staff_details` has **four** FKs to `profiles`, which is why that tool forbids embeds outright and merges through a `Map` instead.

**The check.** Open the page, or run the query. Running every `select` string in a module straight at the REST API takes a minute and catches all of them at once.

---

### 3. Supabase's default privileges grant more than the migrations ask for

_Found 2026-08-14 by an audit of Postgres privileges, and closed the same day by `0059`. It had been true since the first fact view shipped._

**What happened.** Any signed-in person — including one with no app grants at all — could update and delete production purchase orders, bills and budgets through the REST API. Three views were auto-updatable, and views bypass RLS by design.

**Why nothing caught it.** It was never in the code. `grant select on <view> to authenticated` **adds**; it does not replace, and the platform had already granted INSERT/UPDATE/DELETE on every new relation. `revoke … from public` does **not** remove `anon` or `authenticated` — they must be named.

**The rule.** Every new view ships `revoke insert, update, delete, truncate … from anon, authenticated` in the same migration; every new function ships `revoke execute … from public, anon`.

**The check.** Query `information_schema.role_table_grants` for write privileges held by `anon` or `authenticated` on anything in `information_schema.views`. The answer must be zero.

---

### 4. `color-scheme` is why every date picker was white

**What happened.** The app carried a full dark palette from the start but never declared `color-scheme`, so the browser drew its own furniture — date pickers, number steppers, select menus, scrollbars — in light colours on a dark page. Across roughly thirty forms.

**Why nothing caught it.** One line fixed all of them, and **nothing in CI could ever have seen it.** There is no test for "the browser's own widgets are the wrong colour."

**The check.** Open the page in dark mode and interact with every control that opens something.

---

### 5. `export type` from a `"use server"` file

**What happened.** A bare `export type { X }` in a file-level `"use server"` module crashes every action in its compiled chunk at load time. It caused a production outage.

**Why nothing caught it** — at the time. It is valid TypeScript and builds cleanly.

**Now gated.** `npm run check:actions` enforces it, in CI and locally. This entry stays because it is the reason that script exists; delete the script and the hole reopens silently.

Note the nuance: `export type Foo = {…}` as a _declaration_ is fine. The re-export forms (`export type { X }`, `export { type X }`, `export type * from`) are what break.

---

### 6. Reading the theme cookie in the root layout costs static rendering

**What happened.** Calling `cookies()` in the root layout turned `/login`, `/_not-found` and `/_global-error` from prerendered into server-rendered-on-demand. Cold starts are already the app's one measured performance problem — warm time-to-first-byte is ~0.2s and a cold one is ~1.0s, so turning a prerendered page into a rendered one puts every first visitor behind a function boot.

**Why nothing caught it.** Everything still worked. It was only slower, and only sometimes.

**The check.** Inspect `.next/prerender-manifest.json` before and after, the same way it was measured the first time. Do this before adding any `cookies()` or `headers()` call to a root layout.

---

### 7. A smoke test can pass in front of your eyes without ever running

_Found 2026-08-14, testing the sign-in hardening on its preview._

**What happened.** "Continue with Google" was declared working: click, account chooser, dashboard. The database said otherwise — the sign-in code was issued but **never exchanged**, `last_sign_in_at` hadn't moved in eleven days, and no session existed. The "dashboard" was an older session already in that browser. The cause: the OAuth return leg was built from a hardcoded `SITE_URL`, which on the preview pointed at **production** — where the old code had no `/auth/callback` route and bounced the returning sign-in to `/login` without a word. Separately, two tests reported as done (the lockout, the reset round-trip) had left **zero rows** — they had simply not been run.

**Why nothing caught it.** Every gate was green and every screen rendered. The failure lived in which _deployment_ a third party redirected back to, and in the gap between "I saw a dashboard" and "a session was minted". No local check sees either.

**The rule.** Auth flows must return to the address the request arrived at (`requestOrigin()` in `app/actions/auth.ts` — the Supabase redirect allow-list stays the gate), never to a hardcoded URL that previews falsify. And a browser pass of an auth flow is a claim, not evidence.

**The check.** Auth leaves receipts; read them. After any sign-in smoke test: `auth_verified_sessions` has the row with the right `method`, `auth.sessions` has a live session, `auth.users.last_sign_in_at` moved, and for the unhappy paths `login_attempts` shows the failures and the lock. On the return from any OAuth hop, glance at the address bar — you must still be on the deployment you started from.

---

### 8. A drawing can be provably correct and still unreadable

_Found 2026-08-14, building Relay's villa waves — caught before merge, by looking._

**What happened.** The wave model had twenty-two passing tests: stage positions, hump heights, marker placement, degenerate shapes, path geometry. Every one passed. The page those numbers produced had two faults no assertion could see. The stage names along the top **printed on top of each other** — Saarang runs a four-week Design straight into a sixteen-week Technical Drawings, and centred labels collide the moment two stages differ that much in width. And the real project has **43 villas with work on 4 of them**, so the page was going to be thirty-nine identical flat lines with the four that mattered buried among them. The design had been drawn against a mock with seven busy villas.

**Why nothing caught it.** Tests assert the model, not the picture. `buildWave` was right; the SVG was right; the arithmetic was right. Overlap is a fact about rendered text width, and "the interesting rows are outnumbered ten to one" is a fact about production data. Neither exists anywhere in the repo.

**The rule.** A visualisation is not finished when its model is tested. It is finished when you have **looked at it, drawn from real data, at the sizes it will really be seen at** — including the empty and the overwhelming cases. Mock data flatters a design because it is chosen to.

**The check.** Before merging any new drawing: pull the real rows for the busiest real project, render it, and look. No browser needed if none is available — `sharp` rasterises an SVG to PNG in three lines, and the pure model can be imported straight into a script (`npx tsx`). Then ask the two questions the mock never will: what does this look like when there is nothing, and what does it look like when there are forty of them?

---

### 9. Throwing loudly on a failed read has no retry behind it

_Found 2026-08-17, tracing error screens the founder hit across the Operations tools the evening before._

**What happened.** For one evening, Selections, Budgets and Indents threw repeated "Something went wrong" screens — worst when submitting, gone by morning, never reproduced. Nothing in the code had changed for three days. The reads in this app were deliberately made to **throw** rather than hand back half an answer — `fetchAll`, and the reads in the Indents pull path that had been turning a failed query into "that budget belongs to a superseded revision" or a bare "page not found". That was the right call, and it had already prevented real data loss. But **nothing anywhere in the codebase retried anything.** So a single dropped connection, one cold start, one moment of back-pressure, went straight to a blank page with a "Try again" button that reran the whole render.

**Why nothing caught it.** There was no defect to catch. Every gate was green because every line was correct; the failure only exists when the network misbehaves, which no test, type or build reproduces. It is also invisible after the fact: Supabase keeps about an hour of edge logs and Vercel's age out, so by the time anyone looks the evidence is gone. Diagnosing it needed a live forensic dig through production, and even that only surfaced one confirmed failure — a refused `DELETE` — because the app recorded nothing about its own errors.

**The rule.** "Throw rather than show a wrong answer" and "give up on the first failure" are two different decisions, and only the first one was ever argued for. A read that must be complete should still **retry a connection-level failure** before it throws — and must **never** retry a refusal, a constraint or a bad filter, which fail identically every time and only get slower. `isTransient` (`lib/supabase/transient.ts`) is where that line is drawn; it is pure and unit-tested precisely so the list can be argued with.

**The check.** Two, and they are cheap. Ask of any new failure path: _would this survive one dropped packet, and if it doesn't, what will the user see?_ And when a production error is reported, look for the record first — `app_errors` (0066) keeps the digest, the path and the route, which is the same "Reference:" code printed on the error screen. If a class of failure leaves no durable trace, that is the first bug to fix, before the one being reported.

---

### 10. Copying a project's settings does not copy the settings that are content

_Found 2026-08-17, minutes after production was switched to the fresh database — by the founder trying to sign in._

**What happened.** The 2FA email arrived as a **magic sign-in link** instead of the 6-digit code. The whole second factor had quietly turned into "click this link", which is a different, weaker thing — anyone with the inbox is in, no password needed. The cause: Supabase decides which of the two to send by **looking at the email template**. If the magic-link template contains `{{ .Token }}` it sends a code; if it doesn't, it sends a link. Building the new project copied its auth _configuration_ — allow-list, expiry, sign-ups off, all fifteen fields — but the templates are also config, and they were left at Supabase's defaults. The default template has a link in it. `mailer_otp_length` was also still at the default **8**, so even with the right template the code would not have fitted the six-box sign-in screen.

**Why nothing caught it.** Nothing was wrong with the code, and nothing was wrong with the database. The schema comparison — 4,304 objects, columns, policies, grants, functions, triggers, storage — was an empty diff, because none of this lives in the database. It is project settings held by the platform, and the only two that were checked by eye were the ones with obvious names (`site_url`, `disable_signup`). The setting that decided whether two-factor authentication still existed was a **paragraph of HTML** three screens down a settings page.

**The rule.** When a platform holds configuration outside your database, **diff it the same way you diff the schema** — field by field, both projects, no eyeballing. And treat template text as configuration with behaviour, not decoration: here, one `{{ .Token }}` was the difference between a second factor and a magic link.

**The check.** `GET /v1/projects/{ref}/config/auth` on both projects and compare **every key**, not the ones you thought of. Then the behavioural one, which takes thirty seconds and is the only real proof: **request a code and read the email**. It must contain digits, and the right number of them. A sign-in flow that "sent an email" is not a sign-in flow that works.

---

### 11. `security definer` changes the role, not `auth.uid()`

_Caught 2026-08-17 while writing `0071`, before it was applied — the audit's own suggested fix would have broken adding a plot for everyone in Masters._

**What nearly happened.** `create_client_engagement` is `SECURITY DEFINER` with no permission check, so any signed-in person could write Client Relations records against any plot. The obvious fix, and the one first written down, is `if not has_app('/client-relations') then raise`. That would have closed the hole **and stopped Masters from being able to create a unit at all** — because the function's real caller is the `units_seed_engagement` trigger, which fires for a person holding `/masters`.

**Why the reasoning was wrong.** `SECURITY DEFINER` changes the Postgres **role** the body runs as. It does **not** change `auth.uid()`, which comes from the request's JWT and stays the signed-in person however deep the nesting goes. `has_app()` is built on `auth.uid()`. So "the trigger path runs as the definer, so the check passes" is false: the check is evaluated against whoever made the request, in every path. That is the exact invisible failure `0050` made the function `SECURITY DEFINER` to avoid, reintroduced by the fix for a different problem.

**Why nothing would have caught it.** No test here touches a database, `next build` compiles SQL not at all, and the migration's own assertions would have passed — the function body would have contained precisely what it was asked to contain. It would have failed the first time somebody added a plot, days later, in production, and looked like a Masters bug.

**The rule.** A permission check inside a definer function reached from a **cross-tool trigger** must say which caller it means. `pg_trigger_depth() = 0` distinguishes a direct REST call from a trigger, so a grant-holder and the trigger both pass and nobody else does. And when the function has no legitimate direct caller at all, revoke `execute` from `anon` and `authenticated` — the grant is then the boundary, which is stronger than any body check.

**The check.** Run the trigger, in a transaction you roll back. Insert the row that fires it against the staging database and count what the trigger was supposed to create; end the block with a deliberate `raise` so the counts come back and nothing persists. Reading the function body proves nothing about who can reach it.

---

### 12. A merge to `master` that never became a deployment

_Found 2026-08-17 by the founder, looking at the Vercel dashboard after being told the release was live. It was not._

**What happened.** Nine commits were merged to `master` as a fast-forward and pushed. GitHub had them, CI went green on `master`, both migrations were applied to production, `db:compare` was empty. Everything said done. **Production was still serving the commit from three hours earlier**, and would have gone on serving it indefinitely.

Vercel had built the commit — but only as the **staging Preview**. There was no Production deployment for it at all. The dashboard showed one row where every other commit that day had two.

**Why.** The order the branches were pushed in. The normal habit here is master first, then merge back into `staging`; that day the work was merged to `staging` first and sat there for testing, and `master` was then fast-forwarded to the **identical commit**. Vercel had already built that SHA for the preview and did not raise a second deployment for it. (That is the mechanism the evidence points to — same SHA, second push, no build — rather than something proven from Vercel's internals. The rule below holds either way.)

**Why nothing caught it.** Nothing in this repo watches deployments. CI proves the code compiles and the tests pass; the migration gate proves the database is ready; `db:compare` proves the two databases match. **Not one of them looks at what is actually being served.** Every signal was green and every signal was about something else. The GitHub Deployments API is where the absence is visible, and nobody reads it.

**And a trap in the fix.** The obvious repair is Vercel's **Promote to Production** on that preview row. Do not: promoting rolls out that exact _build_, and a preview build has the **staging** Supabase URL and anon key inlined at build time by Next. It would put the production domain in front of the practice database — the one accident the whole staging arrangement exists to prevent. The repair is a fresh commit on `master`, which builds with production environment variables.

**The rule.** **A merge is not a deployment.** After merging to `master`, confirm a **Production** deployment exists for that exact commit before telling anyone the release is out. And prefer the documented order — land on `master`, then fast-forward `staging` back to it — so master's push is the first the platform sees of that SHA.

**The check.** One command, no dashboard:

```
gh api repos/<owner>/<repo>/deployments \
  -q '.[] | select(.environment=="Production") | "\(.created_at) \(.sha[0:7])"' | head -1
```

The SHA it prints must equal `git rev-parse --short origin/master`. If it does not, nothing you merged is live.

---

## Adding to this file

When something breaks that a green build said was fine, it belongs here — not in `STATUS.md`, which is what exists, and not in `TODO.md`, which is what to do next. **This file is the only standing record of the failures CI cannot see, so an entry has to explain itself in full rather than cite a finding somewhere else.** Anyone reading it in a year should not need a second document, and there is no longer one to reach for.

Write four things: **what happened**, **why every gate missed it**, **the rule**, and **the one check that would have caught it**. The check is the part that matters; a war story without one is just a war story.

Keep each entry short enough that the whole page is still worth reading in five minutes. A catalogue nobody finishes catches nothing.
