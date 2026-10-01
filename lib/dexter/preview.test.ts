import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canInjectPreviewTags,
  deckBackgroundColor,
  injectPreviewTags,
  latin1ToUtf8,
  pageTitle,
  parseCssColor,
  previewMarkColor,
  previewTags,
} from "./preview";

// ---------------------------------------------------------------------
// parseCssColor
// ---------------------------------------------------------------------

test("parseCssColor reads every hex length and drops alpha", () => {
  assert.equal(parseCssColor("#abc"), "#aabbcc");
  assert.equal(parseCssColor("#ABCD"), "#aabbcc");
  assert.equal(parseCssColor("#521323"), "#521323");
  assert.equal(parseCssColor("#521323AA"), "#521323");
});

test("parseCssColor rejects a hex run of the wrong length and keeps scanning", () => {
  assert.equal(parseCssColor("#12345"), null);
  assert.equal(parseCssColor("#1234567"), null);
  assert.equal(parseCssColor("#12345 #abc"), "#aabbcc");
  assert.equal(parseCssColor("#abcg"), null);
});

test("parseCssColor reads rgb and rgba in comma and space forms", () => {
  assert.equal(parseCssColor("rgb(82, 19, 35)"), "#521323");
  assert.equal(parseCssColor("rgb(82 19 35)"), "#521323");
  assert.equal(parseCssColor("rgba(82, 19, 35, 0.5)"), "#521323");
  assert.equal(parseCssColor("rgb(82 19 35 / 50%)"), "#521323");
  assert.equal(parseCssColor("RGB(255,255,255)"), "#ffffff");
});

test("parseCssColor rejects percent channels and channels over 255", () => {
  assert.equal(parseCssColor("rgb(10%, 20%, 30%)"), null);
  assert.equal(parseCssColor("rgb(256, 0, 0)"), null);
  assert.equal(parseCssColor("rgb(256, 0, 0) #fff"), "#ffffff");
});

test("parseCssColor knows white and black as whole words", () => {
  assert.equal(parseCssColor("white"), "#ffffff");
  assert.equal(parseCssColor("BLACK"), "#000000");
  assert.equal(parseCssColor("whitesmoke"), null);
});

test("parseCssColor finds nothing in url() or transparent", () => {
  assert.equal(parseCssColor("url(x.jpg)"), null);
  assert.equal(parseCssColor("transparent"), null);
  assert.equal(parseCssColor(""), null);
});

test("parseCssColor takes the first colour in a gradient", () => {
  assert.equal(parseCssColor("linear-gradient(#521323, #180b0f)"), "#521323");
  assert.equal(parseCssColor("linear-gradient(to right, white, #180b0f)"), "#ffffff");
});

// ---------------------------------------------------------------------
// deckBackgroundColor
// ---------------------------------------------------------------------

test("deckBackgroundColor reads theme-color in either attribute order and quote style", () => {
  assert.equal(deckBackgroundColor(`<meta name="theme-color" content="#521323">`), "#521323");
  assert.equal(deckBackgroundColor(`<meta content="#102228" name="theme-color">`), "#102228");
  assert.equal(deckBackgroundColor(`<META NAME='theme-color' CONTENT='#be904c'>`), "#be904c");
  assert.equal(
    deckBackgroundColor(
      `<meta name="theme-color" content="#111111"><meta name="theme-color" content="#222222">`,
    ),
    "#111111",
  );
});

test("deckBackgroundColor prefers theme-color over everything else", () => {
  const html = `<meta name="theme-color" content="#111111"><body style="background: #222222">`;
  assert.equal(deckBackgroundColor(html), "#111111");
});

test("deckBackgroundColor reads the inline style on body, last declaration winning", () => {
  assert.equal(
    deckBackgroundColor(`<body class="x" style="color: red; background-color: #fdf3f6">`),
    "#fdf3f6",
  );
  assert.equal(
    deckBackgroundColor(`<body style="background: #111111; background-color: #222222">`),
    "#222222",
  );
});

test("deckBackgroundColor lets a body rule beat an html rule", () => {
  const html = `<style>html { background: #111111 } body { background: #222222 }</style>`;
  assert.equal(deckBackgroundColor(html), "#222222");
});

test("deckBackgroundColor takes the last matching body rule", () => {
  const html = `<style>body { background: #111111 } body { margin: 0; background-color: #333333 }</style>`;
  assert.equal(deckBackgroundColor(html), "#333333");
});

test("deckBackgroundColor finds a body rule inside @media", () => {
  const html = `<style>@media (min-width: 1px) { body { background: #444444 } }</style>`;
  assert.equal(deckBackgroundColor(html), "#444444");
});

test("deckBackgroundColor understands selector lists", () => {
  assert.equal(deckBackgroundColor(`<style>html, body { background: #555555 }</style>`), "#555555");
});

test("deckBackgroundColor does not count body.dark as body", () => {
  assert.equal(deckBackgroundColor(`<style>body.dark { background: #666666 }</style>`), null);
});

test("deckBackgroundColor reads :root and html rules when body gives nothing", () => {
  assert.equal(deckBackgroundColor(`<style>:root { background: #777777 }</style>`), "#777777");
  assert.equal(
    deckBackgroundColor(`<style>html { background: #888888 } body { margin: 0 }</style>`),
    "#888888",
  );
});

test("deckBackgroundColor resolves var() from the page's own declaration", () => {
  const html = `<style>:root { --bg: #999999; --bg: #aaaaaa } body { background: var(--bg) }</style>`;
  assert.equal(deckBackgroundColor(html), "#aaaaaa");
});

test("deckBackgroundColor resolves var() from the built-in Kaadal tokens", () => {
  const html = `<style>body { background: var(--k-burgundy) }</style>`;
  assert.equal(deckBackgroundColor(html), "#521323");
});

test("deckBackgroundColor resolves var() through its fallback", () => {
  const html = `<style>body { background: var(--nope, #bbbbbb) }</style>`;
  assert.equal(deckBackgroundColor(html), "#bbbbbb");
});

test("deckBackgroundColor resolves nested var() two levels deep", () => {
  const html = `<style>:root { --a: var(--b); --b: var(--k-teal) } body { background: var(--a) }</style>`;
  assert.equal(deckBackgroundColor(html), "#102228");
});

test("deckBackgroundColor moves to the next source when a var() is unresolved", () => {
  const html = `<body bgcolor="#cccccc"><style>body { background: var(--missing) }</style>`;
  assert.equal(deckBackgroundColor(html), "#cccccc");
});

test("deckBackgroundColor reads the bgcolor attribute", () => {
  assert.equal(deckBackgroundColor(`<body bgcolor="#dddddd">`), "#dddddd");
});

test("deckBackgroundColor ignores CSS comments", () => {
  const html = `<style>body { /* background: #111111; */ background: #eeeeee }</style>`;
  assert.equal(deckBackgroundColor(html), "#eeeeee");
  assert.equal(deckBackgroundColor(`<style>body { /* background: #111111 */ }</style>`), null);
});

test("deckBackgroundColor returns null when nothing names a colour", () => {
  assert.equal(deckBackgroundColor(`<html><body><p>hello</p></body></html>`), null);
  assert.equal(deckBackgroundColor(`<style>body { background: url(x.jpg) }</style>`), null);
});

// ---------------------------------------------------------------------
// previewMarkColor
// ---------------------------------------------------------------------

test("previewMarkColor returns every brand-approved pairing", () => {
  const pairs: Record<string, string> = {
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
  for (const [background, mark] of Object.entries(pairs)) {
    assert.equal(previewMarkColor(background), mark, background);
  }
});

test("previewMarkColor picks the better of burgundy and blush for other colours", () => {
  assert.equal(previewMarkColor("#2a6f97"), "#dec8b7");
  assert.equal(previewMarkColor("#e07a5f"), "#521323");
});

test("previewMarkColor falls back to white or ink when neither brand colour reaches 3", () => {
  assert.equal(previewMarkColor("#727272"), "#ffffff");
});

// ---------------------------------------------------------------------
// latin1ToUtf8
// ---------------------------------------------------------------------

test("latin1ToUtf8 turns a byte-per-char string back into real text", () => {
  const title = "Café — വീട്";
  const asLatin1 = Array.from(new TextEncoder().encode(title), (b) => String.fromCharCode(b)).join(
    "",
  );
  assert.notEqual(asLatin1, title);
  assert.equal(latin1ToUtf8(asLatin1), title);
  assert.equal(latin1ToUtf8("plain"), "plain");
});

// ---------------------------------------------------------------------
// pageTitle
// ---------------------------------------------------------------------

test("pageTitle reads the first title and decodes entities", () => {
  assert.equal(
    pageTitle("<title>A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;</title>"),
    `A & B <c> "d" 'e'`,
  );
  assert.equal(pageTitle("<title>&apos;x&apos;&nbsp;y</title>"), "'x' y");
  assert.equal(pageTitle("<title>&#65;&#x42;&#x1F600;</title>"), "AB\u{1F600}");
  assert.equal(pageTitle("<TITLE id=a>First</TITLE><title>Second</title>"), "First");
});

test("pageTitle collapses whitespace across lines and trims", () => {
  assert.equal(pageTitle("<title>\n  Hello\n\t  world  \n</title>"), "Hello world");
});

test("pageTitle caps at 120 characters", () => {
  const title = pageTitle(`<title>${"a".repeat(300)}</title>`);
  assert.equal(title?.length, 120);
});

test("pageTitle is null for a missing or empty title", () => {
  assert.equal(pageTitle("<html></html>"), null);
  assert.equal(pageTitle("<title>   </title>"), null);
  assert.equal(pageTitle("<title></title>"), null);
});

// ---------------------------------------------------------------------
// previewTags
// ---------------------------------------------------------------------

test("previewTags produces the exact block", () => {
  assert.equal(
    previewTags({ title: "Villa", imageUrl: "https://x.test/deck/t/.preview.png" }),
    [
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="Kaadal">`,
      `<meta property="og:title" content="Villa">`,
      `<meta property="og:description" content="Designs that grow from the inside out">`,
      `<meta property="og:image" content="https://x.test/deck/t/.preview.png">`,
      `<meta property="og:image:type" content="image/png">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ].join("\n"),
  );
});

test("previewTags escapes attribute characters and everything outside printable ASCII", () => {
  const tags = previewTags({ title: `A&B "q" <t> é \u{1F600}`, imageUrl: "u" });
  assert.ok(tags.includes(`content="A&amp;B &quot;q&quot; &lt;t&gt; &#233; &#128512;"`));
});

test("previewTags output is pure printable ASCII", () => {
  const tags = previewTags({ title: "é\u{1F600}\u0007\u007f—", imageUrl: "https://x/é" });
  assert.match(tags, /^[\x20-\x7e\n]*$/);
});

// ---------------------------------------------------------------------
// canInjectPreviewTags
// ---------------------------------------------------------------------

test("canInjectPreviewTags refuses UTF-16 and allows everything else", () => {
  assert.equal(canInjectPreviewTags(new Uint8Array([0xff, 0xfe, 0x3c])), false);
  assert.equal(canInjectPreviewTags(new Uint8Array([0xfe, 0xff, 0x00])), false);
  assert.equal(canInjectPreviewTags(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c])), true);
  assert.equal(canInjectPreviewTags(new Uint8Array([])), true);
  assert.equal(canInjectPreviewTags(new Uint8Array([0xff])), true);
});

// ---------------------------------------------------------------------
// injectPreviewTags
// ---------------------------------------------------------------------

const TAGS = `<meta name="x" content="y">`;
const BLOCK = `\n${TAGS}\n`;

test("injectPreviewTags goes right after <head> and after <head …>", () => {
  assert.equal(
    injectPreviewTags("<html><head><title>t</title></head></html>", TAGS),
    `<html><head>${BLOCK}<title>t</title></head></html>`,
  );
  assert.equal(
    injectPreviewTags(`<HEAD lang="en"><title>t</title>`, TAGS),
    `<HEAD lang="en">${BLOCK}<title>t</title>`,
  );
});

test("injectPreviewTags does not mistake <header> for <head>", () => {
  assert.equal(
    injectPreviewTags(`<html lang="en"><body><header>h</header></body></html>`, TAGS),
    `<html lang="en">${BLOCK}<body><header>h</header></body></html>`,
  );
});

test("injectPreviewTags falls back to <html>, then the doctype, then the start", () => {
  assert.equal(injectPreviewTags(`<html><body>b</body>`, TAGS), `<html>${BLOCK}<body>b</body>`);
  assert.equal(
    injectPreviewTags(`<!DOCTYPE html>\n<p>b</p>`, TAGS),
    `<!DOCTYPE html>${BLOCK}\n<p>b</p>`,
  );
  assert.equal(injectPreviewTags(`<p>b</p>`, TAGS), `${BLOCK}<p>b</p>`);
});

test("injectPreviewTags changes nothing but the inserted block", () => {
  const inputs = [
    `<!doctype html><html><head><title>é</title></head><body>x</body></html>`,
    `<html><body>x</body></html>`,
    `<!doctype html><p>x</p>`,
    `plain text`,
    ``,
  ];
  for (const original of inputs) {
    const injected = injectPreviewTags(original, TAGS);
    assert.equal(injected.replace(BLOCK, ""), original);
  }
});
