/** Teams in order, tools in registry order, no-team tools under Other and never dropped. */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Tool } from "@/lib/tools";

import { arrangeTools, isInTool, NO_ARRANGEMENT, sectionKeyOf, teamGroundOf } from "./arrange";

function tool(href: string): Tool {
  return { name: href, description: "", href, icon: "Boxes", built: true };
}

const indents = tool("/indents");
const inventory = tool("/inventory");
const relay = tool("/relay");
const dexter = tool("/dexter");
const fresh = tool("/fresh");

const arrangement = {
  teams: [
    { id: "t-design", name: "Design" },
    { id: "t-site", name: "Site" },
    { id: "t-empty", name: "Empty" },
  ],
  teamOf: {
    "/indents": "t-site",
    "/inventory": "t-site",
    "/dexter": "t-design",
    "/relay": "t-gone",
  },
};

test("teams come in their order, tools in registry order, Other last", () => {
  const sections = arrangeTools([inventory, relay, indents, dexter, fresh], arrangement);
  assert.deepEqual(
    sections.map((s) => [s.name, s.tools.map((t) => t.href)]),
    [
      ["Design", ["/dexter"]],
      ["Site", ["/inventory", "/indents"]],
      ["Other", ["/relay", "/fresh"]],
    ],
  );
});

test("a team with none of the person's tools is not drawn", () => {
  const sections = arrangeTools([indents], arrangement);
  assert.deepEqual(
    sections.map((s) => s.name),
    ["Site"],
  );
});

test("a tool pointing at a team that no longer exists falls to Other, not out", () => {
  const sections = arrangeTools([relay], arrangement);
  assert.deepEqual(
    sections.map((s) => [s.key, s.tools.length]),
    [["other", 1]],
  );
});

test("with no arrangement every tool is under Other — the sidebar's fallback", () => {
  const sections = arrangeTools([indents, relay], NO_ARRANGEMENT);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, "Other");
  assert.equal(sections[0].tools.length, 2);
});

test("nobody's tools, nothing drawn", () => {
  assert.deepEqual(arrangeTools([], arrangement), []);
});

test("a page belongs to its tool, and not to a tool that merely shares a prefix", () => {
  assert.ok(isInTool("/indents", "/indents"));
  assert.ok(isInTool("/indents", "/indents/abc/print"));
  assert.ok(!isInTool("/bills", "/bills-archive"));
});

test("the open section is the one holding the page; the home page opens none", () => {
  const sections = arrangeTools([inventory, indents, dexter], arrangement);
  assert.equal(sectionKeyOf(sections, "/inventory/receipts/1"), "t-site");
  assert.equal(sectionKeyOf(sections, "/dexter"), "t-design");
  assert.equal(sectionKeyOf(sections, "/"), null);
});

test("a team's colour follows its place in the team list, whoever is looking", () => {
  assert.deepEqual(
    arrangeTools([indents, dexter, fresh], arrangement).map((s) => [s.name, s.ground]),
    [
      ["Design", "burgundy"],
      ["Site", "teal"],
      ["Other", "ink"],
    ],
  );
  assert.deepEqual(
    arrangeTools([indents], arrangement).map((s) => s.ground),
    ["teal"],
  );
  assert.equal(teamGroundOf(arrangement, "/inventory"), "teal");
  assert.equal(teamGroundOf(arrangement, "/relay"), "ink");
  assert.equal(teamGroundOf(NO_ARRANGEMENT, "/indents"), "ink");
});
