/**
 * Birdwing's tiles in Financial Management — the consolidated page's
 * arithmetic, pinned.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  birdwingTiles,
  expenseStackModel,
  monthsSoFar,
  occupancyModel,
  type BirdwingMonth,
} from "./birdwing";

const month = (over: Partial<BirdwingMonth>): BirdwingMonth => ({
  month: "2026-09-01",
  daysInMonth: 30,
  rooms: 4,
  stays: 10,
  roomNights: 51,
  roomNightsEstimated: true,
  roomRevenue: 131667.54,
  charged: 200022.54,
  otaCommission: 0,
  discount: 0,
  billed: 200022.54,
  billedGuest: 59847.54,
  billedInternal: 140175,
  collected: 122531.88,
  crossCharged: 0,
  writtenOff: 0,
  pending: 77490.66,
  pendingGuest: 10000,
  pendingInternal: 67490.66,
  expenses: 188955.5,
  ...over,
});

test("the tiles: results on billed and on cash, and the pending split", () => {
  const tiles = birdwingTiles([month({})], "2026-10-13");
  assert.equal(tiles.billed, 200022.54);
  assert.equal(tiles.resultBilled, 11067.04);
  assert.equal(tiles.resultCash, -66423.62);
  assert.equal(tiles.pendingInternal, 67490.66);
  assert.equal(Math.round((tiles.collectedShare ?? 0) * 100), 61);
});

test("occupancy counts complete months only, and says when it is estimated", () => {
  const rows = [month({}), month({ month: "2026-10-01", daysInMonth: 31, roomNights: 20 })];
  const tiles = birdwingTiles(rows, "2026-10-13");
  assert.equal(tiles.occupancyRoomNights, 51);
  assert.equal(tiles.occupancyCapacity, 120);
  assert.equal(Math.round((tiles.occupancy ?? 0) * 1000) / 10, 42.5);
  assert.equal(tiles.occupancyEstimated, true);
  // The running month still counts in the money, not in the room rate.
  assert.equal(tiles.monthCount, 2);
  assert.equal(tiles.averageRoomRate, Math.round((131667.54 / 51) * 100) / 100);
  const model = occupancyModel(monthsSoFar(rows, "2026-10-13"), "2026-10-13");
  assert.equal(model.points[0].values.occupancy, 42.5);
  assert.equal(model.points[1].values.occupancy, null);
});

test("a month not yet begun counts in nothing; no nights means no rate", () => {
  const tiles = birdwingTiles(
    [month({ month: "2026-11-01", roomNights: 0, roomRevenue: 0, expenses: 70000 })],
    "2026-10-13",
  );
  assert.equal(tiles.expenses, 0);
  assert.equal(tiles.averageRoomRate, null);
  assert.equal(tiles.occupancy, null);
});

test("expense heads beyond eight fold into Other", () => {
  const heads = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const model = expenseStackModel(
    heads.map((head, index) => ({ month: "2026-09-01", head, amount: 100 - index })),
    [month({})],
  );
  assert.equal(model.series.length, 8);
  assert.equal(model.series[7].id, "Other");
  assert.equal(model.points[0].values.Other, 92 + 93);
});
