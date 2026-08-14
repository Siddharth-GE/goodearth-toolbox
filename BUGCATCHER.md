# Bugcatcher — what a green build does not prove

CI runs prettier → lint → typecheck → test → build → check:actions. It is a good gate and it catches a lot.

**Every bug on this page passed all six.** Some of them shipped to production and sat there. They are collected here because they share one property: **nothing on this machine could have caught them**, so the only defence is knowing they exist and running the one check that does.

Read this before merging anything that touches a database read, a file upload, a permission, or a colour.

---

## Before you merge

Seven checks, each earned by a bug below.

| Check                                                                         | Because                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Open the page in a browser.** Not the build output — the page.              | A bad PostgREST `select` compiles, type-checks and builds, then answers HTTP 300 at runtime. Four dead screens shipped this way. |
| **Sign in as a real single-grant user**, not as yourself.                     | An admin passes every permission check in the app and will never once see a grant bug.                                           |
| **Press the button that writes.** Upload the file, save the form.             | Binary uploads were silently corrupting for as long as the feature existed. Nothing errored.                                     |
| **Look at what landed**, not at what the code sent.                           | Storage reported `image/jpeg` for a file that was not an image. The row wrote fine.                                              |
| **`gh run list`** — a successful push is not a green build.                   | CI stops at the first failure. A trivial formatting error silently skips every check that matters after it.                      |
| **Look at the page in dark mode.**                                            | An entire class of browser-drawn furniture ignored the palette for months.                                                       |
| **After a smoke test, read the traces.** The database says what actually ran. | A Google sign-in "worked" that never minted a session, and two tests reported done had left zero rows. Eyes lie; rows don't.     |

---

## The catalogue

### 1. A raw `Buffer` handed to Supabase Storage is silently text-decoded

_Found 2026-08-14, by the first photo the app had ever uploaded. `AUDIT.md` BUG-01._

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

_`AUDIT.md` SEC-01, found 2026-08-14, closed by `0059`._

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

**What happened.** Calling `cookies()` in the root layout turned `/login`, `/_not-found` and `/_global-error` from prerendered into server-rendered-on-demand. Cold starts are already the app's known performance problem (`AUDIT.md` PERF-01).

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

## Adding to this file

When something breaks that a green build said was fine, it belongs here — not in `STATUS.md`, which is what exists, and not only in `AUDIT.md`, which is findings open at a point in time.

Write four things: **what happened**, **why every gate missed it**, **the rule**, and **the one check that would have caught it**. The check is the part that matters; a war story without one is just a war story.

Keep each entry short enough that the whole page is still worth reading in five minutes. A catalogue nobody finishes catches nothing.
