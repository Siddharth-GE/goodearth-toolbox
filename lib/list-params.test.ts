import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dateParam,
  dayAfter,
  idParam,
  istDayEndExclusive,
  istDayStart,
  searchParam,
} from "./list-params";

test("a date param is YYYY-MM-DD or nothing", () => {
  assert.equal(dateParam("2026-10-08"), "2026-10-08");
  assert.equal(dateParam("8/10/2026"), undefined);
  assert.equal(dateParam("2026-10-08');drop"), undefined);
  assert.equal(dateParam(undefined), undefined);
  assert.equal(dateParam("2026-02-31"), undefined, "not a real day");
  assert.equal(dateParam("2026-13-01"), undefined);
  assert.equal(dateParam("2024-02-29"), "2024-02-29", "a leap day is real");
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

test("the day after steps over month and year ends", () => {
  assert.equal(dayAfter("2026-10-08"), "2026-10-09");
  assert.equal(dayAfter("2026-10-31"), "2026-11-01");
  assert.equal(dayAfter("2026-12-31"), "2027-01-01");
  assert.equal(dayAfter("2024-02-28"), "2024-02-29");
});

test("a timestamp date range runs midnight to midnight, India time", () => {
  assert.equal(istDayStart("2026-10-08"), "2026-10-08T00:00:00+05:30");
  assert.equal(istDayEndExclusive("2026-10-31"), "2026-11-01T00:00:00+05:30");
});
