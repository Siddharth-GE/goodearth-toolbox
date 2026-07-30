import {
  Boxes,
  ClipboardList,
  Footprints,
  GraduationCap,
  type LucideIcon,
  PiggyBank,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react";

// Icon references can't cross the Server->Client Component boundary
// directly (React can only serialize plain data as props, not function/
// component references) — Sidebar is a Client Component, so Tool.icon
// stores a lookup key instead, resolved against this map wherever it's
// actually rendered.
export const TOOL_ICONS = {
  Boxes,
  ClipboardList,
  Footprints,
  GraduationCap,
  PiggyBank,
  Receipt,
  Settings: SettingsIcon,
  ShoppingCart,
  Users,
  Warehouse,
} satisfies Record<string, LucideIcon>;

export type ToolGroup = "Operations" | "Events" | "People" | "Admin";

export type Tool = {
  name: string;
  description: string;
  href: string;
  team: string;
  icon: keyof typeof TOOL_ICONS;
  group: ToolGroup;
  // false = the sidebar still links to it, but the route renders the
  // shared ComingSoon stub (app/(dashboard)/_components/coming-soon.tsx)
  // instead of a real tool.
  built: boolean;
};

// A tool is visible to admins, and to staff on the matching team.
// Add an entry here as each tool ships. "Overview" (/) isn't in this
// list — it's not team-gated, every signed-in user sees it, so the
// Sidebar renders it as a pinned item directly.
export const TOOLS: Tool[] = [
  {
    name: "Indents",
    description: "Site teams request materials, tagged to project/plot.",
    href: "/indents",
    team: "indents",
    icon: "ClipboardList",
    group: "Operations",
    built: false,
  },
  {
    name: "Purchase Orders",
    description: "Created from indent lines, split by vendor.",
    href: "/purchase-orders",
    team: "purchase-orders",
    icon: "ShoppingCart",
    group: "Operations",
    built: false,
  },
  {
    name: "Inventory",
    description: "Goods receipt, stock by store, issue to manufacturing.",
    href: "/inventory",
    team: "inventory",
    icon: "Warehouse",
    group: "Operations",
    built: false,
  },
  {
    name: "Bills",
    description: "Recording against POs and labour contracts.",
    href: "/bills",
    team: "bills",
    icon: "Receipt",
    group: "Operations",
    built: false,
  },
  {
    name: "Budgets",
    description: "Budget vs actual per project.",
    href: "/budgets",
    team: "budgets",
    icon: "PiggyBank",
    group: "Operations",
    built: false,
  },
  {
    name: "Marathon",
    description: "Register runners and manage bib numbers on race day.",
    href: "/marathon",
    team: "marathon",
    icon: "Footprints",
    group: "Events",
    built: true,
  },
  {
    name: "Directory",
    description: "Staff and contractor directory.",
    href: "/directory",
    team: "directory",
    icon: "Users",
    group: "People",
    built: false,
  },
  {
    name: "Training",
    description: "Assigned courses and completion tracking.",
    href: "/training",
    team: "training",
    icon: "GraduationCap",
    group: "People",
    built: false,
  },
  {
    name: "Projects & Masters",
    description: "Projects, plots, items, vendors, stores.",
    href: "/masters",
    team: "admin",
    icon: "Boxes",
    group: "Admin",
    built: false,
  },
  {
    name: "Settings",
    description: "Platform settings.",
    href: "/settings",
    team: "admin",
    icon: "Settings",
    group: "Admin",
    built: false,
  },
];

export function visibleTools(profile: { role: string; team: string | null } | null) {
  if (!profile) return [];
  if (profile.role === "admin") return TOOLS;
  return TOOLS.filter((tool) => tool.team === profile.team);
}
