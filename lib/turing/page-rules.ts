/**
 * Turing's pages: HTML Claude wrote, holding rows an admin can see (money too), and written
 * partly from what a dropped file said. So the page runs sandboxed on an opaque origin, with
 * no network at all; its data is put into it by the server, never fetched by it.
 */

/** The one script a page may load: a pinned chart library. */
export const CHART_LIBRARY = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";

// No allow-same-origin (that would hand the page the viewer's session), no popups, no forms.
export const PAGE_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  `script-src 'unsafe-inline' ${CHART_LIBRARY}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");

export function pageHeaders(download: { fileName: string } | null): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": PAGE_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
    ...(download ? { "Content-Disposition": `attachment; filename="${download.fileName}"` } : {}),
  };
}

/** The policy inside the file, for a downloaded copy opened from disk with no header around it. */
const POLICY_TAG = `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP.split("; ")
  .filter((directive) => !directive.startsWith("sandbox") && !directive.startsWith("frame-src"))
  .join("; ")}">`;

/**
 * The rows go in as inert JSON; `<` is escaped so no value can close the script tag. A download
 * also carries the policy as a tag, placed first so it governs everything after it.
 */
export function pageDocument(
  html: string,
  data: Record<string, unknown>,
  { download = false } = {},
): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const block = `${download ? POLICY_TAG : ""}<script type="application/json" id="turing-data">${json}</script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head)
    return (
      html.slice(0, head.index + head[0].length) + block + html.slice(head.index + head[0].length)
    );
  return block + html;
}

/**
 * A tripwire, not the wall: the CSP above refuses the network whatever the page says. What the
 * CSP cannot stop is a page navigating itself away with data in the address, so anything that
 * could reach outside the page is refused before it is saved.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/i, "fetch()"],
  [/XMLHttpRequest/i, "XMLHttpRequest"],
  [/WebSocket/i, "WebSocket"],
  [/EventSource/i, "EventSource"],
  [/sendBeacon/i, "sendBeacon"],
  [/\bimport\s*\(/i, "import()"],
  [/\blocation\b\s*(\.|=|\[)/i, "location"],
  [/\.\s*location\b/i, "location"],
  [/\b(window|self|top|parent|opener)\s*\.\s*open\s*\(/i, "window.open"],
  [/\bopen\s*\(\s*["'`]/i, "open()"],
  [
    /<\s*(form|iframe|frame|object|embed|base|link|meta|portal)\b/i,
    "a <form>, <iframe>, <object>, <embed>, <base>, <link> or <meta> tag",
  ],
  [
    /\b(href|src|action|srcset|poster|data)\s*=\s*["']?\s*(https?:|\/\/|javascript:)/i,
    "a link or source outside the page",
  ],
  [/url\s*\(\s*["']?\s*(https?:|\/\/)/i, "a stylesheet url() outside the page"],
  [/@import/i, "@import"],
];

/** The first thing in the page that could reach outside it, named; null when there is none. */
export function pageTripwire(html: string): string | null {
  const withoutLibrary = html.split(CHART_LIBRARY).join("");
  for (const [pattern, name] of FORBIDDEN) {
    if (pattern.test(withoutLibrary)) return name;
  }
  // Every <script src> must be the chart library itself.
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) {
    if (match[1] !== CHART_LIBRARY) return `a script from ${match[1]}`;
  }
  return null;
}

/** A page's file name for Download: its title, made safe. */
export function pageFileName(title: string): string {
  const base = title
    .replace(/[^A-Za-z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "turing-page"}.html`;
}
