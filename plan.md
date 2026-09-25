# plan.md — Dexter: shareable HTML decks

_Written by Fable, 2026-09-25. Built on `feature/dexter` off `staging`; one migration (`0095`). Tick each step here as it lands; a lower tier writes any deviation as a question at the bottom, never into the code. Founder decisions taken 2026-09-25: uploads capped at 4 MB (the drawings path, no direct-to-storage machinery); a Dexter project is a named folder, not a Masters link._

## Context

Design makes client presentations as standalone HTML (a single file, or a zip of `index.html` plus assets). Today they travel as attachments. Dexter is a small Management tool where someone with the grant creates a **project** (a folder with a name), uploads a deck into it, and gets a **standalone link** a client can open without signing in. The link is the whole gate: it carries a random token, can be switched off, and can be re-issued. Nothing else in the toolbox reads Dexter and Dexter reads nothing but `profiles` for names.

Two things in this build are new to the toolbox and must be done deliberately:

1. **A public route with a dynamic path.** `PUBLIC_PATHS` is exact strings by rule. A deck's assets must resolve relatively (`assets/a.css` next to `index.html`), so the viewer needs a path prefix. `/deck/` becomes the one named prefix beside Marathon's, and the rule text in `SECURITY.md` and `lib/supabase/proxy.ts` says so.
2. **Untrusted HTML served from the app's own origin.** An uploaded page runs its own scripts. Served plainly it could make credentialed requests to the toolbox as whoever is viewing it. Every deck response carries `Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals` — no `allow-same-origin` — so the page runs with an opaque origin: scripts and relative assets work, cookies and same-origin fetches do not. This is the standard answer for same-origin user HTML without a second domain.

The public reader has no session, so it looks the token up through the **admin client** — the same shape as `/api/keep-alive` and the Google Chat door. It is one file, it reads two things (the deck row by token, one object by path), it never writes, and `SECURITY.md` lists it. The alternative (an anon-callable definer function plus an anon storage policy) opens more surface, not less.

## Scope

**In:** projects (create, rename, delete when empty) · decks (upload `.html` or `.zip`, rename, replace the file keeping the same link, stop/resume sharing, issue a new link, delete) · a public viewer at `/deck/<token>/<entry>` · welcome screen with counts · `/dexter` grant.

**Out, deliberately:** view counts, passwords on links, expiry dates, a Goodearth frame around the deck, uploads above 4 MB, linking to Masters projects or clients. Each is a later small plan if wanted.

## Data — `supabase/migrations/0095_dexter.sql` `[Fable]` (drafted in the planning session)

Header and shape as `0084`/`0091`: re-runnable throughout, numbered sections, a closing `do $$` block that proves it landed.

1. **`/dexter` becomes a grantable app** — restate both `user_apps_app_known` and `role_apps_app_known` in full (0084's list plus `/dexter`), identically.
2. **`dexter_projects`** — `id uuid pk`, `name text not null check (length(trim(name)) > 0)`, `client_name text` (nullable, free text), `created_by uuid references profiles(id)`, `updated_by`, `created_at`, `updated_at`. Unique on `lower(name)`.
3. **`dexter_decks`** — `id uuid pk`, `project_id uuid not null references dexter_projects(id)` (RESTRICT — a project with decks refuses deletion), `title text not null check (…)`, `entry_path text not null` (e.g. `index.html`), `share_token text not null unique` (22 chars base64url from 16 random bytes, generated in the action), `share_enabled boolean not null default true`, `file_count int not null`, `total_bytes bigint not null`, `uploaded_by uuid references profiles(id)`, `created_by`, `updated_by`, `created_at`, `updated_at`. Index on `project_id`. Objects live at `decks/<deck_id>/<relative path>`; no file table — Storage is the file list.
4. **Triggers** — `audit_<table>` via `audit_row()` and `set_updated_at` on both, in the same `do $$` loop 0091 uses; `enable row level security` on both.
5. **Policies** — one SELECT per table `using (has_app('/dexter'))`; INSERT/UPDATE/DELETE `has_app('/dexter')`. Nothing for `anon`, ever — the public reader uses the admin client.
6. **Bucket `dexter`** — private, `file_size_limit` 10 MB per object (one uncompressed asset can be larger than the 4 MB zip it came from), `allowed_mime_types` null (a deck carries fonts, video, JSON). Three `storage.objects` policies (select / insert / delete) on `bucket_id = 'dexter' and public.has_app('/dexter')` — `public.` qualified, as 0091 explains. No update policy: a replacement is a new set of objects.
7. **Prove it** — both CHECKs admit `/dexter`; both tables have RLS and exactly one SELECT policy; the bucket is private at 10 MB; exactly three `dexter %` storage policies.

Then `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit` and `npm run db:types:staging`; commit types with the migration.

## Files

### Registry and shell `[Haiku]`

- `lib/tools.ts` — import `Presentation` from lucide, add to `TOOL_ICONS`; entry `{ name: "Dexter", description: "Client presentations as shareable links — upload an HTML deck, send the link.", href: "/dexter", icon: "Presentation", group: "Management", built: true }`.
- `app/(dashboard)/dexter/loading.tsx`, `projects/loading.tsx`, `projects/[projectId]/loading.tsx` — `PageLoading`.

### Proxy `[Opus]`

- `lib/supabase/proxy.ts` — add `const PUBLIC_PREFIXES = ["/deck/"]` under `PUBLIC_PATHS` with a comment stating why this one is a prefix (relative asset resolution) and what its gate is (the token inside the route); `isPublicPath = PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some(p => path.startsWith(p))`. Identity headers are still stripped on the way through (the existing flow already does). Update the "Exact match, not startsWith" comment to name the exception.

### Pure logic `[Sonnet]` — `lib/dexter/unpack.ts` + `unpack.test.ts`, no imports from the app

_Done. `lib/dexter/unpack.ts` exports exactly `contentTypeFor`, `safeDeckPath`, `ZipEntry`, `ZipPlan`, `planZip` — confirmed against `app/deck/[token]/[[...path]]/route.ts`, which already imports `contentTypeFor` and `safeDeckPath` and compiles clean. 20 new cases in `unpack.test.ts` (traversal, encoded traversal, folder-stripping, `__MACOSX`, no-index, single-html-as-entry, content types incl. unknown/uppercase), all passing._

- `contentTypeFor(path)` — extension map: html, htm, css, js, mjs, json, map, png, jpg, jpeg, gif, svg, webp, avif, ico, woff, woff2, ttf, otf, mp4, webm, mp3, ogg, wav, pdf, txt, md, xml, wasm; default `application/octet-stream`.
- `safeDeckPath(segments: string[])` — joins and rejects `..`, empty, leading `/`, backslashes, `%`-encoded traversal, and anything over 200 chars; returns `null` when unsafe.
- `planZip(entries: { name: string; size: number; isDirectory: boolean }[])` — drops directories, `__MACOSX/`, `.DS_Store`, dotfiles, unsafe paths; if every file shares one top-level folder, strips it; picks the entry: `index.html` at root, else the single `.html` at root, else fails with a plain reason. Refuses more than 500 files or more than 40 MB unpacked (zip-bomb guard). Returns `{ entry, files: [{ zipName, deckPath, size }] } | { error }`.
- `newShareToken()` — `crypto.randomBytes(16)` base64url (lives in `lib/dexter/share.ts`, Node `crypto`); `shareUrl(origin, token, entry)` pure.

### Reads `[Sonnet]` — `lib/dexter/queries.ts` (`import "server-only"`)

_Done — `getWelcomeCounts`, `listProjects` (deck counts via a `Map`, no embed), `getProject` (uploader names merged from `profiles` through a `Map`)._

Every function: `await requireTool(GRANT)` then `createClient()`; failures through `readFailed("dexter", …)`. `GRANT` in `lib/dexter/shared.ts`; `DEXTER_BUCKET` in `lib/dexter/storage.ts` (both importable by a route and a `"use server"` file).

- `getWelcomeCounts()` — projects, decks, decks with sharing on (three `head: true` counts in `Promise.all`).
- `listProjects()` — with deck counts (a second query grouped in a `Map`, no embed).
- `getProject(id)` — project + decks ordered by `created_at desc`, uploader names merged from `profiles` through a `Map` (BUGCATCHER #2 — no embed).

### Writes `[Sonnet]` — `lib/dexter/actions.ts` (`"use server"`, `ActionState`, `requireTool(GRANT)` first, `revalidatePath("/dexter", "layout")`)

_Done — `createProject`, `renameProject`, `deleteProject`, `uploadDeck`, `replaceDeckFile`, `renameDeck`, `setDeckSharing`, `reissueDeckLink`, `deleteDeck`. Two notes for the review pass: the entry-size read-back (`verifyEntrySize`) searches on the plan's actual `entry` filename rather than a literal `"index.html"`, since a zip's entry can legitimately be a differently-named single root `.html` file; and the folder-listing helper (`listFolderPaths`, private to actions.ts as instructed) recurses into Storage's folder pseudo-entries (`id: null`), which the plan's wording didn't spell out but which replace/delete need — a deck's assets live in subfolders Storage's own `list` only shows one level of._

- `createProject`, `renameProject`, `deleteProject` (refuse with a plain message when decks exist — the FK also refuses).
- `uploadDeck(projectId, formData)` — the drawings pattern step for step (`lib/design-management/files-actions.ts`): `File` instance, size ≤ 4 MB, type `text/html` or a `.zip` (`application/zip`, `application/x-zip-compressed`, or name ends `.zip` — browsers disagree). HTML: one object at `decks/<id>/index.html`, entry `index.html`. Zip: `fflate.unzipSync` (new dependency — pure JS, no native binary, so BUGCATCHER #15 cannot happen), `planZip`, upload each file as a `Blob` (never a `Buffer`, BUGCATCHER #1) with `contentTypeFor`, six at a time. Row is written first with the id generated in the action (`crypto.randomUUID()`), then objects; on any upload failure remove what landed and delete the row. Read back one object's size (the entry) and compare, as drawings does.
- `replaceDeckFile(deckId, formData)` — same validation; uploads into `decks/<id>/` after removing existing objects (`list` paginated, then `remove`); keeps the token. Updates `entry_path`, `file_count`, `total_bytes`.
- `renameDeck`, `setDeckSharing(deckId, enabled)`, `reissueDeckLink(deckId)` (new token; old link dies), `deleteDeck` (row first, then objects — the reverse of upload).

### Screens `[Sonnet]` — `app/(dashboard)/dexter/`

_Done — layout, welcome page, `projects/` list + New project dialog, `projects/[projectId]/` detail with rename/delete, Upload a deck dialog, and the deck table with its DropdownMenu (open, copy, rename, replace file, link off/on, new link, delete). `renameProject`/`renameDeck` take plain arguments rather than `(prevState, formData)`, so their dialogs read the form by hand on submit (the `uploadDrawingRevisionFile` shape) instead of `useActionState` — noted since the plan named `useActionState` as the pattern to copy generally. The three `loading.tsx` files (`dexter/`, `dexter/projects/`, `dexter/projects/[projectId]/`) are built here too, per the direct task brief, though the plan's file list put them under `[Haiku]`._

- `layout.tsx` — `requireUser` + `requireApp(user, "/dexter")`, `PageTitle` "Dexter".
- `page.tsx` — `ToolWelcome` (icon `Presentation`; three plain paragraphs; counts; links → Projects primary).
- `projects/page.tsx` — `Card` list of projects (name, client, deck count, updated), "New project" `Dialog` with the `record-form-dialog` shape if it fits, else `Dialog` + `Input` + `FormMessage`.
- `projects/[projectId]/page.tsx` — project header with rename and delete; deck list as `Table` on a laptop; each row: title, entry, size, uploaded by/when, sharing pill (`Badge` success "Link on" / muted "Link off"), actions in a `DropdownMenu`: Open (new tab), Copy link, Rename, Replace file, Link off/on, New link, Delete. "Upload a deck" `Dialog`: title + file input (`accept=".html,.zip"`) + note "HTML file or a zip with index.html at its root, up to 4 MB". `_components/`: `upload-deck-dialog.tsx`, `deck-actions.tsx` (client; `useActionState`; copy uses `navigator.clipboard` with a plain fallback showing the URL in an `Input`). The share URL is built from `SITE_URL`-free request origin: pass `origin` from the page (`headers()` host — but only inside this route, never the root layout, BUGCATCHER #6) or simply render a relative `/deck/…` and let the client component build `location.origin + path` on copy.
- `PLAN.md` — "Dexter — the rules": the two decisions, the sandbox header, the prefix exception, the admin-client reader, what is deliberately not built.

### Public viewer `[Opus]` — `app/deck/[token]/[[...path]]/route.ts`

- `GET` only. `token` must match `^[A-Za-z0-9_-]{22}$` or 404. Look the deck up with `createAdminClient()`: `id, entry_path, share_enabled` by `share_token`; 404 when missing or sharing is off (identical response either way — no oracle).
- No path → `redirect` (302) to `/deck/<token>/<entry_path>`.
- `safeDeckPath(path)` or 404. Download `decks/<id>/<path>` from `dexter`; 404 on error.
- Headers: `Content-Type` from `contentTypeFor(path)` (not from Storage's guess), `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300`, `Referrer-Policy: no-referrer`, and on `text/html` **`Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals`**. Body streamed (`object.stream()`).
- Log nothing but the status; never the token.

## Docs `[Fable]`, last

- `STATUS.md` — Dexter row (Staging) and a contract row ("shared `profiles` for names; nothing else. Its public door reads its own two tables through the admin client, sanctioned in SECURITY.md").
- `SECURITY.md` — the `PUBLIC_PATHS` rule gains its one prefix (`/deck/`, why, and that the gate is the token inside the route); the admin-client exception list gains the deck reader; a short paragraph on the sandbox header and why it must never gain `allow-same-origin`.
- `CLAUDE.md` red line "Every unauthenticated route goes in `PUBLIC_PATHS` as an exact string" → "…as an exact string (`/deck/` is the one prefix, SECURITY.md)".
- `app/(dashboard)/dexter/PLAN.md` as above. `TODO.md`: nothing new unless a question below stays open.

## Risks and how each is handled

- **Uploaded HTML attacking a signed-in viewer** — CSP sandbox without `allow-same-origin`; verified by the check below.
- **Path traversal on `/deck/`** — `safeDeckPath`, unit-tested; storage paths are always `decks/<uuid>/…`.
- **Zip bomb / huge zips** — 4 MB request cap, 500 files, 40 MB unpacked, 10 MB per object at the bucket.
- **Unpacking time on Vercel** — ~100 uploads at six-wide fits comfortably in the function budget; if a real zip times out, add `export const maxDuration = 60` to the project page segment (question below for the tier above, do not guess).
- **A dead link after "New link"** — by design; the row shows "Link off"/"Link on" and the copy button always copies the current one.
- **Relative assets** — the share link ends in the entry file; a bare `/deck/<token>` redirects there so the address bar always has a real file name beside which `assets/…` resolves.
- **Decks that need `localStorage` or cookies** — an opaque origin throws on `localStorage`; reveal.js and plain HTML decks do not need it. Recorded in PLAN.md as a known limit.

## Verification (browser and probe, on the preview then on staging)

1. Grant `/dexter` to the probe account only; sign in as the probe.
2. Create a project; rename it; try to delete a project holding a deck — refused with a sentence.
3. Upload a single `.html` — opens at `/deck/<token>/index.html` in a private window (no session). Upload a zip with `index.html` + `assets/style.css` + an image; a zip nested in one folder; a zip with no `index.html` (refused with the reason); a 5 MB file (refused). Look at what landed in Storage: sizes match, `Content-Type` right.
4. In the private window: images and CSS load; the page's own script runs; open DevTools → `document.cookie` is empty and `fetch('/api/catalogue?q=x')` answers 401 with no cookie sent; `localStorage` throws. The response headers carry the `sandbox` CSP on the HTML and `nosniff` on everything.
5. Link off → the private window gets 404; Link on → back. New link → old URL 404, new one works. Replace file → same URL, new content. Delete → 404 and no objects left in `decks/<id>/`.
6. Traversal: `/deck/<token>/../../x`, `/deck/<token>/%2e%2e/x`, a wrong-length token, a made-up token — all 404, none 500. `app_errors` stays empty.
7. Signed out entirely, `/dexter` still redirects to login; `/deck/…` does not.
8. Dark mode on every Dexter screen; a phone width on the project page.
9. `npm test`, `npm run check:actions`, `gh run list` green; `npm run db:check -- --project ipstebqawrvhkyntctrv` clean.

## Order of work

1. `[Fable]` Migration drafted, applied to staging, types committed. _(done)_
2. `[Haiku]` Registry entry, loading files, `shared.ts`/`storage.ts` constants. _(done — taken by Fable and Sonnet in passing; nothing for Haiku)_
3. `[Sonnet]` `unpack.ts` + tests; queries; actions (add `fflate`). _(done)_
4. `[Sonnet]` Screens. _(done)_
5. `[Opus]` Proxy prefix and the public viewer route. _(done — written in the Fable session, reviewed and driven by Opus)_
6. `[Opus]` Probe smoke through the verification list on the preview; fix what it finds. _(public half done, 2026-09-25 — see Opus review below; the signed-in half needs a person, because no model session can sign in)_
7. `[Fable]` Diff review against SECURITY.md and BUGCATCHER.md; docs; merge to `staging` for the founder's vet. Production waits for their word, with `0095` applied there first and `db:compare` empty. _(docs done. **Merged to `staging` 2026-09-25 (PR #74) on the founder's word** — "works, merge it to staging", after trying it on the preview. The Fable review ran the same day — see below. **Founder, after it: "everything good on staging?" — yes, confirmed, and "production later."** Staging is where this stops until then.)_

## Opus review, 2026-09-25

**Two fixes made to Sonnet's work before commit:**

- **Zip bomb.** `buildUploadPlan` inflated the whole zip and only then let `planZip` check the 40 MB limit — a 200 KB zip of zeros would have unpacked to 200 MB in the function's memory first. It now reads the zip twice: a first pass that inflates nothing (fflate's `filter` returning false, collecting names and **declared** sizes), `planZip` on those, then a second pass that inflates only the planned files. fflate inflates into a buffer of exactly the declared size and never grows it, so a zip that lies fails to read instead. Proved with a scratch script: a 200 KB zip declaring 200 MB is refused with zero memory growth.
- **An upload near 4 MB froze the form.** Next refuses a body over its cap before the action runs, so the call threw and the dialog stayed on "Uploading…". `_components/send-upload.ts` checks the size in the browser first (a little under the cap, for the form's framing) and turns a throw into a sentence. Both upload dialogs use it.

**Sonnet's questions, answered:** all five were the right call. The loading files needed building and it built them. Plain-argument renames with a hand-read form are fine and match `draft-revision-editor.tsx`. The size read-back should search the real entry name. The recursive folder listing is required — replace and delete would otherwise orphan everything under `assets/`. The 120-character caps stay.

**Smoke, public side — run against staging with `next start` on the built app and a practice deck seeded by a service-role script, then removed (0 rows, 0 objects left):**

| Request (signed out)                                 | Answer                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/deck/<token>`                                      | 302 to `/deck/<token>/index.html`                                                              |
| `…/index.html`                                       | 200, `text/html`, CSP `sandbox allow-scripts allow-popups allow-forms allow-modals`, `nosniff` |
| `…/assets/a.css`                                     | 200, `text/css`, `nosniff`, no CSP                                                             |
| `…/evil.svg`                                         | 200, `image/svg+xml`, **sandboxed**                                                            |
| missing file, short token, made-up token             | 404                                                                                            |
| `assets%2f..%2findex.html`, `..%5cindex.html`        | 404                                                                                            |
| `../..` and `%2e%2e` climbs                          | normalised away before the proxy — land on `/login`, never on a file                           |
| link switched off (page and bare)                    | 404; back to 200 when switched on                                                              |
| `/deck`, `/decks-x/y`, `/dexter`, `/dexter/projects` | 307 to `/login`                                                                                |

Headless Chrome opened the page and the page's own script wrote its verdict into the title: `ran:blocked` — the script ran, and reading `document.cookie` threw. That is the sandbox doing its job. `/login`, `/_not-found` and `/_global-error` are still prerendered, so the proxy change cost no static rendering.

**Still for a person, signed in on the preview or staging (verification steps 1–3, 5 and 8):** grant `/dexter` to the probe, create and rename a project, upload a single HTML and a zip through the dialog, look at what landed in Storage, replace a file, "New link", delete, and check both themes and a phone width.

## Fable review, 2026-09-25 — step 7

Read against `SECURITY.md`, `BUGCATCHER.md` and this plan: the migration as applied, the proxy, the public route, every query, action and screen, and the documents. Every exported query and action opens with `requireTool`; every read checks `error`; uploads hand Storage a `Blob`; no embed, no raw colour class, no native module, no `cookies()` in the root layout, no type re-export from a `"use server"` file; `0095` has one SELECT policy per table and nothing for `anon`, and staging's ledger is level with the branch. Opus's two fixes (the two-pass unzip, the client-side size check) are right.

**Two things changed in this pass:**

- **The entry-size read-back matched by substring.** Storage's `search` is a contains-match and the entry sits beside every other root file, so a zip holding both `index.html` and `print-index.html` could have compared the wrong size and rolled a good upload back. Now matched on the exact name. The drawings precedent could take the first hit because it searched for a UUID.
- **Links out of a deck opened a broken tab.** A popup from a sandboxed page inherits the sandbox, so a deck's "visit our website" link opened the site with no storage and no sign-in. `allow-popups-to-escape-sandbox` added: the popup is another origin the deck cannot read, so the deck's own sandbox is unchanged and `allow-same-origin` is still absent. `SECURITY.md` quotes the new header.

**Known limits accepted, not fixed:** a file whose name carries a literal `%` is dropped from a zip (the path helper refuses what it cannot decode); a failed _replace_ leaves the link answering 404 until the next attempt, and the error says so; every asset is one row lookup plus one download.

**Approved for `staging`, where it already is. Not yet shippable to `master`** — see TODO.md: `0095` is not on production, and `staging` carries the Google Chat bot and the skin ahead of this, so the ship is either the bot's checklist first or a release branch. That is the founder's call, and this review is not the ship word.

## Questions for the tier above

_(added by Sonnet, after steps 3–4)_

- The three `loading.tsx` files were built in this pass (direct task brief said so), even though the plan's own file list put them under `[Haiku]` — they already existed nowhere, so nothing was redone, just flagging the attribution mismatch.
- `renameProject(projectId, name, clientName)` and `renameDeck(deckId, title)` take plain arguments rather than `(prevState, formData)`, matching the signatures the plan itself wrote for them — so their rename dialogs read the form by hand on submit (the `uploadDrawingRevisionFile` shape from files-actions.ts) rather than `useActionState`, which the plan named as the general pattern to copy. `createProject` and `uploadDeck`'s own dialog do use `useActionState`/manual-submit as their signatures allow.
- `verifyEntrySize` (in actions.ts) searches Storage for the plan's actual `entry` filename, not a literal `"index.html"` — needed since a zip's entry can legitimately be a different single root `.html` file (unpack.ts's own documented behaviour). Flagging in case the literal wording in the brief meant something narrower.
- `listFolderPaths` (private to actions.ts, as instructed) recurses into Storage's folder pseudo-entries (`id: null`) — `replaceDeckFile` and `deleteDeck` need every object under `decks/<id>/`, including nested `assets/…`, and Storage's `list` only returns one level. The plan's wording ("list and remove every existing object under the deck's folder") didn't spell out the recursion but the correctness need is real; worth a look on review.
- Name/title length caps (project name, client name, deck title — all 120 chars) are an app-level nicety, not required by the migration's CHECKs (which only require non-empty after trim). Easy to change or drop if the founder wants something else.
