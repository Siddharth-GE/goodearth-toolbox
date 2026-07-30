export type Tool = {
  name: string;
  href: string;
  team: string;
};

// A tool is visible to admins, and to staff on the matching team.
// Add an entry here as each tool ships.
export const TOOLS: Tool[] = [{ name: "Marathon", href: "/marathon", team: "marathon" }];

export function visibleTools(profile: { role: string; team: string | null } | null) {
  if (!profile) return [];
  if (profile.role === "admin") return TOOLS;
  return TOOLS.filter((tool) => tool.team === profile.team);
}
