import { Footprints, type LucideIcon } from "lucide-react";

// Icon references can't cross the Server->Client Component boundary
// directly (React can only serialize plain data as props, not function/
// component references) — Sidebar is a Client Component, so Tool.icon
// stores a lookup key instead, resolved against this map wherever it's
// actually rendered.
export const TOOL_ICONS = { Footprints } satisfies Record<string, LucideIcon>;

export type Tool = {
  name: string;
  description: string;
  href: string;
  team: string;
  icon: keyof typeof TOOL_ICONS;
};

// A tool is visible to admins, and to staff on the matching team.
// Add an entry here as each tool ships.
export const TOOLS: Tool[] = [
  {
    name: "Marathon",
    description: "Register runners and manage bib numbers on race day.",
    href: "/marathon",
    team: "marathon",
    icon: "Footprints",
  },
];

export function visibleTools(profile: { role: string; team: string | null } | null) {
  if (!profile) return [];
  if (profile.role === "admin") return TOOLS;
  return TOOLS.filter((tool) => tool.team === profile.team);
}
