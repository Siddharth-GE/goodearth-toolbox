# Dexter — the rules

Client presentations as shareable links, and the answers a client types into one. Grant `/dexter`. Migrations `0095`, `0100` (staging only). Design makes pitches as standalone HTML; here someone with the grant makes a **project** (a folder), uploads a **deck** into it, and sends the **link**. A deck that asks questions keeps the answers — the maker's contract is `DECK-AUTHORING.md` beside this file.

## The founder decisions

1. **Uploads are capped at 4 MB**, on the same path as drawings and staff photos (a server action, `next.config.ts`'s body cap). Vercel refuses any request body over 4.5 MB, so a bigger deck would need a browser-to-Storage upload through a signed upload address and a server step to unpack it afterwards. Offered, declined for now: build it when a real deck does not fit, not before.
2. **A project is a named folder**, with an optional free-text client name. It is not a Masters project and not a Masters client — a pitch is usually for somebody who has no record yet. No FK, on purpose.
3. **The link is the only gate.** No password, no expiry, no view count. Each is its own small plan if wanted.
4. **Every link carries the Kaadal preview (2026-10-02).** Shared on WhatsApp, any deck link shows the Kaadal mark on that deck's own background colour, whatever the colour is — including decks uploaded and links sent before this existed.
5. **A deck keeps what the client types (2026-10-02).** One set of answers per deck — one link is one client; to ask five people, upload five decks. Saved as they type, plus an optional Send button that marks the answers finished. This is the public door's one write, and the one case where the 2026-09-25 "never a write" reading was reversed; `SECURITY.md` carries the boundary.

## How it is built

- **Two tables**, `dexter_projects` and `dexter_decks`, both `has_app('/dexter')` on every verb, one SELECT policy each, **nothing for `anon`** (`0095` asserts that). A project with decks refuses deletion (RESTRICT, and the action says so first).
- **One private bucket**, `dexter`, 10 MB an object, no MIME list. A deck's objects live at `decks/<deck id>/<relative path>` and **Storage is the file list** — there is no file table to fall out of step with it. `file_count` and `total_bytes` on the deck row are for display only.
- **A zip is unpacked in the action** with `fflate` (pure JavaScript, so BUGCATCHER #15 cannot happen). `lib/dexter/unpack.ts` is pure and tested: it drops `__MACOSX/`, `.DS_Store`, dotfiles and directories, strips a single wrapping folder, insists on `index.html` at the top (or exactly one `.html`), and refuses more than 500 files or 40 MB unpacked. A single `.html` upload is stored as `index.html`.
- **Uploads follow the drawings pattern step for step** (`lib/design-management/files-actions.ts`): a `Blob`, never a `Buffer` (BUGCATCHER #1); the entry object's size read back and compared; row first, then objects, and a failed upload removes what landed and the row with it.
- **The link is `/deck/<token>/index.html`** — it ends in the entry file so that `assets/a.css` resolves beside it, and a bare `/deck/<token>` redirects there. The token is 22 base64url characters from 16 random bytes; "New link" mints another and the old one dies; "Link off" keeps everything and answers 404; "Replace file" keeps the token.
- **The viewer is `app/deck/[token]/[[...path]]/route.ts`**, and its boundary — the one public prefix, the admin client, the one write, the sandbox **without `allow-same-origin`** — is `SECURITY.md`, _Dexter's public door_.
- **The WhatsApp preview is added to the response, never to the file.** Every HTML page the viewer serves gets Open Graph `<meta>` tags from `lib/dexter/preview.ts` (pure and tested): the page's own `<title>`, Kaadal's tagline, and a picture at `/deck/<token>/.preview.png` (a reserved dot-name, like `.state` below). The picture is the K mark (the brand's own paths) centred on the page's background colour, in whichever brand colour reads best against it; the colour comes from `<meta name="theme-color">`, else the `body` background, else `html`, else brand burgundy. `next/og` draws it, loaded lazily inside that one branch (BUGCATCHER #15), and any failure — in the tags or the picture — serves the deck exactly as before. The bare link still answers 302 to the entry file, which is where the tags are.
- **Answers are one row per deck** in `dexter_answers` (`0100`): `fields` jsonb (name → text, tick or list of text), `submitted_at`, `updated_at`. The viewer serves `.dexter.js` (our script, `lib/dexter/client-script.ts`, from any depth) and `.state` (GET the answers, POST to save — `SECURITY.md` has the rules) beside every deck. The page includes the script with one tag and names its fields; the script saves 800 ms after the last change, treats a form `submit` as Send, and reports `data-dexter` on `<html>`. "New link" and "Replace file" keep the answers, "Delete" cascades them, staff "Clear answers" from the deck's row. No audit trigger on the table — autosave would write a row per pause with no actor; `updated_at` is the record.

## Known limits, stated

- A deck that needs `localStorage`, cookies or `document.domain` throws under the sandbox. Plain HTML, reveal.js and the usual export-to-HTML decks do not need them; anything a deck wants remembered goes through the answers script instead. If a real deck breaks on this, the answer is a separate domain for the viewer — not `allow-same-origin`.
- Every save is a token lookup, a read and an upsert — one typist costs a request per pause in typing. Two people on the same link overwrite each other's answers, by decision (one link, one client).
- Every asset request is a row lookup plus a Storage download through a serverless function. Fine at seventy staff and a handful of clients; a deck with hundreds of assets would notice.
- The browser may cache an asset for five minutes; a replaced file can look stale for that long on a machine that had it open.

## Deliberately not built

View counts (a write on every open, not on the client's own action), passwords, expiry dates, a Goodearth frame around the deck, a Masters link, uploads above 4 MB, answers per visitor (the sandbox leaves a browser no way to remember who it is), a CSV of answers, injecting the script into every HTML automatically (it would rewrite the client's file and run on decks with no fields), an e-mail on Send. Each is a small plan of its own, and the first three would each widen what the public door does.
