import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogueText, checkProposal } from "../catalogue-fields";
import { totalled } from "./inventory";

const PO = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";
const STORE = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const WORK = "55555555-5555-4555-8555-555555555555";
const PLOT = "66666666-6666-4666-8666-666666666666";

test("a stock count may be corrected down; other quantities never go below zero", () => {
  const down = checkProposal({
    action: "adjustment_new",
    title: "x",
    rows: [{ label: "a", store_id: STORE, item_id: ITEM, quantity: -4.5, reason: "Broken" }],
  });
  assert.ok(down.ok && down.value.rows[0].values.quantity === "-4.5");
  const issue = checkProposal({
    action: "issue_new",
    title: "x",
    rows: [
      {
        label: "a",
        store_id: STORE,
        plot_id: PLOT,
        work_item_id: WORK,
        item_id: ITEM,
        quantity: -1,
      },
    ],
  });
  assert.ok(!issue.ok && /Quantity is a number/.test(issue.error));
  assert.match(catalogueText(), /quantity \(number, below 0 to take away\)/);
});

test("a delivery goes to a store or to site with its work, never both", () => {
  const row = { label: "a", po_id: PO, po_line_id: LINE, quantity: 3 };
  const both = checkProposal({
    action: "receipt_new",
    title: "x",
    rows: [{ ...row, store_id: STORE, to_site: true, work_item_id: WORK }],
  });
  assert.ok(!both.ok && /a store, or straight to the site/.test(both.error));
  const noWork = checkProposal({
    action: "receipt_new",
    title: "x",
    rows: [{ ...row, to_site: true }],
  });
  assert.ok(!noWork.ok && /which work/.test(noWork.error));
  assert.ok(
    checkProposal({ action: "receipt_new", title: "x", rows: [{ ...row, store_id: STORE }] }).ok,
  );
});

test("an issue goes to one place, and to a villa only with its work", () => {
  const row = { label: "a", store_id: STORE, item_id: ITEM, quantity: 2 };
  const nowhere = checkProposal({ action: "issue_new", title: "x", rows: [row] });
  assert.ok(!nowhere.ok && /one place/.test(nowhere.error));
  const noWork = checkProposal({
    action: "issue_new",
    title: "x",
    rows: [{ ...row, plot_id: PLOT }],
  });
  assert.ok(!noWork.ok && /which work/.test(noWork.error));
  const toVilla = checkProposal({
    action: "issue_new",
    title: "x",
    rows: [{ ...row, plot_id: PLOT, work_item_id: WORK }],
  });
  assert.ok(toVilla.ok && toVilla.value.rows[0].values.work_class === "standard");
});

test("the same line or item twice is one, its quantities added and rounded", () => {
  assert.deepEqual(
    totalled(
      [
        { item_id: ITEM, quantity: "0.1" },
        { item_id: ITEM, quantity: "0.2" },
        { item_id: STORE, quantity: "5" },
      ],
      "item_id",
    ),
    [
      { id: ITEM, quantity: 0.3 },
      { id: STORE, quantity: 5 },
    ],
  );
});

test("a delivery into a store and a transfer take no work, so none is dropped unsaid", () => {
  const intoStore = checkProposal({
    action: "receipt_new",
    title: "x",
    rows: [
      { label: "a", po_id: PO, po_line_id: LINE, quantity: 1, store_id: STORE, work_item_id: WORK },
    ],
  });
  assert.ok(!intoStore.ok && /serves no work yet/.test(intoStore.error));
  const transfer = { label: "a", store_id: STORE, to_store_id: PLOT, item_id: ITEM, quantity: 1 };
  const withClass = checkProposal({
    action: "issue_new",
    title: "x",
    rows: [{ ...transfer, work_class: "rework" }],
  });
  assert.ok(!withClass.ok && /serves no work/.test(withClass.error));
  assert.ok(checkProposal({ action: "issue_new", title: "x", rows: [transfer] }).ok);
});
