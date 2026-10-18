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

/** A team's brand colour, for its sidebar mark and its tools' welcome band. */
export type TeamGround = "burgundy" | "teal" | "olive" | "ochre" | "sage" | "blush" | "ink";

/** By the team's place in Settings → Teams, so everyone sees a team in the same colour; Other is always ink. */
const TEAM_GROUNDS: TeamGround[] = ["burgundy", "teal", "olive", "ochre", "sage", "blush"];
const OTHER_GROUND: TeamGround = "ink";

/** `slug` is the team page's address, /team/<slug>. */
export type ToolSection = {
  key: string;
  name: string;
  slug: string;
  ground: TeamGround;
  tools: Tool[];
};

/** A team's address from its name; a clash or an unsayable name falls back to a numbered one. Other is always "other". */
function teamSlugs(teams: ToolTeam[]): string[] {
  const taken = new Set<string>([OTHER_SECTION.key]);
  return teams.map((team, index) => {
    const base =
      team.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `team-${index + 1}`;
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    return slug;
  });
}

/** A tool with no team sits here, always last, so it never vanishes from the sidebar. */
export const OTHER_SECTION = { key: "other", name: "Other" } as const;

/** No teams at all: every tool under Other — the sidebar's fallback when the read fails. */
export const NO_ARRANGEMENT: ToolArrangement = { teams: [], teamOf: {} };

/** Teams in order, Other last; tools keep lib/tools.ts order inside a team. A team with none of `tools` is left out. */
export function arrangeTools(tools: Tool[], arrangement: ToolArrangement): ToolSection[] {
  const slugs = teamSlugs(arrangement.teams);
  const sections: ToolSection[] = arrangement.teams.map((team, index) => ({
    key: team.id,
    name: team.name,
    slug: slugs[index],
    ground: TEAM_GROUNDS[index % TEAM_GROUNDS.length],
    tools: [],
  }));
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const other: ToolSection = {
    ...OTHER_SECTION,
    slug: OTHER_SECTION.key,
    ground: OTHER_GROUND,
    tools: [],
  };

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

/** The team holding the tool at `href`: its name, page and colour. */
export function teamOfTool(
  arrangement: ToolArrangement,
  href: string,
): Pick<ToolSection, "name" | "slug" | "ground"> {
  const index = arrangement.teams.findIndex((team) => team.id === arrangement.teamOf[href]);
  if (index < 0) return { name: OTHER_SECTION.name, slug: OTHER_SECTION.key, ground: OTHER_GROUND };
  return {
    name: arrangement.teams[index].name,
    slug: teamSlugs(arrangement.teams)[index],
    ground: TEAM_GROUNDS[index % TEAM_GROUNDS.length],
  };
}

/** The section a page belongs to: its team page, or a page inside one of its tools. */
export function sectionOfPage(sections: ToolSection[], pathname: string): ToolSection | null {
  return (
    sections.find(
      (s) =>
        pathname === `/team/${s.slug}` || s.tools.some((tool) => isInTool(tool.href, pathname)),
    ) ?? null
  );
}
