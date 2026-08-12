/**
 * The registry invariants. This is the only automated gate that would
 * have caught the four dead Client Relations screens: a bad PostgREST
 * select is invisible to lint, types, tests-with-no-database and build,
 * so the rules a select must obey are asserted as text here — and every
 * dataset still gets opened by hand once before its stage merges.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DATASETS, DEFAULT_DATASET, resolveFieldKey, type DatasetDef } from "./datasets";

const entries = Object.entries(DATASETS);

test("the default dataset exists", () => {
  assert.ok(DATASETS[DEFAULT_DATASET]);
});

test("every embed names its constraint — no bare relation before (", () => {
  for (const [key, dataset] of entries) {
    for (const select of [dataset.select, dataset.optionsSelect]) {
      if (!select) continue;
      // Every `word(` or `word!inner(` must carry a named `!..._fkey`.
      const embeds = select.matchAll(/([a-z_]+)((?:![a-z_]+)*)\(/g);
      for (const [, relation, modifiers] of embeds) {
        assert.ok(
          modifiers.includes("_fkey"),
          `${key}: embed "${relation}${modifiers}(" does not name its FK constraint`,
        );
      }
    }
  }
});

test("every text filter is a dropdown — the founder's no-typing rule", () => {
  for (const [key, dataset] of entries) {
    for (const [fieldKey, field] of Object.entries(dataset.fields)) {
      if (field.type !== "text" || !field.filterColumn) continue;
      assert.ok(
        field.lookup || field.filterOptions === "distinct",
        `${key}.${fieldKey}: a filterable text field must declare lookup or filterOptions`,
      );
    }
  }
});

test("distinct fields' columns are all present in the optionsSelect", () => {
  for (const [key, dataset] of entries) {
    for (const [fieldKey, field] of Object.entries(dataset.fields)) {
      if (field.filterOptions !== "distinct") continue;
      assert.ok(dataset.optionsSelect, `${key}: distinct fields but no optionsSelect`);
      const leaf = field.path.split(".").pop()!;
      assert.ok(
        dataset.optionsSelect!.includes(leaf),
        `${key}.${fieldKey}: "${leaf}" is not in the optionsSelect`,
      );
    }
  }
});

test("plots is never reached except through units_plot_id_fkey", () => {
  for (const [key, dataset] of entries) {
    if (dataset.select.includes("plots")) {
      assert.ok(
        dataset.select.includes("plots!units_plot_id_fkey"),
        `${key}: plots embedded without naming units_plot_id_fkey`,
      );
    }
  }
});

test("every filterColumn and sortColumn is present in the select", () => {
  for (const [key, dataset] of entries) {
    for (const [fieldKey, field] of Object.entries(dataset.fields)) {
      for (const column of [field.filterColumn, field.sortColumn]) {
        if (!column) continue;
        // For a dotted column ("indents.project_id") the embed and the
        // final column must both be in the select string.
        const parts = column.split(".");
        const last = parts[parts.length - 1];
        assert.ok(
          dataset.select.includes(last),
          `${key}.${fieldKey}: column "${last}" is not in the select`,
        );
        for (const relation of parts.slice(0, -1)) {
          assert.ok(
            dataset.select.includes(`${relation}!`),
            `${key}.${fieldKey}: embed "${relation}" is not in the select`,
          );
        }
      }
    }
  }
});

test("a project filter that crosses an embed pushes down through !inner", () => {
  for (const [key, dataset] of entries) {
    if (!dataset.projectField) continue;
    const field = dataset.fields[dataset.projectField];
    assert.ok(field, `${key}: projectField "${dataset.projectField}" is not a field`);
    assert.ok(field.filterColumn, `${key}: projectField has no filterColumn`);
    const parts = field.filterColumn.split(".");
    if (parts.length > 1) {
      assert.ok(
        dataset.select.includes(`${parts[0]}!`) &&
          new RegExp(`${parts[0]}![a-z_]+!inner\\(`).test(dataset.select),
        `${key}: project scope crosses the "${parts[0]}" embed without !inner`,
      );
    }
  }
});

test("defaults, date fields and sorts all resolve against real fields", () => {
  for (const [key, dataset] of entries) {
    for (const column of dataset.defaultColumns) {
      assert.ok(dataset.fields[column], `${key}: default column "${column}" unknown`);
    }
    for (const dateField of dataset.dateFields) {
      assert.equal(dataset.fields[dateField]?.type, "date", `${key}: "${dateField}" not a date`);
    }
    for (const sort of dataset.defaultSort) {
      assert.ok(
        dataset.fields[sort.field]?.sortColumn,
        `${key}: default sort "${sort.field}" is not sortable`,
      );
    }
  }
});

test("no money field on a money-free dataset", () => {
  for (const [key, dataset] of entries) {
    if (dataset.money) continue;
    for (const [fieldKey, field] of Object.entries(dataset.fields)) {
      assert.notEqual(field.type, "money", `${key}.${fieldKey} carries money on money:false`);
    }
  }
});

test("aliases never collide with live keys or each other", () => {
  for (const [key, dataset] of entries) {
    const seen = new Set<string>(Object.keys(dataset.fields));
    for (const field of Object.values(dataset.fields)) {
      for (const alias of field.aliases ?? []) {
        assert.ok(!seen.has(alias), `${key}: alias "${alias}" collides`);
        seen.add(alias);
      }
    }
  }
});

test("resolveFieldKey follows aliases and refuses everything else", () => {
  const fake: DatasetDef = {
    label: "Fake",
    description: "",
    source: "fake",
    select: "id",
    optionsSelect: null,
    projectField: null,
    dateFields: [],
    money: false,
    defaultColumns: ["new_name"],
    defaultSort: [],
    fields: {
      new_name: {
        label: "New name",
        type: "text",
        path: "new_name",
        groupable: false,
        aggregates: [],
        aliases: ["old_name"],
      },
    },
  };
  assert.equal(resolveFieldKey(fake, "new_name"), "new_name");
  assert.equal(resolveFieldKey(fake, "old_name"), "new_name");
  assert.equal(resolveFieldKey(fake, "missing"), null);
  assert.equal(resolveFieldKey(fake, "__proto__"), null);
  assert.equal(resolveFieldKey(fake, 42), null);
  assert.equal(resolveFieldKey(fake, ""), null);
});
