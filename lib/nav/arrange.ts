import type { Tool } from "@/lib/tools";

/**
 * Teams: the headings tools sit under, in the sidebar, on the home page
 * and in Settings' grant lists. The founder makes and orders them in
 * Settings → Teams (tool_teams / tool_team_apps, 0114). Teams arrange;
 * grants decide — nothing here says who may open what.
 *
 * Pure, so the sidebar (a client component) and the tests can use it.
 */

/** One heading, in the founder's order. */
export type ToolTeam = { id: string; name: string };

/** The teams in order, and the team each tool's href sits under. */
export type ToolArrangement = {
  teams: ToolTeam[];
  teamOf: Record<string, string>;
};

/** A heading with the tools under it — what a screen draws. */
export type ToolSection = { key: string; name: string; tools: Tool[] };

/**
 * Where a tool with no team sits — a tool built since the founder last
 * arranged, or one whose team was deleted. Always last, so a tool can
 * never vanish from the sidebar for want of a team.
 */
export const OTHER_SECTION = { key: "other", name: "Other" } as const;

/** No teams at all: every tool under Other — the sidebar's fallback when the read fails. */
export const NO_ARRANGEMENT: ToolArrangement = { teams: [], teamOf: {} };

/**
 * The tools under their teams, teams in order, Other last. Tools keep
 * their order from lib/tools.ts inside a team (Operations reads in chain
 * order). A team with none of `tools` is left out — pass a person's
 * visible tools and they see only headings they have something under.
 */
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

/** Is `pathname` inside the tool at `href`? The one rule for "you are here". */
export function isInTool(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The key of the section holding the page at `pathname`, or null (the home page). */
export function sectionKeyOf(sections: ToolSection[], pathname: string): string | null {
  const section = sections.find((s) => s.tools.some((tool) => isInTool(tool.href, pathname)));
  return section?.key ?? null;
}
