# Dexter — the rules

Client presentations as shareable links. Grant `/dexter`. Migration `0095` (staging only). Design makes pitches as standalone HTML; here someone with the grant makes a **project** (a folder), uploads a **deck** into it, and sends the **link**.

## The three founder decisions, 2026-09-25

1. **Uploads are capped at 4 MB**, on the same path as drawings and staff photos (a server action, `next.config.ts`'s body cap). Vercel refuses any request body over 4.5 MB, so a bigger deck would need a browser-to-Storage upload through a signed upload address and a server step to unpack it afterwards. Offered, declined for now: build it when a real deck does not fit, not before.
2. **A project is a named folder**, with an optional free-text client name. It is not a Masters project and not a Masters client — a pitch is usually for somebody who has no record yet. No FK, on purpose.
3. **The link is the only gate.** No password, no expiry, no view count. Each is its own small plan if wanted.

## How it is built

- **Two tables**, `dexter_projects` and `dexter_decks`, both `has_app('/dexter')` on every verb, one SELECT policy each, **nothing for `anon`** (`0095` asserts that). A project with decks refuses deletion (RESTRICT, and the action says so first).
- **One private bucket**, `dexter`, 10 MB an object, no MIME list. A deck's objects live at `decks/<deck id>/<relative path>` and **Storage is the file list** — there is no file table to fall out of step with it. `file_count` and `total_bytes` on the deck row are for display only.
- **A zip is unpacked in the action** with `fflate` (pure JavaScript, so BUGCATCHER #15 cannot happen). `lib/dexter/unpack.ts` is pure and tested: it drops `__MACOSX/`, `.DS_Store`, dotfiles and directories, strips a single wrapping folder, insists on `index.html` at the top (or exactly one `.html`), and refuses more than 500 files or 40 MB unpacked. A single `.html` upload is stored as `index.html`.
- **Uploads follow the drawings pattern step for step** (`lib/design-management/files-actions.ts`): a `Blob`, never a `Buffer` (BUGCATCHER #1); the entry object's size read back and compared; row first, then objects, and a failed upload removes what landed and the row with it.
- **The link is `/deck/<token>/index.html`** — it ends in the entry file so that `assets/a.css` resolves beside it, and a bare `/deck/<token>` redirects there. The token is 22 base64url characters from 16 random bytes; "New link" mints another and the old one dies; "Link off" keeps everything and answers 404; "Replace file" keeps the token.
- **The viewer is `app/deck/[token]/[[...path]]/route.ts`** and is the subject of `SECURITY.md`, _Dexter's public door_: `/deck/` is the one prefix in `PUBLIC_PATHS`; the route reads through the admin client (two reads, never a write); every document is served under `Content-Security-Policy: sandbox …` **without `allow-same-origin`**, so an uploaded page cannot read cookies, reach `localStorage`, or call the toolbox as whoever is viewing it. Do not add that word.

## Known limits, stated

- A deck that needs `localStorage`, cookies or `document.domain` throws under the sandbox. Plain HTML, reveal.js and the usual export-to-HTML decks do not need them. If a real deck breaks on this, the answer is a separate domain for the viewer — not `allow-same-origin`.
- Every asset request is a row lookup plus a Storage download through a serverless function. Fine at seventy staff and a handful of clients; a deck with hundreds of assets would notice.
- The browser may cache an asset for five minutes; a replaced file can look stale for that long on a machine that had it open.

## Deliberately not built

View counts (a write from an unauthenticated route), passwords, expiry dates, a Goodearth frame around the deck, a Masters link, uploads above 4 MB. Each is a small plan of its own, and the first three would each widen what the public door does.
