import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const PRODUCTION_URL = "https://pajfrgnkapicdgangjey.supabase.co";
const STAGING_URL = "https://ipstebqawrvhkyntctrv.supabase.co";

const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = original;
});

/**
 * Imported fresh each time: the module reads process.env at call time, but
 * a cached import would still be fine — this keeps the test honest if that
 * ever changes to a module-level constant.
 */
async function isPracticeSite() {
  const environment = await import("./environment");
  return environment.isPracticeSite();
}

test("the production database is the only thing treated as real", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_URL;
  assert.equal(await isPracticeSite(), false);
});

test("staging is a practice site", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = STAGING_URL;
  assert.equal(await isPracticeSite(), true);
});

/**
 * The direction that matters. Every one of these is a mistake somebody
 * could make — a new project, a typo, a variable that never got set, the
 * placeholder CI builds with — and every one of them must show the
 * warning rather than hide it. A banner that fails closed is useless;
 * this one fails loud.
 */
for (const [name, url] of [
  ["a brand new project nobody has classified", "https://abcdefghijklmnopqrst.supabase.co"],
  ["the CI placeholder", "https://placeholder.supabase.co"],
  ["an unset variable", ""],
  ["a truncated ref that merely starts the same", "https://pajfrgnkapicdgang.supabase.co"],
] as const) {
  test(`${name} counts as practice`, async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    assert.equal(await isPracticeSite(), true);
  });
}

test("an undefined variable does not throw", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(await isPracticeSite(), true);
});
