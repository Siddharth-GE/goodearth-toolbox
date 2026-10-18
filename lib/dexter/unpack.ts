// Import-free: read by actions.ts ("use server") and by the public deck route (no session), so
// renaming an export breaks the route. Also answers what the viewer route needs without a database:
// a path's Content-Type and whether it is safe to read.

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

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1 || dot === path.length - 1) return "application/octet-stream";
  const extension = path.slice(dot + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

const MAX_PATH_LENGTH = 200;

// Segments come from the public catch-all, possibly percent-encoded. Each is checked raw first
// (empty, ".", "..", backslash, NUL), then decoded and checked again for a "/" or ".." that only
// appears once decoded. A segment that fails to decode is unsafe.
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

export type ZipEntry = { name: string; size: number; isDirectory: boolean };

export type ZipPlan =
  | { entry: string; files: { zipName: string; deckPath: string; size: number }[] }
  | { error: string };

const MAX_ZIP_FILES = 500;
const MAX_ZIP_UNPACKED_BYTES = 40 * 1024 * 1024;

// Plans from names and DECLARED sizes only, never file bytes. Drops directories, macOS junk and
// unsafe paths BEFORE the 500-file / 40 MB limits, which are about what would land in Storage.
export function planZip(entries: ZipEntry[]): ZipPlan {
  const candidates: { zipName: string; deckPath: string; size: number }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // Windows zips may use backslashes.
    const normalized = entry.name.replace(/\\/g, "/");
    const segments = normalized.split("/");

    if (segments.includes("__MACOSX")) continue;
    if (segments[segments.length - 1] === ".DS_Store") continue;
    if (segments.some((segment) => segment.startsWith("."))) continue;

    // Zip names aren't URL-encoded, but this still catches a name that would decode into a
    // traversal.
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

  // Strip the one wrapping folder so the deck's entry file sits at the top, where relative assets
  // resolve.
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
