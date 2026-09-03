# Bugcatcher — what a green build does not prove

CI runs prettier → lint → typecheck → test → build → check:actions. It is a good gate and it catches a lot.

**Every bug on this page passed all six.** Some of them shipped to production and sat there. They are collected here because they share one property: **nothing on this machine could have caught them**, so the only defence is knowing they exist and running the one check that does.

Read this before merging anything that touches a database read, a file upload, a permission, or a colour.

---

## Before you merge

Eleven checks, each earned by a bug below.

| Check                                                                         | Because                                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Open the page in a browser.** Not the build output — the page.              | A bad PostgREST `select` compiles, type-checks and builds, then answers HTTP 300 at runtime. Four dead screens shipped this way.                          |
| **Sign in as a real single-grant user**, not as yourself.                     | An admin passes every permission check in the app and will never once see a grant bug.                                                                    |
| **Press the button that writes.** Upload the file, save the form.             | Binary uploads were silently corrupting for as long as the feature existed. Nothing errored.                                                              |
| **Look at what landed**, not at what the code sent.                           | Storage reported `image/jpeg` for a file that was not an image. The row wrote fine.                                                                       |
| **`gh run list`** — a successful push is not a green build.                   | The build and the action check run only once the four static checks pass, so a push that looked fine can have a red run behind it.                        |
| **Look at the page in dark mode.**                                            | An entire class of browser-drawn furniture ignored the palette for months.                                                                                |
| **After a smoke test, read the traces.** The database says what actually ran. | A Google sign-in "worked" that never minted a session, and two tests reported done had left zero rows. Eyes lie; rows don't.                              |
| **Render any new drawing from real data and look at it.**                     | A wave with 22 passing tests still overlapped its own labels, and was designed for 7 villas where production has 43.                                      |
| **Fire the trigger, in a transaction you roll back.**                         | A permission check added to a definer function would have blocked the trigger it exists for — and the migration's own assertions would still have passed. |
| **Confirm a Production deployment exists for the merged commit.**             | A merge, a green CI and an applied migration all say "done" while the site serves the commit from three hours ago.                                        |
| **Read the number the screen prints for the empty and unknown cases.**        | A total whose model correctly said "nothing here is priced" still printed a confident ₹0 on the page.                                                     |

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

**The check — and the false one, which is the second lesson.** Look at **Vercel's own Deployments list**, filtered to Production, and confirm the newest row's commit equals `git rev-parse --short origin/master`. That dashboard is the source of truth.

The tempting shortcut does not work:

```
# UNRELIABLE — do not trust this to prove a deployment exists
gh api repos/<owner>/<repo>/deployments \
  -q '.[] | select(.environment=="Production") | "\(.created_at) \(.sha[0:7])"' | head -1
```

It was written as the check for this entry and **failed on its first real use**. GitHub's Deployments API is a mirror Vercel posts into, and it is not complete: a preview build visible in the Vercel dashboard was entirely absent from it, and later pushes produced no rows at all. A check that reports "no deployment" when one exists is worse than no check, because the next person spends an hour debugging a deployment that already happened.

Automating this properly needs a **Vercel** API token, which this machine deliberately does not have — only Supabase ones. Until that exists, the dashboard is the answer, and "I merged it" is never the same sentence as "it is live".

---

### 13. An honest model and a lying screen

_Caught 2026-08-19 on staging, building the Estimator — before it shipped, by reading the figure the page printed._

**What happened.** An estimate whose only material was unpriced showed **MATERIALS ₹0**. Every part of that was built to prevent exactly this: `formatMoney(null)` prints "—", the calculator returns `null` for any cost it cannot know, the per-line cells and the material takeoff both correctly showed "Not priced" and a dash. The one number that got it wrong was the column total, and it was the biggest number on the screen.

**Why.** `computeEstimateTotals` summed _what was known_ and reported `material: 0` alongside `missingMaterialRateCount: 1`. That pair is honest — 0 known rupees, 1 line we cannot price — and the function's own comment said to read them together. **The screen read only the first half.** Thirty passing tests all asserted the pair, so the model was proved right about a screen that was wrong.

**Why nothing caught it.** There was no defect to find. Types were satisfied (`number` is a fine type for a sum), tests passed because they tested the model, and the build has no opinion about what a figure means. "Zero" and "unknown" are the same bits; only the rendering distinguishes them, and only a person can see the rendering.

**The rule.** **A total that cannot be known must be `null`, not `0`, in the type that reaches the screen** — never a number plus a flag the caller is trusted to check, because a caller that forgets produces a confident lie rather than a visible gap. Reserve `0` for a column that genuinely costs nothing; the Estimator's labour-only estimate really does have ₹0 of materials, and that is a different sentence from "nobody has priced them".

**The check.** Put a screen in its unknown state and **read the numbers on it out loud**: an estimate with nothing priced, a report with no rows, a total whose inputs are missing. If a figure says ₹0, ask whether the app knows it is zero or merely does not know. Model tests cannot answer that question, because the model is usually right.

**It happened again the same day.** The founder's first real session found the second instance one screen over: a mix with nothing in it yet said **"Cost per cum: ₹0 — from today's material rates"**. The mix page computed its figure locally instead of going through the calculator's null rules, and `reduce` over an empty list is 0. Same disease, same fix (`null` + "nothing in it yet"), and proof the check above has to walk **every** screen that prints money, not the one where the bug was first found.

---

### 14. Production shipped work the founder had never seen

_Caught 2026-08-20 by the founder, reading the release summary of features they were hearing about for the first time._

**What happened.** Mid-soak, the founder sent one message carrying a correction (the reconciliation flag, `0083`) and the words "go for the last step and merge to master". The correction was built, merged to staging and carried straight on to production in the same session: green PRs, migrations applied in order, `db:compare` empty, the Vercel Production row confirmed against the exact SHA. Every mechanical check in this file passed, because every one of them was pointed at the code and the databases. **The founder had never opened the reconciliation screen.** "Merge to master" was read as sign-off — but it was spoken before the work it ended up covering existed.

**Why every gate missed it.** Every gate here is mechanical, and the gate that failed is human. CI proves the code compiles; the ledger proves the databases are ready; the deployment row proves the site serves the commit. **None of them can know what the founder has looked at.** The staging protocol's step 4 — leave it on `staging.goodearthkannur.org` for real use — was the check, and it was skipped on the strength of an instruction that predated the feature.

**The rule.** **An instruction to ship covers only what the founder had seen when they gave it.** Anything built in the current conversation stops at staging — production waits until the founder says they have tried that feature on `staging.goodearthkannur.org`. "Merge to master", "go ahead", "finish it" never roll forward onto work that did not exist when the words were typed.

**The check.** Before `staging → master`, ask one question of the diff: **has the founder seen every feature in this on the staging site?** If any part of it was built since their last look, the answer is no, and the merge waits for one sentence from them.

### 15. A native module the deploy forgot took down every button in the file

_Caught 2026-08-22 by the founder, pressing "Add a drawing" on staging during their vet._

**What happened.** Vercel's build stopped packing `sharp`'s Linux binary (`libvips-cpp.so`) into the serverless functions. `sharp` was imported at the top of `lib/design-management/actions.ts`, so **every server action in that file died at module load** — including "Add a drawing", which never touches an image. Worse: the crash killed the error screen's own `recordAppError` call too (it posts through the same broken route), so `app_errors` stayed empty while the founder held a Reference code that led nowhere. Local `next build` + `next start` at the same commit worked perfectly — the Windows install has its own platform binaries and no tracing step.

**Why every gate missed it.** Lint, types, tests and `next build` all pass — the defect is in **which files the deploy packs into the lambda**, decided after the build, on Vercel, per platform. The step-7 probe smoke proved the whole path against a local production build and was still blind, because it never ran on the deployed runtime. Two wrong theories (an RLS mismatch, Vercel's SSO wall eating POSTs) each fit the evidence for a while — the thing that settled it in one line was **`npx vercel logs <deployment>`**, which held the real stack trace with its digest. Those logs age out in about an hour.

**The rule.** **Never import a native module (`sharp`, anything with a `.so`/`.node`) at the top of a `"use server"` file** — load it lazily inside the one branch that uses it, so a packaging failure is confined to that button and answers with that action's own error message. And `next.config.ts` pins `outputFileTracingIncludes` for sharp's Linux packages — do not remove it because local builds work; local builds are exactly the place this cannot reproduce.

**The check.** When a deployed button fails with a Reference code that `app_errors` doesn't hold, go straight to `npx vercel logs` for that deployment (the CLI on the founder's machine is signed in) — and go quickly, the logs are gone within the hour. After any deploy that changes dependencies or Vercel's build behaves oddly, press one button in each file that touches `sharp`: a staff photo, a design view, a drawing sheet.

### 16. A type-narrowing filter quietly enforced a schema that no longer exists

_Caught 2026-08-22 by a supervisor on staging: Villa 10's freshly submitted estimate showed nothing at all on the Supervisors villa page, so no material could be requested._

**What happened.** Migration `0086` changed the meaning of `estimate_takeoff_facts`: a recipe built against the shared items master carries `item_id` and a **null `material_id`, by design**. The Supervisors read (`lib/supervisors/queries.ts`) still narrowed the view's all-nullable rows with `row.material_id !== null` — correct before `0086`, silently wrong after. Every takeoff row of a post-`0086` estimate failed that guard, so the villa page concluded the villa had **no official estimate at all** and offered nothing to request. The estimate, the snapshot and the view were all perfect; the drop happened in the last twenty lines before the screen.

**Why every gate missed it.** The generated types make **every** column of a view nullable, so some narrowing filter is mandatory — and typecheck is _happier_ the stricter it is. An over-strict guard is indistinguishable, to every mechanical gate, from a correct one: it lints, type-checks, builds, and the unit tests exercise the pure arithmetic downstream of the filter. The page renders fine too, because "this villa has no estimate yet" is a legal, styled state — the screen showed a truthful-looking emptiness. And `0086` itself shipped green: the drift was between a migration's _meaning_ and a consumer's _assumption_, which no single diff ever contained.

**The rule.** **When a migration changes which columns of a shared view can be null — or what a null means — grep every consumer of that view for its narrowing filter in the same session, and widen each one deliberately.** STATUS.md's contract table names the consumers; the table is the checklist, not just documentation. A narrowing `.filter()` over a view's row type is a **restatement of the schema contract in code**, and it does not update itself. (Same session's second find: the Indents estimate-pull path has the identical assumption, keyed on `material_id` end-to-end — in TODO.md, because that one is a redesign of the row key, not a dropped guard.)

**The check.** Submit an estimate whose recipe uses a post-`0086` items-master component, then open **every screen in the view's contract row** — Supervisors villa page, Indents pull-from-estimate, the Inventory issue note — and confirm the materials actually appear. A view's consumers are only ever proven by data shaped like the _new_ world; every old fixture and every old villa passes forever.

---

### 17. Google Chat answers a bad reply with silence, and CI cannot see a reply at all

_Caught twelve times between 2026-09-01 and 2026-09-03, building the Relay bot (`app/api/google-chat/route.ts`, `lib/google-chat/`). Every one of them was a green build, a green typecheck and 700-odd green tests, followed by "Relay not responding" or a command that simply never arrived._

**What happened.** The door answers Google with JSON it builds by hand, and Google validates that JSON against a schema we do not have in the repo. When the shape is wrong Google does not send an error back: it shows the person "Relay not responding" or "Could not load dialog", or delivers nothing, while the door logs a normal event and a 200. The twelve shapes, each learned the hard way — **(a)** Vercel's SSO protection covered the custom domain too, so the endpoint had to be an unprotected domain; **(b)** a saved endpoint change delivers nothing until the config is re-saved once the endpoint answers; **(c)** slash commands take minutes to hours to start dispatching after they are declared; **(d)** a command whose console _description_ contains an em-dash is never dispatched — plain ASCII in every command name and description; **(e)** for an HTTP app a card button's `onClick.action.function` is the door's URL, never a name; **(f)** once Google has asked for a dialog (`dialogEventType: "REQUEST_DIALOG"`) every answer must be a dialog (`action.navigations[].pushCard`), a message envelope there is "Could not load dialog"; **(g)** a dialog submit is closed by the public `createMessageAction` envelope _alone_, an `endNavigation` beside it is invalid, and a private word is `action.notification.text` on the close; **(h)** a card in an ordinary reply is `createMessageAction.message.cardsV2`, and `privateMessageViewer` still applies to it; **(i)** a button's `interaction: "OPEN_DIALOG"` lives _inside_ `onClick.action`, one level up Google rejects the whole card; **(j)** a button on a message card accepts the same `createMessageAction` reply as a command; **(k)** a press on the bot's own card carries that card as `buttonClickedPayload.message` with the _bot_ as its sender and the person in `chat.user`, so refusing on "a bot in the envelope" refuses every button. **(l)** a `notification` toast on a closing dialog is not a warning anyone sees — an error the person must act on stays in the dialog, re-rendered with `updateCard`, their entries preserved.

**Why every gate missed it.** The reply is `Record<string, unknown>` all the way down — there is no type for Google's envelope in the repo, so typecheck has nothing to check; the tests pin _our_ shape, which is exactly what was wrong; and the build never talks to Google. The only judge of a reply is Google, at runtime, in a real space, and it does not say why.

**The rule.** **A change to anything the door sends back to Google — a card, a dialog, a button, a close — is not done until someone has typed the command in the test space on staging and seen the answer.** Prove a new envelope shape with a ten-line hard-coded reply before writing the code behind it, and record what Google accepted, verbatim, beside the code that sends it. When a reply fails, read the door's log line first (`npx vercel logs staging.goodearthkannur.org --json`): a logged event with a normal identity decision and no error means Google rejected the JSON, not that the door broke.

**The check.** After any change under `lib/google-chat/cards.ts` or the door's reply helpers: in the linked test space, `/court` with at least one baton in hand (a card with rows _and_ buttons), press one button, open one dialog and save it. An empty court proves nothing — trap (i) rendered perfectly until the first row appeared.

---

## Adding to this file

When something breaks that a green build said was fine, it belongs here — not in `STATUS.md`, which is what exists, and not in `TODO.md`, which is what to do next. **This file is the only standing record of the failures CI cannot see, so an entry has to explain itself in full rather than cite a finding somewhere else.** Anyone reading it in a year should not need a second document, and there is no longer one to reach for.

Write four things: **what happened**, **why every gate missed it**, **the rule**, and **the one check that would have caught it**. The check is the part that matters; a war story without one is just a war story.

Keep each entry short enough that the whole page is still worth reading in five minutes. A catalogue nobody finishes catches nothing.
