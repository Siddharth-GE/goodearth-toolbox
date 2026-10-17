import assert from "node:assert/strict";
import { test } from "node:test";

import { DECK_SANDBOX, deckFileHeaders } from "./headers";
import { contentTypeFor } from "./unpack";

const FILES = [
  "index.html",
  "slides/a.htm",
  "logo.svg",
  "feed.xml",
  "page.xhtml",
  "brochure.pdf",
  "style.css",
  "app.js",
  "photo.jpg",
  "font.woff2",
  "notes.txt",
  "data.unknown",
  "no-extension",
];

test("deckFileHeaders sandboxes every file, whatever its type", () => {
  for (const file of FILES) {
    const headers = deckFileHeaders(contentTypeFor(file));
    assert.equal(headers["Content-Security-Policy"], DECK_SANDBOX, file);
    assert.equal(headers["X-Content-Type-Options"], "nosniff", file);
    assert.equal(headers["Content-Type"], contentTypeFor(file), file);
  }
});

test("the deck sandbox never grants the viewer's origin", () => {
  assert.match(DECK_SANDBOX, /^sandbox /);
  assert.doesNotMatch(DECK_SANDBOX, /allow-same-origin/);
  assert.doesNotMatch(DECK_SANDBOX, /allow-top-navigation/);
});

test("the deck sandbox keeps the deck's scripts and its website link working", () => {
  for (const word of ["allow-scripts", "allow-popups", "allow-popups-to-escape-sandbox"]) {
    assert.ok(DECK_SANDBOX.split(" ").includes(word), word);
  }
});
