import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogueSearchFilter } from "./catalogue";

test("an ordinary term searches name, code and description", () => {
  assert.equal(
    catalogueSearchFilter("basin"),
    'name.ilike."%basin%",code.ilike."%basin%",description.ilike."%basin%"',
  );
});

test("a comma cannot introduce another clause", () => {
  // Without quoting, this would read as an extra clause.
  const filter = catalogueSearchFilter("a,brand_id.not.is.null");
  assert.equal(filter.split('",').length - 1, 2, "only the three clauses this function wrote");
  assert.ok(
    filter.includes('"%a,brand_id.not.is.null%"'),
    "the term survives whole, inside quotes",
  );
});

test("brackets and dots are data, not syntax", () => {
  const filter = catalogueSearchFilter("or(a.eq.1)");
  assert.equal(
    filter,
    'name.ilike."%or(a.eq.1)%",code.ilike."%or(a.eq.1)%",description.ilike."%or(a.eq.1)%"',
  );
});

test("a double quote cannot close the quoting", () => {
  const filter = catalogueSearchFilter('say "hi"');
  assert.equal(
    filter,
    'name.ilike."%say \\"hi\\"%",code.ilike."%say \\"hi\\"%",description.ilike."%say \\"hi\\"%"',
  );
});

test("a backslash is escaped, so it cannot escape the closing quote", () => {
  // `foo\` unescaped would end the value with `\"` and swallow the closing quote.
  const filter = catalogueSearchFilter("foo\\");
  assert.equal(
    filter,
    'name.ilike."%foo\\\\%",code.ilike."%foo\\\\%",description.ilike."%foo\\\\%"',
  );
});

test("the percent wildcards wrap the term, inside the quotes", () => {
  // ilike still reads % as a wildcard inside the quotes.
  assert.ok(catalogueSearchFilter("tap").startsWith('name.ilike."%tap%"'));
});

test("matching brands add exactly one more clause", () => {
  const filter = catalogueSearchFilter("jaquar", ["11111111-1111-1111-1111-111111111111"]);
  assert.equal(
    filter,
    'name.ilike."%jaquar%",code.ilike."%jaquar%",description.ilike."%jaquar%",' +
      'brand_id.in.("11111111-1111-1111-1111-111111111111")',
  );
});

test("several brand ids stay inside the one in(...) list", () => {
  const filter = catalogueSearchFilter("x", ["aaa", "bbb"]);
  assert.ok(filter.endsWith('brand_id.in.("aaa","bbb")'));
});

test("no brand matches means no brand clause", () => {
  assert.equal(
    catalogueSearchFilter("x", []),
    'name.ilike."%x%",code.ilike."%x%",description.ilike."%x%"',
  );
});
