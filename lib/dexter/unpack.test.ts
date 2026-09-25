import assert from "node:assert/strict";
import { test } from "node:test";

import { contentTypeFor, planZip, safeDeckPath, type ZipEntry } from "./unpack";

// ---------------------------------------------------------------------
// contentTypeFor
// ---------------------------------------------------------------------

test("contentTypeFor knows the common web types", () => {
  assert.equal(contentTypeFor("index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("assets/style.css"), "text/css; charset=utf-8");
  assert.equal(contentTypeFor("assets/app.js"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeFor("data.json"), "application/json");
  assert.equal(contentTypeFor("photo.jpg"), "image/jpeg");
  assert.equal(contentTypeFor("icon.svg"), "image/svg+xml");
});

test("contentTypeFor is case-insensitive on the extension", () => {
  assert.equal(contentTypeFor("PHOTO.JPG"), "image/jpeg");
  assert.equal(contentTypeFor("Index.HTML"), "text/html; charset=utf-8");
});

test("contentTypeFor falls back to a plain download for anything unknown", () => {
  assert.equal(contentTypeFor("script.sh"), "application/octet-stream");
  assert.equal(contentTypeFor("no-extension"), "application/octet-stream");
  assert.equal(contentTypeFor("trailing-dot."), "application/octet-stream");
});

// ---------------------------------------------------------------------
// safeDeckPath
// ---------------------------------------------------------------------

test("safeDeckPath accepts a plain relative path", () => {
  assert.equal(safeDeckPath(["assets", "style.css"]), "assets/style.css");
  assert.equal(safeDeckPath(["index.html"]), "index.html");
});

test("safeDeckPath rejects plain traversal", () => {
  assert.equal(safeDeckPath([".."]), null);
  assert.equal(safeDeckPath(["assets", ".."]), null);
  assert.equal(safeDeckPath([".."]), null);
  assert.equal(safeDeckPath(["."]), null);
});

test("safeDeckPath rejects percent-encoded traversal", () => {
  assert.equal(safeDeckPath(["%2e%2e"]), null);
  assert.equal(safeDeckPath(["%2e%2e", "secret"]), null);
  assert.equal(safeDeckPath(["assets", "%2e%2e%2fsecret"]), null);
});

test("safeDeckPath rejects empty segments, backslashes and NUL", () => {
  assert.equal(safeDeckPath([]), null);
  assert.equal(safeDeckPath([""]), null);
  assert.equal(safeDeckPath(["assets", ""]), null);
  assert.equal(safeDeckPath(["a\\b"]), null);
  assert.equal(safeDeckPath(["a\0b"]), null);
});

test("safeDeckPath rejects a path over 200 characters", () => {
  const long = "a".repeat(201);
  assert.equal(safeDeckPath([long]), null);
  const justUnder = "a".repeat(200);
  assert.equal(safeDeckPath([justUnder]), justUnder);
});

test("safeDeckPath decodes a legitimately encoded segment", () => {
  assert.equal(safeDeckPath(["my%20file.png"]), "my file.png");
});

// ---------------------------------------------------------------------
// planZip
// ---------------------------------------------------------------------

function file(name: string, size = 10): ZipEntry {
  return { name, size, isDirectory: false };
}

function dir(name: string): ZipEntry {
  return { name, size: 0, isDirectory: true };
}

test("planZip picks index.html at the root", () => {
  const plan = planZip([file("index.html"), file("assets/style.css")]);
  assert.deepEqual(plan, {
    entry: "index.html",
    files: [
      { zipName: "index.html", deckPath: "index.html", size: 10 },
      { zipName: "assets/style.css", deckPath: "assets/style.css", size: 10 },
    ],
  });
});

test("planZip strips one shared top-level folder", () => {
  const plan = planZip([
    dir("MyDeck/"),
    file("MyDeck/index.html"),
    file("MyDeck/assets/style.css"),
  ]);
  assert.deepEqual(plan, {
    entry: "index.html",
    files: [
      { zipName: "MyDeck/index.html", deckPath: "index.html", size: 10 },
      { zipName: "MyDeck/assets/style.css", deckPath: "assets/style.css", size: 10 },
    ],
  });
});

test("planZip does not strip when files sit at different depths", () => {
  const plan = planZip([file("index.html"), file("MyDeck/notes.txt")]);
  assert.deepEqual(plan, {
    entry: "index.html",
    files: [
      { zipName: "index.html", deckPath: "index.html", size: 10 },
      { zipName: "MyDeck/notes.txt", deckPath: "MyDeck/notes.txt", size: 10 },
    ],
  });
});

test("planZip drops __MACOSX resource-fork junk", () => {
  const plan = planZip([
    file("index.html"),
    file("__MACOSX/._index.html"),
    file("__MACOSX/index.html"),
  ]);
  assert.deepEqual(plan, {
    entry: "index.html",
    files: [{ zipName: "index.html", deckPath: "index.html", size: 10 }],
  });
});

test("planZip drops .DS_Store and dotfiles", () => {
  const plan = planZip([file("index.html"), file(".DS_Store"), file(".git/config")]);
  assert.deepEqual(plan, {
    entry: "index.html",
    files: [{ zipName: "index.html", deckPath: "index.html", size: 10 }],
  });
});

test("planZip drops traversal entries rather than failing the whole zip", () => {
  const plan = planZip([file("index.html"), file("../evil.html")]);
  assert.deepEqual(plan, {
    entry: "index.html",
    files: [{ zipName: "index.html", deckPath: "index.html", size: 10 }],
  });
});

test("planZip picks the single root .html file when there is no index.html", () => {
  const plan = planZip([file("deck.html"), file("assets/style.css")]);
  assert.ok("entry" in plan);
  assert.equal(plan.entry, "deck.html");
});

test("planZip fails with a plain reason when no index.html can be found", () => {
  const plan = planZip([file("readme.txt"), file("assets/style.css")]);
  assert.deepEqual(plan, { error: "Couldn't find index.html at the top of the zip." });
});

test("planZip fails when several .html files sit at the root and none is index.html", () => {
  const plan = planZip([file("a.html"), file("b.html")]);
  assert.deepEqual(plan, { error: "Couldn't find index.html at the top of the zip." });
});

test("planZip refuses an empty zip", () => {
  assert.deepEqual(planZip([]), { error: "That zip doesn't contain any files." });
  assert.deepEqual(planZip([dir("empty/")]), { error: "That zip doesn't contain any files." });
});

test("planZip refuses more than 500 files", () => {
  const entries = [file("index.html"), ...Array.from({ length: 500 }, (_, i) => file(`a${i}.txt`))];
  assert.deepEqual(planZip(entries), {
    error: "That zip has too many files — the limit is 500.",
  });
});

test("planZip refuses more than 40 MB unpacked", () => {
  const entries = [file("index.html", 41 * 1024 * 1024)];
  assert.deepEqual(planZip(entries), { error: "That zip unpacks to more than 40 MB." });
});
