# plan.md — Dexter saves a deck's answers

**Owner tags** per `MODELS.md`: `[Fable]` planned and reviews, `[Opus]` builds the public door and vets, `[Sonnet]` builds the rest. Step 0 of the build session: copy this file to `plan.md` at the repo root on `feature/dexter-answers` (branched off `staging`) and tick steps there as they land.

## Context

Design will start making decks that are not just slides: a page with questions in it — text boxes, tick boxes, a short questionnaire — and what the client types must not vanish when they close the tab. Today a Dexter deck is served **sandboxed** (`Content-Security-Policy: sandbox …` without `allow-same-origin`), so the page cannot use `localStorage` or cookies: there is no way for it to remember anything on its own. That sandbox is the right call and stays.

So the toolbox saves the answers instead. The deck includes **one script tag** Dexter serves beside it; the script sends every named field to the toolbox as the client types, and fills them back in when the link is opened again. Staff see the answers on the deck's row in Dexter. A one-page handout tells whoever builds the HTML the handful of rules.

**Founder decisions, 2026-10-02:** one set of answers per deck (one link = one client; to ask five people, upload the deck five times); autosave, plus an optional Send button that marks the answers finished.

**This reverses one earlier decision.** Dexter's `PLAN.md` says the public door is "two reads, never a write", and declined view counts for exactly that reason. Saving answers IS a write from an unauthenticated route — the founder's request requires it. What keeps it safe: the same 22-character token gates it; it can only ever touch one row (the deck's own), capped at 64 KB and validated field by field by a pure, tested function; the page cannot carry anyone's session (opaque origin — the browser never sends our cookies); and no `anon` policy exists, so the write goes only through this one route. `SECURITY.md` and `PLAN.md` are amended to say so.

## Decisions (settled here, not re-opened in the build)

- **Reserved names begin with a dot.** `planZip` already drops every path segment that starts with `.`, so `.dexter.js` and `.state` can never be files inside a deck. The viewer serves `.dexter.js` (the script, from any depth) and `.state` (the answers, root only: `/deck/<token>/.state`). No change to `planZip`; one new test pins the reservation.
- **Answers belong to the deck, not the link.** Table `dexter_answers`, primary key `deck_id`. "New link" and "Replace file" keep the answers; "Delete" takes them with it (cascade — a deck's own data, not the line chain). Staff can "Clear answers".
- **The browser talks to us cross-origin.** A sandboxed page has origin `null`, so `.state` answers with `Access-Control-Allow-Origin: *` (no credentials are ever involved, so `*` is exact). The script POSTs as `text/plain` so there is no preflight, and the server parses JSON regardless of the declared type.
- **Shape of what is saved:** `{ "fields": { "<name>": string | boolean | string[] }, "submitted": boolean }`. Caps: 64 KB body, 200 fields, name ≤ 120 chars, text ≤ 10,000 chars, a list ≤ 50 items of ≤ 500 chars. `submitted` moves `submitted_at` from null to now and the public side can never clear it.
- **No audit trigger on `dexter_answers`.** Autosave would write an audit row per pause in typing, each carrying the whole payload, with no actor to record. `updated_at` is the record. (Stated in the migration.)
- **No rate limit.** The damage ceiling is one bounded row per deck; a flood costs function invocations exactly as a flood of asset GETs does today.
- **Not built:** per-visitor answers, CSV export, injecting the script into every HTML automatically (it would rewrite the client's file and run on decks with no fields), e-mail on Send. Each a small plan if wanted.

## Steps

### 1. ✅ `[Sonnet]` The pure module — `lib/dexter/answers.ts` + `answers.test.ts`

Import-free, like `lib/dexter/unpack.ts`, because the public route and the `"use server"` file both read it.

```ts
export const DEXTER_SCRIPT_PATH = ".dexter.js";
export const DEXTER_STATE_PATH = ".state";
export type AnswerValue = string | boolean | string[];
export type AnswerFields = Record<string, AnswerValue>;
export const ANSWER_LIMITS = {
  bytes: 64 * 1024,
  fields: 200,
  nameLength: 120,
  textLength: 10_000,
  listItems: 50,
  listItemLength: 500,
} as const;
/** JSON text from the browser → a clean payload, or one plain-English error. */
export function parseAnswers(
  text: string,
): { fields: AnswerFields; submitted: boolean } | { error: string };
/** jsonb from the database → the same shape, dropping anything that isn't (a row written before a rule changed). */
export function readAnswerFields(value: unknown): AnswerFields;
/** For the staff dialog: true → "Yes", false → "No", a list → "a, b", a string as is. */
export function formatAnswer(value: AnswerValue): string;
```

Tests (`node:test`, the `unpack.test.ts` shape): accepts the three value kinds; rejects non-object, nested objects, numbers, oversize body, too many fields, long name, long text, long list; `submitted` defaults to false and must be boolean; `readAnswerFields` drops bad entries; `formatAnswer` for each kind. Plus **one test in `unpack.test.ts`**: a zip entry named `.dexter.js` or `.state` is dropped by `planZip`.

### 2. ✅ `[Sonnet]` The browser script — `lib/dexter/client-script.ts`

`export const DEXTER_CLIENT_SCRIPT = \`…\`` — plain ES2017, no dependencies, about 80 lines, the only browser code in Dexter. Behaviour, exactly:

- Find the base: `location.pathname` must match `^/deck/[A-Za-z0-9_-]{22}/`; otherwise do nothing (the author previewing from disk).
- Fields = `input[name], select[name], textarea[name]`, skipping `type` button/submit/reset/file/password/image.
- **Collect:** checkbox — one element with that name → `true/false`; several → the checked values as a list. Radio → the checked value or `""`. `<select multiple>` → list; `<select>` → value. Everything else → `value` as a string.
- **Fill** is the inverse, run once after `GET .state` on `DOMContentLoaded`; names in the saved answers that are not on this page are ignored (a deck may have several pages sharing one set of answers).
- **Save:** on `input`/`change` (delegated on `document`), 800 ms after the last one; on any `<form>` `submit` → `preventDefault()`, set `submitted = true`, save at once; on `pagehide` → save with `keepalive: true` if anything is unsaved. Body `JSON.stringify({ fields, submitted })`, `Content-Type: text/plain`.
- **Status:** `document.documentElement.dataset.dexter` = `"saving" | "saved" | "error"`; `dataset.dexterSent = "true"` once submitted (from the GET too). Nothing else — no UI of ours inside the client's page.

### 3. ✅ `[Fable — drafted here, verbatim]` Migration (applied to staging 2026-10-02; types regenerated) `supabase/migrations/0100_dexter_answers.sql`

```sql
-- 0100 — Dexter: a deck's answers
--
-- FOUNDER, 2026-10-02: some decks carry questions, and what the client
-- types must survive closing the tab. The viewer is sandboxed (no
-- localStorage, no cookies — SECURITY.md, _Dexter's public door_), so
-- the toolbox keeps the answers: one row per deck, written only by the
-- public route through the service-role client after the share token
-- has matched, read and cleared by anyone with the grant.
--
--   * ONE row per deck (founder: one link is one client). "New link" and
--     "Replace file" keep it; deleting the deck takes it along — a deck's
--     own data, not the line chain, so CASCADE is right here.
--   * `fields` is a flat jsonb object, name → string | boolean | list of
--     strings, validated field by field in lib/dexter/answers.ts before
--     it is written; the CHECKs below are the backstop.
--   * NOTHING FOR anon, and NO INSERT/UPDATE POLICY AT ALL — the only
--     writer is the route, and it does not use a policy. SELECT and
--     DELETE need has_app('/dexter').
--   * NO audit_row trigger, on purpose: autosave writes a row per pause
--     in typing with no actor to record; updated_at is the record.
--
-- Re-runnable throughout.

create table if not exists dexter_answers (
  deck_id uuid primary key references dexter_decks (id) on delete cascade,
  fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 131072),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on dexter_answers;
create trigger set_updated_at before update on dexter_answers
  for each row execute function set_updated_at();

alter table dexter_answers enable row level security;

drop policy if exists "dexter_answers readable by dexter app" on dexter_answers;
create policy "dexter_answers readable by dexter app" on dexter_answers
  for select to authenticated using (has_app('/dexter'));

drop policy if exists "dexter_answers deletable by dexter app" on dexter_answers;
create policy "dexter_answers deletable by dexter app" on dexter_answers
  for delete to authenticated using (has_app('/dexter'));

do $$
declare v int;
begin
  if not exists (select 1 from pg_class where relname = 'dexter_answers' and relrowsecurity) then
    raise exception '0100: dexter_answers is missing or has RLS off';
  end if;
  select count(*) into v from pg_policies where schemaname = 'public' and tablename = 'dexter_answers';
  if v <> 2 then raise exception '0100: dexter_answers has % policies, expected 2', v; end if;
  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers' and cmd = 'SELECT';
  if v <> 1 then raise exception '0100: expected exactly 1 SELECT policy, found %', v; end if;
  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers' and cmd in ('INSERT', 'UPDATE', 'ALL')) then
    raise exception '0100: dexter_answers must have no INSERT/UPDATE policy';
  end if;
  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dexter_answers' and 'anon' = any(roles)) then
    raise exception '0100: dexter_answers has a policy for anon';
  end if;
  if not exists (select 1 from pg_trigger
    where tgname = 'set_updated_at' and tgrelid = 'dexter_answers'::regclass) then
    raise exception '0100: set_updated_at trigger missing';
  end if;
end $$;
```

Apply: `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`, then `npm run db:types:staging`; commit the types with the migration. Production waits for the founder's vet (`SHIPPING.md`).

### 4. ✅ `[Fable, in the chair]` The public door — `app/deck/[token]/[[...path]]/route.ts`

- Lift the token-shape check + deck lookup into one helper used by `GET` and the new `POST` (same 404 for a missing/off deck; `select("id, entry_path, share_enabled")`).
- **In `GET`, after `safeDeckPath` and before Storage:**
  - last segment `=== DEXTER_SCRIPT_PATH` → `DEXTER_CLIENT_SCRIPT`, `text/javascript; charset=utf-8`, `nosniff`, `Cache-Control: private, max-age=300`, `X-Robots-Tag: noindex`. No sandbox header (not a document).
  - `relative === DEXTER_STATE_PATH` → read `dexter_answers` for `deck.id` (`maybeSingle`, **check `error`**); answer `{ fields: readAnswerFields(row?.fields), submitted: row?.submitted_at !== null }` (`{}`/`false` when no row), `application/json`, `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`, `X-Robots-Tag: noindex`.
- **New `export async function POST`:** token + deck lookup → path must be exactly `[DEXTER_STATE_PATH]`, else 404 → `request.text()`; longer than `ANSWER_LIMITS.bytes` → 413 `{ error }` → `parseAnswers` → 400 `{ error }` on refusal → read the existing row's `submitted_at` (check `error`) → `upsert({ deck_id, fields, submitted_at: submitted ? (existing ?? now) : existing }, { onConflict: "deck_id" })` → 200 `{ ok: true, savedAt }`. Every response carries `Access-Control-Allow-Origin: *`, `Cache-Control: no-store`. Log the status only, never the token or the body.
- Rewrite the file's doc comment: the door is now "reads, and one write — the deck's own answers, after the token matched".

### 5. ✅ `[Sonnet]` Reads and writes — `lib/dexter/queries.ts`, `lib/dexter/actions.ts`

- `getProject`: after the decks, `fetchAll` of `dexter_answers` (`deck_id, fields, submitted_at, updated_at`) with `.in("deck_id", deckIds)` when there are decks; merge by `Map`. `DexterDeckRow` gains `answers: { fields: AnswerFields; updatedAt: string; submittedAt: string | null } | null`.
- `clearDeckAnswers(deckId): Promise<ActionState>` — `requireTool(GRANT)`, delete where `deck_id`, `revalidatePath("/dexter", "layout")`. Check `error`.
- `deleteDeck` needs no change (cascade); the confirm text does (step 6).

### 6. ✅ `[Sonnet]` The staff screen — `app/(dashboard)/dexter/projects/[projectId]/`

- `page.tsx`: a new **Answers** column between Link and Size. `—` (muted) when `answers` is null; otherwise `<DeckAnswers deck={deck} />`.
- New `_components/deck-answers.tsx` (`"use client"`): a `Badge` rendered as the trigger — `success` "Sent · {formatDate(submittedAt)}" or `info` "In progress · {formatDate(updatedAt)}" — opening a `Dialog` titled "Answers — {title}": `Table` with Field | Answer (`formatAnswer`, `whitespace-pre-wrap` on the answer cell, field name in `font-medium`), a caption "Last saved {formatDate} {formatTime}", `FormMessage` for errors, footer `DialogClose` Close + a `danger` **Clear answers** button (`window.confirm`, then `clearDeckAnswers`, then `router.refresh()`). Plain `useState` booleans, not `useTransition` (the note in `deck-actions.tsx`).
- `deck-actions.tsx`: the delete confirm reads `Delete "X" and its saved answers? This can't be undone.` when `deck.answers` is set; `DexterDeckActionRow` gains `answers: … | null`. The Replace dialog's helper line gains "Saved answers stay."
- Everything from `components/ui/*`; no raw colour classes; check it in dark mode and at phone width (the dialog becomes a sheet).

### 7. ✅ `[Sonnet]` The handout — `app/(dashboard)/dexter/DECK-AUTHORING.md`

The deliverable the founder asked for. One page, written for the person making the HTML, not for us. Draft, to be kept this short:

> # Making a Dexter deck that remembers answers
>
> Dexter shows your HTML to a client at a private link. If your page has questions in it, Dexter saves what the client types and fills it back in next time they open the link. Five rules make that work.
>
> **1. Build a normal web page.** One `index.html`, or a zip with `index.html` at the top and your CSS, images and fonts beside it, linked with relative paths (`assets/style.css`, never `/assets/…` or `C:\…`). Under 4 MB in all. Fonts and libraries from a CDN are fine.
>
> **2. Add one line just before `</body>`:**
>
> ```html
> <script src=".dexter.js"></script>
> ```
>
> Yes, with the dot. It is a reserved name Dexter serves beside your file, so it can never clash with anything of yours. A page inside a folder (`pages/two.html`) uses the same line. Nothing to download — the file appears when the deck is opened through its link. Opened from your own disk, the page simply does not save; everything else works.
>
> **3. Give every answer a `name`.** Any `<input>`, `<textarea>` or `<select>` with a `name` is saved; anything without one is not. Names must be unique across every page of the deck, and staff see them as labels, so make them readable: `name="preferred_move_in"`, not `name="q7"`. Works: text, email, number, date, range, checkbox, radio, textarea, select (single or multiple). A group of checkboxes sharing a `name` is saved as the list of ticked ones.
>
> **4. Saving is automatic.** The client types; a moment later it is saved. Optionally give them a Send moment: a normal `<form>` with a `<button type="submit">Send</button>` and **no `action`** — pressing it marks the answers as sent (staff see "Sent"). You can show the state with CSS: Dexter sets `data-dexter="saving"`, `"saved"` or `"error"` on `<html>`, and `data-dexter-sent` once sent:
>
> ```css
> html[data-dexter="saved"] .status::after {
>   content: "Saved";
> }
> html[data-dexter-sent] .send-button {
>   display: none;
> }
> ```
>
> **5. Don't use the browser's own memory.** `localStorage`, `sessionStorage`, cookies and `document.domain` are blocked inside Dexter — the page runs in a sandbox, by design. Everything you want kept goes through rule 3.
>
> **Limits:** 200 named fields, 10,000 characters per text answer, 64 KB of answers in all. **Test:** open the link Goodearth gives you, type something, reload — it must come back. **Changing the page later:** Goodearth replaces the file at the same link; answers stay as long as the names do.

After the build, also publish it as a private artifact page so the founder has a link to forward; the repo file stays the source of truth and `PLAN.md` points at it.

### 8. ✅ `[Fable, in the chair]` Docs — the facts move to their homes

- `app/(dashboard)/dexter/PLAN.md`: "How it is built" gains the answers paragraph (table, reserved names, CORS, the script, the write); "The link is the only gate" stands; **"Deliberately not built" is reworded** — view counts are still unbuilt, now because they would be a write on every open rather than on the client's own action; add per-visitor answers, CSV export, auto-injection, e-mail on Send. Point at `DECK-AUTHORING.md`.
- `SECURITY.md`, _Dexter's public door_: "Admin client, reads only" → reads, and one write: an upsert of the deck's own `dexter_answers` row after the token matched, body capped and validated by `lib/dexter/answers.ts`, `Access-Control-Allow-Origin: *` on `.state` only (argue it: opaque origin, no credentials). The sanctioned-exceptions sentence in _Auth and permissions_ changes from "(two reads, never a write)" to "(reads, and the one write `_Dexter's public door_` describes)".
- `STATUS.md`: migrations `0094`–`0100` staging only; the staging bullet lists Dexter (`0095`, `0100`); the Dexter tool line adds "and saves a deck's form answers".
- `TODO.md`: the Dexter entry becomes "`0095` tried and confirmed good; **answers (`0100`) waiting for the founder's vet**; production needs both".
- `route.ts` and `proxy.ts` comments already say the gate is the token; `proxy.ts` needs no change (same prefix).

### 9. `[Opus]` Review, then the founder

Vet every Sonnet piece before its commit; run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:actions`; push; `gh run list`. PR `feature/dexter-answers` → `staging`. The Fable approval pass (`MODELS.md` step 3) before the merge to `staging`; production only after the founder's word.

## Files

New: `lib/dexter/answers.ts`, `lib/dexter/answers.test.ts`, `lib/dexter/client-script.ts`, `supabase/migrations/0100_dexter_answers.sql`, `app/(dashboard)/dexter/projects/[projectId]/_components/deck-answers.tsx`, `app/(dashboard)/dexter/DECK-AUTHORING.md`.
Changed: `app/deck/[token]/[[...path]]/route.ts`, `lib/dexter/queries.ts`, `lib/dexter/actions.ts`, `lib/dexter/unpack.test.ts`, `app/(dashboard)/dexter/projects/[projectId]/page.tsx`, `…/_components/deck-actions.tsx`, `lib/supabase/database.types.ts` (generated), `app/(dashboard)/dexter/PLAN.md`, `SECURITY.md`, `STATUS.md`, `TODO.md`.

Reused as they are: `requireTool`, `createClient`/`createAdminClient`, `fetchAll`, `readFailed`, `dbErrorMessage`, `SHARE_TOKEN_PATTERN`, `safeDeckPath`, `formatDate`/`formatTime`, `Badge`, `Dialog`, `Table`, `Button`, `FormMessage`.

## Verification

**Mechanical:** the five CI checks green locally and on `gh run list`; the migration's own asserts pass on staging; `npm run db:compare` is not level until production has `0100` (expected).

**Public route, no sign-in needed (a model session can do these with curl/headless Chrome against the preview once a deck exists):**

- `GET /deck/<token>/.dexter.js` → 200, `text/javascript`, no CSP header. `GET /deck/<token>/.state` → 200 JSON, `Access-Control-Allow-Origin: *`, `Cache-Control: no-store`.
- `POST …/.state` with `{"fields":{"a":"b","c":true,"d":["x"]},"submitted":false}` → 200; a 70 KB body → 413; `{"fields":[]}` → 400; nested object → 400; an unknown token → 404; after **Link off** → 404 for GET and POST both; `POST …/index.html` → 404.
- Headless Chrome on the real deck: type, wait a second, reload → the value is back; tick a box group, reload → ticks back; press Send → `data-dexter-sent` on `<html>`; GET `.state` shows `submitted: true`; further edits keep `submitted: true`.

**Founder, on staging (needs a sign-in):**

1. Dexter → a project → **Upload** the sample from the handout (save its text as `index.html`), copy the link, open it in a private window. Type an answer, tick two boxes, close the tab, reopen the link — everything is back.
2. Back in Dexter: the deck's row shows **In progress · today**. Open it — your answers, field by field. Press Send in the deck; the badge says **Sent**.
3. **New link** → open the new link: the answers are still there. **Replace file** with the same HTML → still there. **Clear answers** → the row shows —, the link opens blank.
4. **Link off** → the link and its saving both stop; **Link on** → back, answers intact.
5. **Delete** the deck — the confirm mentions the saved answers; after it, no row remains (`dexter_answers` is empty for that id).
6. Dark mode and a phone: open the Answers dialog in both.
7. As the probe (`/inventory` only): `/dexter` is refused as before — the new table is reached only through Dexter's screens.

## Verified 2026-10-02 (Fable, against staging through a local dev server)

A sample deck — the handout's own example, seeded on staging as project "Dexter answers test" — was driven without a sign-in:

- `.dexter.js` → 200 `text/javascript`, no CSP, also from a subfolder path. `.state` GET → 200 JSON, `Access-Control-Allow-Origin: *`, `no-store`; empty deck answers `{"fields":{},"submitted":false}`.
- POST good → 200 and the GET returns it; `submitted:true` sets Sent and a later `submitted:false` cannot clear it; 70 KB → 413; `fields` not an object, nested object, number, non-JSON → 400 with the plain-English reason; unknown token → 404 on GET and POST; POST to `index.html` → 404; the page carries the sandbox CSP and no CORS header.
- Headless Chrome on the real link: `<html data-dexter="saved" data-dexter-sent="true">` after load and the saved name filled in; typing a name, ticking a box and choosing an option autosaved from inside the sandbox; after a reload all three came back.
- `npm test` 905 pass, lint, typecheck, build and `check:actions` clean.

Left for the founder on staging: the Dexter screen itself (Answers badge, dialog, Clear, dark mode, phone) — a model session cannot sign in.

## Plain summary for the founder (the "before" bullets)

- A deck will be able to carry questions; what the client types is saved by the toolbox and is back when they reopen the link.
- The HTML maker adds one line to their page and names the fields — the handout (step 7) is the whole contract.
- Staff see the answers on the deck's row in Dexter: In progress / Sent, the answers themselves, and a Clear button.
- This is the first thing the public link can _write_; it is boxed to one small row per deck, behind the same token, and the rules are written into `SECURITY.md`.
- One migration (`0100`) — staging first, your vet, then production.

## Questions for the tier above

_(none yet — a lower tier writes any here rather than improvising)_
