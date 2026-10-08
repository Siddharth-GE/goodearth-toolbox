import assert from "node:assert/strict";
import { test } from "node:test";

import { dateParam, idParam, searchParam } from "./list-params";

test("a date param is YYYY-MM-DD or nothing", () => {
  assert.equal(dateParam("2026-10-08"), "2026-10-08");
  assert.equal(dateParam("8/10/2026"), undefined);
  assert.equal(dateParam("2026-10-08');drop"), undefined);
  assert.equal(dateParam(undefined), undefined);
});

test("search text cannot add a PostgREST condition", () => {
  assert.equal(searchParam("Santhosh, K"), "Santhosh K");
  assert.equal(searchParam("a),status.eq.paid,(b"), "a status eq paid b");
  assert.equal(searchParam("100%_*"), "100");
  assert.equal(searchParam("   "), undefined);
  assert.equal(searchParam("x".repeat(200))?.length, 80);
});

test("an id param is a uuid or nothing", () => {
  assert.equal(
    idParam("041b4401-ab9c-4ee5-b6d7-3443f58dbc6a"),
    "041b4401-ab9c-4ee5-b6d7-3443f58dbc6a",
  );
  assert.equal(idParam("all"), undefined);
});
