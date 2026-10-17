import type { Tool } from "@/lib/tools";

/**
 * Teams arrange; grants decide: nothing here says who may open what (0114).
 * Pure, so the client sidebar and the tests can use it.
 */

export type ToolTeam = { id: string; name: string };

export type ToolArrangement = {
  teams: ToolTeam[];
  teamOf: Record<string, string>;
};

export type ToolSection = { key: string; name: string; tools: Tool[] };

/** A tool with no team sits here, always last, so it never vanishes from the sidebar. */
export const OTHER_SECTION = { key: "other", name: "Other" } as const;

/** No teams at all: every tool under Other — the sidebar's fallback when the read fails. */
export const NO_ARRANGEMENT: ToolArrangement = { teams: [], teamOf: {} };

/** Teams in order, Other last; tools keep lib/tools.ts order inside a team. A team with none of `tools` is left out. */
export function arrangeTools(tools: Tool[], arrangement: ToolArrangement): ToolSection[] {
  const sections: ToolSection[] = arrangement.teams.map((team) => ({
    key: team.id,
    name: team.name,
    tools: [],
  }));
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const other: ToolSection = { ...OTHER_SECTION, tools: [] };

  for (const tool of tools) {
    const teamId = arrangement.teamOf[tool.href];
    (byKey.get(teamId) ?? other).tools.push(tool);
  }

  return [...sections, other].filter((section) => section.tools.length > 0);
}

/** The one rule for "you are here". */
export function isInTool(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The key of the section holding the page at `pathname`, or null (the home page). */
export function sectionKeyOf(sections: ToolSection[], pathname: string): string | null {
  const section = sections.find((s) => s.tools.some((tool) => isInTool(tool.href, pathname)));
  return section?.key ?? null;
}
