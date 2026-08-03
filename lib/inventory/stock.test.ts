/**
 * Stock is only ever computed, so this arithmetic is the tool's whole
 * claim to being right. The cases pinned here are the ones a
 * spreadsheet gets wrong: a transfer moving stock without creating or
 * destroying any, a negative adjustment, and the boundary where an
 * issue exactly empties a store.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  balanceOf,
  balancesByStoreItem,
  isFullyReceived,
  isFullyReceivedOrder,
  remainingToReceive,
  signedQuantity,
  wouldGoNegative,
  type Movement,
} from "./stock";

const move = (
  kind: Movement["kind"],
  quantity: number,
  store_id = "store-a",
  item_id = "cement",
): Movement => ({ kind, quantity, store_id, item_id });

test("receipts and transfers in add, issues take away", () => {
  assert.equal(signedQuantity(move("receipt", 100)), 100);
  assert.equal(signedQuantity(move("transfer_in", 40)), 40);
  assert.equal(signedQuantity(move("issue", 30)), -30);
});

test("an adjustment carries its own sign", () => {
  assert.equal(signedQuantity(move("adjustment", 25)), 25);
  assert.equal(signedQuantity(move("adjustment", -8)), -8);
});

test("a balance is the sum of its movements", () => {
  assert.equal(balanceOf([move("receipt", 100), move("issue", 30), move("adjustment", -5)]), 65);
  assert.equal(balanceOf([]), 0);
});

test("a transfer moves stock without changing the total", () => {
  const balances = balancesByStoreItem([
    move("receipt", 100, "store-a"),
    move("issue", 40, "store-a"),
    move("transfer_in", 40, "store-b"),
  ]);
  assert.equal(balances.get("store-a:cement"), 60);
  assert.equal(balances.get("store-b:cement"), 40);
  assert.equal(
    [...balances.values()].reduce((a, b) => a + b, 0),
    100,
  );
});

test("stores and items are counted apart, and an emptied store still appears", () => {
  const balances = balancesByStoreItem([
    move("receipt", 10, "store-a", "cement"),
    move("receipt", 7, "store-a", "sand"),
    move("issue", 10, "store-a", "cement"),
  ]);
  assert.equal(balances.get("store-a:cement"), 0);
  assert.equal(balances.get("store-a:sand"), 7);
  assert.equal(balances.size, 2);
});

test("remaining to receive never goes negative", () => {
  assert.equal(remainingToReceive(100, 40), 60);
  assert.equal(remainingToReceive(100, 100), 0);
  assert.equal(remainingToReceive(100, 120), 0);
});

test("a line is fully received once the ordered quantity has arrived", () => {
  assert.equal(isFullyReceived(100, 99), false);
  assert.equal(isFullyReceived(100, 100), true);
  assert.equal(isFullyReceived(100, 101), true);
});

test("an order completes only when every line has arrived", () => {
  assert.equal(
    isFullyReceivedOrder([
      { ordered: 100, received: 100 },
      { ordered: 5, received: 5 },
    ]),
    true,
  );
  assert.equal(
    isFullyReceivedOrder([
      { ordered: 100, received: 100 },
      { ordered: 5, received: 4 },
    ]),
    false,
  );
  // A PO with no lines cannot be complete — it was never started.
  assert.equal(isFullyReceivedOrder([]), false);
});

test("issuing exactly what is there is allowed; one more is not", () => {
  assert.equal(wouldGoNegative(60, 60), false);
  assert.equal(wouldGoNegative(60, 60.5), true);
  assert.equal(wouldGoNegative(0, 1), true);
});
