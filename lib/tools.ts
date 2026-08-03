import {
  Boxes,
  ClipboardList,
  Footprints,
  GraduationCap,
  type LucideIcon,
  Palette,
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
  Palette,
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
  icon: keyof typeof TOOL_ICONS;
  group: ToolGroup;
  // false = the sidebar still links to it, but the route renders the
  // shared ComingSoon stub (app/(dashboard)/_components/coming-soon.tsx)
  // instead of a real tool.
  built: boolean;
};

// A tool is visible to admins (always, every tool), and to staff who've
// been granted it explicitly — see supabase/migrations/0003_user_apps.sql
// and lib/auth/access.ts. Add an entry here as each tool ships.
// "Overview" (/) isn't in this list — every signed-in user sees it
// regardless of grants, so the Sidebar renders it as a pinned item
// directly. "Settings" is also never grantable — see requireAdmin in
// lib/auth/access.ts.
export const TOOLS: Tool[] = [
  {
    name: "Selections",
    description: "Specify what goes into every space of a unit.",
    href: "/selections",
    icon: "Palette",
    group: "Operations",
    built: true,
  },
  {
    name: "Indents",
    description: "Site teams request materials, tagged to project/plot.",
    href: "/indents",
    icon: "ClipboardList",
    group: "Operations",
    built: true,
  },
  {
    name: "Purchase Orders",
    description: "Created from indent lines, split by vendor.",
    href: "/purchase-orders",
    icon: "ShoppingCart",
    group: "Operations",
    built: false,
  },
  {
    name: "Inventory",
    description: "Goods receipt, stock by store, issue to manufacturing.",
    href: "/inventory",
    icon: "Warehouse",
    group: "Operations",
    built: false,
  },
  {
    name: "Bills",
    description: "Recording against POs and labour contracts.",
    href: "/bills",
    icon: "Receipt",
    group: "Operations",
    built: false,
  },
  {
    name: "Budgets",
    description: "Price an issued design revision, space by space.",
    href: "/budgets",
    icon: "PiggyBank",
    group: "Operations",
    built: true,
  },
  {
    name: "Marathon",
    description: "Register runners and manage bib numbers on race day.",
    href: "/marathon",
    icon: "Footprints",
    group: "Events",
    built: true,
  },
  {
    name: "Directory",
    description: "Staff and contractor directory.",
    href: "/directory",
    icon: "Users",
    group: "People",
    built: false,
  },
  {
    name: "Training",
    description: "Assigned courses and completion tracking.",
    href: "/training",
    icon: "GraduationCap",
    group: "People",
    built: false,
  },
  {
    name: "Projects & Masters",
    description: "Projects, plots, items, vendors, stores.",
    href: "/masters",
    icon: "Boxes",
    group: "Admin",
    built: true,
  },
  {
    name: "Settings",
    description: "Manage which apps each person can access.",
    href: "/settings",
    icon: "Settings",
    group: "Admin",
    built: true,
  },
];

// Tools a user can actually be granted (Settings manages access, so it
// isn't itself grantable — only reachable via the admin bypass).
export const GRANTABLE_TOOLS = TOOLS.filter((tool) => tool.href !== "/settings");

export function visibleTools(profile: { role: string } | null, grantedApps: string[]) {
  if (!profile) return [];
  if (profile.role === "admin") return TOOLS;
  return TOOLS.filter((tool) => grantedApps.includes(tool.href));
}
