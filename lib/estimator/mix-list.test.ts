import assert from "node:assert/strict";
import { test } from "node:test";
import { filterMixes, groupMixes, mixGroupNames, mixListParams } from "./mix-list";

const mix = (name: string, over: Partial<Parameters<typeof filterMixes>[0][number]> = {}) => ({
  name,
  uom: "cum",
  description: null,
  groupName: null,
  isActive: true,
  componentCount: 3,
  useCount: 2,
  materialNames: [],
  ...over,
});

const rows = [
  mix("M20 concrete", { groupName: "Concrete", materialNames: ["Cement", "M-sand", "20mm metal"] }),
  mix("M25 concrete", { groupName: "concrete ", useCount: 0 }),
  mix("CM 1:4", { groupName: "Mortar", description: "for brickwork", materialNames: ["Cement"] }),
  mix("Lime wash", { uom: "sqm", isActive: false, componentCount: 0 }),
];

test("search reads name, note, group, unit and the materials inside; every word must match", () => {
  assert.deepEqual(
    filterMixes(rows, { q: "cement" }).map((row) => row.name),
    ["M20 concrete", "CM 1:4"],
  );
  assert.deepEqual(
    filterMixes(rows, { q: "brickwork cm" }).map((row) => row.name),
    ["CM 1:4"],
  );
  assert.deepEqual(
    filterMixes(rows, { q: "SQM" }).map((row) => row.name),
    ["Lime wash"],
  );
});

test("filters: group in any case, no group, status, empty and unused", () => {
  assert.equal(filterMixes(rows, { group: "CONCRETE" }).length, 2);
  assert.deepEqual(
    filterMixes(rows, { group: "(none)" }).map((row) => row.name),
    ["Lime wash"],
  );
  assert.deepEqual(
    filterMixes(rows, { status: "inactive" }).map((row) => row.name),
    ["Lime wash"],
  );
  assert.deepEqual(
    filterMixes(rows, { show: "empty" }).map((row) => row.name),
    ["Lime wash"],
  );
  assert.deepEqual(
    filterMixes(rows, { show: "unused", status: "active" }).map((row) => row.name),
    ["M25 concrete"],
  );
});

test("grouping: one section per group whatever its case, A–Z, No group last", () => {
  const sections = groupMixes(rows, undefined);
  assert.deepEqual(
    sections.map((section) => [section.heading, section.rows.length]),
    [
      ["Concrete", 2],
      ["Mortar", 1],
      ["No group", 1],
    ],
  );
  assert.deepEqual(
    groupMixes(rows, "unit").map((section) => section.heading),
    ["cum", "sqm"],
  );
  assert.deepEqual(
    groupMixes(rows, "none").map((section) => [section.heading, section.rows.length]),
    [[null, 4]],
  );
  assert.deepEqual(groupMixes([], "none"), []);
});

test("group names are each spelt once; unknown params are dropped", () => {
  assert.deepEqual(mixGroupNames(rows), ["Concrete", "Mortar"]);
  assert.deepEqual(mixListParams({ q: "  m20 ", status: "gone", show: "unused", by: "x" }), {
    q: "m20",
    group: undefined,
    status: undefined,
    show: "unused",
    by: undefined,
  });
});
