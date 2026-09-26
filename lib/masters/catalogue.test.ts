/**
 * The catalogue search filter, which is a small language the user's own
 * typing gets spliced into. The route used to strip `,` `(` `)` out of the
 * term to stop a second clause being introduced; these tests lock in the
 * quoting that replaced it, because the whole point is that a term full of
 * filter syntax is now DATA rather than something to be removed.
 */
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
  // The dangerous shape: without quoting this would read as an extra
  // clause, chosen by whoever typed the search box.
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
  // `foo\` unescaped would end the value with `\"`, swallowing the quote
  // that was meant to close it.
  const filter = catalogueSearchFilter("foo\\");
  assert.equal(
    filter,
    'name.ilike."%foo\\\\%",code.ilike."%foo\\\\%",description.ilike."%foo\\\\%"',
  );
});

test("the percent wildcards wrap the term, inside the quotes", () => {
  // Quoting protects the reserved characters; ilike still reads % as a
  // wildcard, which is what makes this a search rather than an equality.
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
