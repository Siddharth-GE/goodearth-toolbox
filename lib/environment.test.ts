import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, test } from "node:test";

import { DATABASES, isPracticeSite, PRODUCTION_SITE } from "./environment";

const PRODUCTION_URL = `https://${DATABASES.production}.supabase.co`;
const PRACTICE_URL = `https://${DATABASES.practice}.supabase.co`;

const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = original;
});

test("the production database is the only thing treated as real", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_URL;
  assert.equal(isPracticeSite(), false);
});

test("the practice database is a practice site", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PRACTICE_URL;
  assert.equal(isPracticeSite(), true);
});

// Every mistake someone could make must show the warning, not hide it.
for (const [name, url] of [
  ["a brand new project nobody has classified", "https://abcdefghijklmnopqrst.supabase.co"],
  ["the CI placeholder", "https://placeholder.supabase.co"],
  ["an unset variable", ""],
  ["a truncated ref", `https://${DATABASES.production.slice(0, -4)}.supabase.co`],
] as const) {
  test(`${name} counts as practice`, () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    assert.equal(isPracticeSite(), true);
  });
}

test("an undefined variable does not throw", () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(isPracticeSite(), true);
});

test("the two databases are different, well-formed refs", () => {
  assert.notEqual(DATABASES.production, DATABASES.practice);
  for (const ref of Object.values(DATABASES)) assert.match(ref, /^[a-z]{20}$/);
  assert.match(PRODUCTION_SITE, /^[a-z0-9.-]+\.[a-z]+$/);
});

// npm test runs from the repo root.
const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("CI checks production on PRs into master and practice on PRs into staging", () => {
  const steps = repoFile(".github/workflows/ci.yml")
    .split(/\n\s*- name: /)
    .filter((step) => step.includes("--project "));
  assert.ok(steps.length > 0, "no CI step names a database");
  for (const step of steps) {
    const ref = step.match(/--project (\S+)/)![1];
    const base = step.match(/github\.base_ref == '(\w+)'/)?.[1];
    const expected = base === "master" ? DATABASES.production : DATABASES.practice;
    assert.equal(ref, expected, `CI step "${step.split("\n")[0]}"`);
  }
});

test("package.json's type generators name the same two databases", () => {
  const { scripts } = JSON.parse(repoFile("package.json"));
  assert.match(scripts["db:types"], new RegExp(`--project-id ${DATABASES.production} `));
  assert.match(scripts["db:types:staging"], new RegExp(`--project-id ${DATABASES.practice} `));
});
