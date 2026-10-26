import assert from "node:assert/strict";
import { test } from "node:test";

import { awaitsConfirmation, isShort, siteReceiptProblem } from "./site-receipt";

test("every line answered, never more than sent, and a shortage says why", () => {
  const full = [
    { lineId: "a", sent: 50, received: 50 },
    { lineId: "b", sent: 2.5, received: 2.5 },
  ];
  assert.equal(siteReceiptProblem(full, null), undefined);
  assert.match(siteReceiptProblem([], null) ?? "", /nothing/);
  assert.match(
    siteReceiptProblem([{ lineId: "a", sent: 50, received: null }], null) ?? "",
    /every line/,
  );
  assert.match(siteReceiptProblem([{ lineId: "a", sent: 50, received: -1 }], null) ?? "", /below/);
  assert.match(
    siteReceiptProblem([{ lineId: "a", sent: 50, received: 51 }], null) ?? "",
    /More than was sent/,
  );

  const short = [{ lineId: "a", sent: 50, received: 48 }];
  assert.match(siteReceiptProblem(short, "  ") ?? "", /say why/);
  assert.equal(siteReceiptProblem(short, "Two bags torn"), undefined);
  // Nothing arrived is a shortage too.
  assert.match(siteReceiptProblem([{ lineId: "a", sent: 5, received: 0 }], null) ?? "", /why/);
});

test("short means less arrived than was sent", () => {
  assert.equal(isShort({ sent: 10, received: 9.5 }), true);
  assert.equal(isShort({ sent: 10, received: 10 }), false);
  assert.equal(isShort({ sent: 10, received: null }), false);
});

test("a delivery waits for the site until a confirmation reaches every line", () => {
  assert.equal(awaitsConfirmation({ confirmed: false, lines: [{ received: null }] }), true);
  assert.equal(
    awaitsConfirmation({ confirmed: true, lines: [{ received: 5 }, { received: null }] }),
    true,
  );
  assert.equal(awaitsConfirmation({ confirmed: true, lines: [{ received: 5 }] }), false);
  // Nothing on it, nothing to confirm.
  assert.equal(awaitsConfirmation({ confirmed: false, lines: [] }), false);
});
