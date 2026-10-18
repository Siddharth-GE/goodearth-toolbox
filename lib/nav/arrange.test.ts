/** Teams in order, tools in registry order, no-team tools under Other and never dropped. */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Tool } from "@/lib/tools";

import { arrangeTools, isInTool, NO_ARRANGEMENT, sectionOfPage, teamOfTool } from "./arrange";

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
  assert.equal(teamOfTool(arrangement, "/inventory").ground, "teal");
  assert.equal(teamOfTool(arrangement, "/relay").ground, "ink");
  assert.equal(teamOfTool(NO_ARRANGEMENT, "/indents").ground, "ink");
});

test("each team has its own page address, Other included, and a clash never shares one", () => {
  const clash = {
    teams: [
      { id: "a", name: "Site & Stores" },
      { id: "b", name: "site stores" },
      { id: "c", name: "Other" },
      { id: "d", name: "!!" },
    ],
    teamOf: { "/indents": "a", "/inventory": "b", "/relay": "c", "/dexter": "d" },
  };
  assert.deepEqual(
    arrangeTools([indents, inventory, relay, dexter, fresh], clash).map((s) => s.slug),
    ["site-stores", "site-stores-2", "other-2", "team-4", "other"],
  );
  assert.equal(teamOfTool(clash, "/inventory").slug, "site-stores-2");
  assert.equal(teamOfTool(clash, "/fresh").slug, "other");
});

test("a page belongs to its team page or to a tool inside the team", () => {
  const sections = arrangeTools([indents, inventory, dexter], arrangement);
  assert.equal(sectionOfPage(sections, "/team/site")?.name, "Site");
  assert.equal(sectionOfPage(sections, "/indents/new")?.name, "Site");
  assert.equal(sectionOfPage(sections, "/dexter")?.name, "Design");
  assert.equal(sectionOfPage(sections, "/"), null);
  assert.equal(sectionOfPage(sections, "/team/nowhere"), null);
});
