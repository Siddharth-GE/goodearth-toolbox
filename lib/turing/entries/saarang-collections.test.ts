import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";

const ID = "11111111-1111-4111-8111-111111111111";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("a figure is one of the cells typed by hand, and empty clears it", () => {
  assert.equal(ok("saarang_figure", { project: "plot", figure: "C", value: "237700000" }), true);
  assert.equal(ok("saarang_figure", { project: "phase3", figure: "MTD", value: "1505117" }), true);
  assert.equal(ok("saarang_figure", { project: "villa", figure: "T", value: "" }), true);
  assert.equal(ok("saarang_figure", { project: "plot", figure: "F", value: "1" }), false);
  assert.equal(ok("saarang_figure", { project: "plot", figure: "MTD", value: "1" }), false);
  assert.equal(ok("saarang_figure", { project: "plot", figure: "C" }), false);
  assert.equal(ok("saarang_figure", { project: "plot", figure: "C", value: "ten" }), false);
});

test("the period runs forwards", () => {
  assert.equal(ok("saarang_period", { period_from: "2026-10-01", period_to: "2026-10-31" }), true);
  assert.equal(ok("saarang_period", { period_from: "2026-10-31", period_to: "2026-10-01" }), false);
});

test("a rules change says which rule, and never empties GST or the sold value", () => {
  assert.equal(ok("saarang_rules", {}), false);
  assert.equal(ok("saarang_rules", { gst_villa: "12" }), true);
  assert.equal(ok("saarang_rules", { test_suffix: "" }), true);
  assert.equal(ok("saarang_rules", { dedupe: false }), true);
  assert.equal(ok("saarang_rules", { gst_plot: "" }), false);
  assert.equal(ok("saarang_rules", { sold_field_plot: "both" }), false);
});

test("a correction or unit names a Zoho unit; a correction may take money off", () => {
  const unit = "SAARANG-PLOT-07";
  assert.equal(
    ok("saarang_correction_add", { unit, stage: "On Sale Deed", delta: "-100000" }),
    true,
  );
  assert.equal(ok("saarang_correction_add", { unit, delta: "-100000" }), true);
  assert.equal(ok("saarang_correction_add", { unit: "PLOT-07", delta: "1" }), false);
  assert.equal(ok("saarang_unit_add", { unit: "SAARANG-PLOT-29", sold_value: "6258387" }), true);
  assert.equal(ok("saarang_unit_add", { unit: "SAARANG-PLOT-29", sold_value: "-1" }), false);
  assert.equal(ok("saarang_excluded_add", { receipt_no: "SAR-1", reason: "Refunded" }), true);
});

test("a removal names its rule by id", () => {
  assert.equal(ok("saarang_excluded_remove", { rule_id: ID }), true);
  assert.equal(ok("saarang_correction_remove", { rule_id: "SAARANG-PLOT-07" }), false);
  assert.equal(ok("saarang_unit_remove", { rule_id: ID }), true);
});
