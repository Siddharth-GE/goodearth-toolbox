// Preview card logic for a shared deck link. Import-free: the public deck route (no session) reads
// it, so renaming an export breaks the route. The image lives at DEXTER_PREVIEW_PATH; the leading
// dot can't collide with a deck file (planZip drops dot paths).

export const DEXTER_PREVIEW_PATH = ".preview.png";
export const PREVIEW_SITE_NAME = "Kaadal";
export const PREVIEW_TAGLINE = "Designs that grow from the inside out";
export const PREVIEW_SIZE = { width: 1200, height: 630 } as const;
export const DEFAULT_PREVIEW_BACKGROUND = "#521323";

// First colour wins. A hex run mustn't run into a word character, and bare words must stand alone
// (not part of off-white or custom-property names).
const COLOR_PATTERN =
  /#([0-9a-f]+)(?!\w)|(?<![\w-])rgba?\(([^)]*)\)|(?<![\w-])(white|black)(?![\w-])/gi;

const RGB_ARGS =
  /^\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*[,/]\s*[\d.]+%?)?\s*$/;

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

// Hex (alpha dropped), rgb()/rgba() with integer channels, and bare white/black; anything else
// (transparent, url(), percent channels) is skipped.
export function parseCssColor(value: string): string | null {
  for (const match of value.matchAll(COLOR_PATTERN)) {
    if (match[1] !== undefined) {
      const digits = match[1].toLowerCase();
      if (digits.length === 3 || digits.length === 4) {
        const [r, g, b] = digits;
        return `#${r}${r}${g}${g}${b}${b}`;
      }
      if (digits.length === 6 || digits.length === 8) {
        return `#${digits.slice(0, 6)}`;
      }
      continue;
    }
    if (match[2] !== undefined) {
      const channels = RGB_ARGS.exec(match[2]);
      if (!channels) continue;
      const [r, g, b] = [channels[1], channels[2], channels[3]].map(Number);
      if (r > 255 || g > 255 || b > 255) continue;
      return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    }
    return match[3].toLowerCase() === "white" ? "#ffffff" : "#000000";
  }
  return null;
}

const KAADAL_TOKENS: Record<string, string> = {
  "--k-ink": "#180b0f",
  "--k-teal": "#102228",
  "--k-burgundy": "#521323",
  "--k-olive": "#7c783f",
  "--k-ochre": "#be904c",
  "--k-sage": "#bfc9b3",
  "--k-blush": "#dec8b7",
  "--k-cream": "#fdf3f6",
  "--k-rose-mist": "#f2e8e9",
  "--k-paper": "#f0eeea",
  "--k-white": "#ffffff",
  "--k-black": "#0d0d0d",
};

const MAX_VAR_DEPTH = 4;
const VAR_CALL = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/g;

function attributeOf(tag: string, name: string): string | null {
  const pattern = new RegExp(`(?:^|[\\s"'/])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? "";
}

function customProperties(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    found.set(match[1], match[2].replace(/\s*!important\s*$/i, "").trim());
  }
  return found;
}

function resolveVars(value: string, custom: Map<string, string>): string | null {
  let current = value;
  for (let depth = 0; depth < MAX_VAR_DEPTH && current.includes("var("); depth += 1) {
    let unresolved = false;
    current = current.replace(VAR_CALL, (_whole, name: string, fallback?: string) => {
      const known = custom.get(name) ?? KAADAL_TOKENS[name] ?? fallback;
      if (known === undefined) {
        unresolved = true;
        return "";
      }
      return known;
    });
    if (unresolved) return null;
  }
  if (current.includes("var(")) return null;
  return current;
}

function colorOf(value: string | null, custom: Map<string, string>): string | null {
  if (value === null) return null;
  const resolved = resolveVars(value, custom);
  return resolved === null ? null : parseCssColor(resolved);
}

function lastBackground(declarations: string): string | null {
  let last: string | null = null;
  for (const match of declarations.matchAll(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/gi)) {
    last = match[1].replace(/\s*!important\s*$/i, "").trim();
  }
  return last;
}

function ruleBackground(css: string, matches: (selector: string) => boolean): string | null {
  let last: string | null = null;
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!rule[1].split(",").some((selector) => matches(selector.trim()))) continue;
    const value = lastBackground(rule[2]);
    if (value !== null) last = value;
  }
  return last;
}

// Looks at the theme-color meta, body's inline style, the page's body then html/:root rules, then
// bgcolor. var(--x) resolves from the page, then Kaadal tokens, then the fallback.
export function deckBackgroundColor(html: string): string | null {
  const source = html.replace(/\/\*[\s\S]*?\*\//g, "");

  let css = "";
  for (const block of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    css += `${block[1]}\n`;
  }
  const custom = customProperties(css);

  for (const tag of source.matchAll(/<meta\b[^>]*>/gi)) {
    if (attributeOf(tag[0], "name")?.trim().toLowerCase() !== "theme-color") continue;
    const fromMeta = colorOf(attributeOf(tag[0], "content"), custom);
    if (fromMeta) return fromMeta;
    break;
  }

  const bodyTag = /<body\b[^>]*>/i.exec(source)?.[0] ?? "";
  const bodyStyle = attributeOf(bodyTag, "style");
  const fromInline = colorOf(bodyStyle === null ? null : lastBackground(bodyStyle), custom);
  if (fromInline) return fromInline;

  const fromBodyRule = colorOf(
    ruleBackground(css, (selector) => selector === "body"),
    custom,
  );
  if (fromBodyRule) return fromBodyRule;
  const fromHtmlRule = colorOf(
    ruleBackground(css, (selector) => selector === "html" || selector === ":root"),
    custom,
  );
  if (fromHtmlRule) return fromHtmlRule;

  return colorOf(attributeOf(bodyTag, "bgcolor"), custom);
}

const BURGUNDY = "#521323";
const BLUSH = "#dec8b7";

// Brand-approved pairings, tried first.
const APPROVED_MARKS: Record<string, string> = {
  "#be904c": "#ffffff",
  "#521323": "#dec8b7",
  "#102228": "#bfc9b3",
  "#dec8b7": "#521323",
  "#bfc9b3": "#521323",
  "#180b0f": "#ffffff",
  "#0d0d0d": "#ffffff",
  "#fdf3f6": "#521323",
  "#ffffff": "#521323",
  "#f2e8e9": "#521323",
  "#f0eeea": "#521323",
  "#7c783f": "#fdf3f6",
};

function luminance(color: string): number {
  const linear = [1, 3, 5].map((start) => {
    const c = parseInt(color.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The approved pairing if any, else burgundy or blush, whichever reads better, else white or ink
// when neither reaches contrast 3.
export function previewMarkColor(background: string): string {
  const bg = background.toLowerCase();
  const approved = APPROVED_MARKS[bg];
  if (approved) return approved;
  if (!/^#[0-9a-f]{6}$/.test(bg)) return BURGUNDY;

  const burgundy = contrast(BURGUNDY, bg);
  const blush = contrast(BLUSH, bg);
  const best = blush > burgundy ? BLUSH : BURGUNDY;
  if (Math.max(burgundy, blush) >= 3) return best;
  return contrast("#ffffff", bg) >= contrast("#180b0f", bg) ? "#ffffff" : "#180b0f";
}

const MAX_TITLE_LENGTH = 120;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// The route reads deck files one char per byte so bytes survive a round trip; this decodes them as
// UTF-8.
export function latin1ToUtf8(text: string): string {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      const isScalar = code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return isScalar ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function pageTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (!match) return null;
  const text = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  const capped = Array.from(text).slice(0, MAX_TITLE_LENGTH).join("").trim();
  return capped === "" ? null : capped;
}

// Pure ASCII: the route splices it into a byte-preserved file of unknown charset.
function escapeAttribute(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (char === "&") out += "&amp;";
    else if (char === '"') out += "&quot;";
    else if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (code < 0x20 || code > 0x7e) out += `&#${code};`;
    else out += char;
  }
  return out;
}

export function previewTags(input: { title: string; imageUrl: string }): string {
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeAttribute(PREVIEW_SITE_NAME)}">`,
    `<meta property="og:title" content="${escapeAttribute(input.title)}">`,
    `<meta property="og:description" content="${escapeAttribute(PREVIEW_TAGLINE)}">`,
    `<meta property="og:image" content="${escapeAttribute(input.imageUrl)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="${PREVIEW_SIZE.width}">`,
    `<meta property="og:image:height" content="${PREVIEW_SIZE.height}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n");
}

/** ASCII tags spliced into a UTF-16 file would corrupt it, so those are left alone. */
export function canInjectPreviewTags(bytes: Uint8Array): boolean {
  if (bytes.length >= 2) {
    const littleEndian = bytes[0] === 0xff && bytes[1] === 0xfe;
    const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
    if (littleEndian || bigEndian) return false;
  }
  return true;
}

// Tags go first (after <head>, else <html>, else doctype, else the start) so they win over the
// deck's own Open Graph tags; no other character changes.
export function injectPreviewTags(html: string, tags: string): string {
  const block = `\n${tags}\n`;
  const anchors = [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i];
  for (const anchor of anchors) {
    const match = anchor.exec(html);
    if (match) {
      const at = match.index + match[0].length;
      return html.slice(0, at) + block + html.slice(at);
    }
  }
  return block + html;
}
