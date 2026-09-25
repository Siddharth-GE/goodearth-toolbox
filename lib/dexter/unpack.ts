/**
 * Pure logic for turning an uploaded zip into a plan of objects to write
 * to Storage, and for answering the two small questions the public
 * viewer route needs answered without a database round trip: what a
 * path's Content-Type is, and whether a path is safe to read at all.
 *
 * Deliberately import-free — this is read by `lib/dexter/actions.ts`
 * ("use server", where the whole module must stay lean) AND by
 * `app/deck/[token]/[[...path]]/route.ts` (a public route with no
 * session), so it cannot depend on either's machinery. Every exported
 * name here is part of that shared contract — do not rename one without
 * updating the route.
 */

// ---------------------------------------------------------------------
// Content-Type by extension
// ---------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  map: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml",
  wasm: "application/wasm",
};

/** By file extension, case-insensitive. Anything unrecognised is a plain download. */
export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1 || dot === path.length - 1) return "application/octet-stream";
  const extension = path.slice(dot + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------

const MAX_PATH_LENGTH = 200;

/**
 * Joins URL path segments into one safe, decoded deck-relative path, or
 * `null` when it is not safe to read.
 *
 * Segments arrive from the public route's catch-all — possibly
 * percent-encoded, since that is how a browser sends a path with special
 * characters. Each segment is checked raw first (empty, `.`, `..`, a
 * backslash, a NUL — none of these are legitimate whether or not they
 * decode to something else), then decoded, and the decoded form is
 * checked again for a `/` or `..` that only appears once the encoding is
 * undone. A segment that fails to decode at all is treated as unsafe
 * rather than passed through — the raw text was already offered a
 * chance to be a plain filename and failed it.
 */
export function safeDeckPath(segments: string[]): string | null {
  if (segments.length === 0) return null;

  const decoded: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
    if (segment.includes("\\") || segment.includes("\0")) return null;

    let piece: string;
    try {
      piece = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (piece.includes("/") || piece.includes("..")) return null;

    decoded.push(piece);
  }

  const joined = decoded.join("/");
  if (joined.length > MAX_PATH_LENGTH) return null;
  return joined;
}

// ---------------------------------------------------------------------
// Zip planning
// ---------------------------------------------------------------------

export type ZipEntry = { name: string; size: number; isDirectory: boolean };

export type ZipPlan =
  | { entry: string; files: { zipName: string; deckPath: string; size: number }[] }
  | { error: string };

const MAX_ZIP_FILES = 500;
const MAX_ZIP_UNPACKED_BYTES = 40 * 1024 * 1024;

/**
 * Turns a zip's raw entry list into a plan: what to write where, and
 * which file is the deck's entry point. Never touches the file bytes —
 * `entries` carries only names and sizes, read from the zip's central
 * directory (`fflate.unzipSync`'s keys, in the action that calls this).
 *
 * Drops directories, macOS resource-fork junk, and anything unsafe,
 * before either limit is checked — the 500-file and 40 MB guards are
 * about what would actually land in Storage, not what a zip claims to
 * contain.
 */
export function planZip(entries: ZipEntry[]): ZipPlan {
  const candidates: { zipName: string; deckPath: string; size: number }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // Zips built on Windows sometimes separate with backslashes; every
    // check below assumes "/".
    const normalized = entry.name.replace(/\\/g, "/");
    const segments = normalized.split("/");

    if (segments.includes("__MACOSX")) continue;
    if (segments[segments.length - 1] === ".DS_Store") continue;
    if (segments.some((segment) => segment.startsWith("."))) continue;

    // Zip entry names are not URL-encoded, but the same helper that
    // guards the public route is the right one to run here too — it
    // still catches a name that would decode into a traversal, and a
    // name it can't make sense of is simply not safe to trust.
    const safePath = safeDeckPath(segments);
    if (safePath === null) continue;

    candidates.push({ zipName: entry.name, deckPath: safePath, size: entry.size });
  }

  if (candidates.length === 0) return { error: "That zip doesn't contain any files." };
  if (candidates.length > MAX_ZIP_FILES) {
    return { error: "That zip has too many files — the limit is 500." };
  }
  const totalBytes = candidates.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_ZIP_UNPACKED_BYTES) {
    return { error: "That zip unpacks to more than 40 MB." };
  }

  // A zip usually wraps its contents in one folder named after itself —
  // strip it so the deck's own paths (and its entry file) sit at the
  // top, which is where a browser resolves relative assets from.
  let topFolder: string | null | undefined;
  let shareOneFolder = true;
  for (const file of candidates) {
    const slash = file.deckPath.indexOf("/");
    const folder = slash === -1 ? null : file.deckPath.slice(0, slash);
    if (topFolder === undefined) {
      topFolder = folder;
    } else if (topFolder !== folder) {
      shareOneFolder = false;
      break;
    }
  }

  const files =
    shareOneFolder && topFolder
      ? candidates.map((file) => ({
          ...file,
          deckPath: file.deckPath.slice(topFolder!.length + 1),
        }))
      : candidates;

  const rootIndex = files.find((file) => file.deckPath === "index.html");
  if (rootIndex) return { entry: "index.html", files };

  const rootHtml = files.filter(
    (file) => !file.deckPath.includes("/") && /\.html?$/i.test(file.deckPath),
  );
  if (rootHtml.length === 1) return { entry: rootHtml[0].deckPath, files };

  return { error: "Couldn't find index.html at the top of the zip." };
}
