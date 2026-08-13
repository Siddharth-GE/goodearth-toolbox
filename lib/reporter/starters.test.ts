/**
 * The one automated gate that catches a registry change silently
 * gutting a starting point: every starter must survive parseReportSpec
 * with ZERO loss. A dropped column or a dropped chart would otherwise
 * show up as a quietly worse report on the landing page.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DATASETS } from "./datasets";
import { getStarter, isStarterId, STARTERS, STARTER_SOURCES } from "./starters";
import { describeSpecLoss, measureId, parseReportSpec } from "./spec";

test("every starter round-trips with nothing left out", () => {
  for (const starter of STARTERS) {
    const source = STARTER_SOURCES[starter.id];
    assert.ok(source, `${starter.id}: no raw spec to check against`);
    assert.deepEqual(
      describeSpecLoss(source),
      [],
      `${starter.id}: the registry no longer supports part of this starter`,
    );
  }
});

test("a starter's spec is stable — parsing it again changes nothing", () => {
  for (const starter of STARTERS) {
    assert.deepEqual(parseReportSpec(starter.spec), starter.spec, starter.id);
  }
});

test("every starter names a real dataset and real fields", () => {
  for (const starter of STARTERS) {
    const dataset = DATASETS[starter.spec.dataset];
    assert.ok(dataset, `${starter.id}: dataset "${starter.spec.dataset}" does not exist`);
    for (const column of starter.spec.columns) {
      assert.ok(dataset.fields[column], `${starter.id}: column "${column}" does not exist`);
    }
    for (const key of starter.spec.groupBy) {
      assert.ok(dataset.fields[key]?.groupable, `${starter.id}: "${key}" is not groupable`);
    }
    for (const measure of starter.spec.measures) {
      assert.ok(
        dataset.fields[measure.field]?.aggregates.includes(measure.agg),
        `${starter.id}: ${measure.field} cannot be ${measure.agg}`,
      );
    }
  }
});

test("every starter's chart is valid for its own grouping", () => {
  for (const starter of STARTERS) {
    const chart = starter.spec.chart;
    if (!chart) continue;
    assert.ok(
      starter.spec.groupBy.includes(chart.category),
      `${starter.id}: the chart's category is not one of its groupings`,
    );
    const ids = starter.spec.measures.map((measure) => measureId(measure));
    for (const measure of chart.measures) {
      assert.ok(
        ids.includes(measure),
        `${starter.id}: chart measure "${measure}" is not a measure`,
      );
    }
    assert.ok(chart.measures.length > 0, `${starter.id}: a chart with no measures`);
  }
});

test("a starter id survives a URL untouched", () => {
  // It is a path segment (`/reporter/<id>`). A colon here read fine to
  // Next's own routing and still 404'd on the deployed preview — the
  // platform in front of the app does not treat it as an ordinary
  // character — so an id that needs any encoding at all is a bug.
  for (const starter of STARTERS) {
    assert.equal(
      encodeURIComponent(starter.id),
      starter.id,
      `${starter.id}: would be re-encoded inside a URL`,
    );
    assert.match(starter.id, /^[a-z0-9-]+$/, `${starter.id}: not a plain URL-safe id`);
  }
});

test("ids are unique, prefixed, and never mistakable for a saved report", () => {
  const seen = new Set<string>();
  for (const starter of STARTERS) {
    assert.ok(isStarterId(starter.id), `${starter.id}: not a starter id`);
    assert.ok(!seen.has(starter.id), `${starter.id}: duplicate id`);
    seen.add(starter.id);
    assert.equal(getStarter(starter.id)?.name, starter.name);
    // A uuid must never resolve to a starter, or a saved report could be
    // shadowed by one.
    assert.doesNotMatch(starter.id, /^[0-9a-f-]{36}$/);
  }
  assert.equal(getStarter("starter-nothing-like-this"), null);
  assert.equal(isStarterId("3f1b6a4e-0000-4000-8000-000000000000"), false);
});

test("every starter says what it is for", () => {
  for (const starter of STARTERS) {
    assert.ok(starter.name.trim().length > 0, `${starter.id}: no name`);
    assert.ok(starter.description.trim().length > 20, `${starter.id}: description too thin`);
  }
});
