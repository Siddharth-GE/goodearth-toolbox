import {
  Boxes,
  ClipboardList,
  Footprints,
  GraduationCap,
  Handshake,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Palette,
  PiggyBank,
  Receipt,
  Route,
  Settings as SettingsIcon,
  ShoppingCart,
  Target,
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
  Handshake,
  Landmark,
  LayoutDashboard,
  Palette,
  PiggyBank,
  Receipt,
  Route,
  Settings: SettingsIcon,
  ShoppingCart,
  Target,
  Users,
  Warehouse,
} satisfies Record<string, LucideIcon>;

export type ToolGroup = "Management" | "Operations" | "Events" | "People" | "Admin";

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
    built: true,
  },
  {
    name: "Inventory",
    description: "Goods receipt against POs, stock by store, issues out.",
    href: "/inventory",
    icon: "Warehouse",
    group: "Operations",
    built: true,
  },
  {
    name: "Bills",
    description: "Recording against POs and labour contracts.",
    href: "/bills",
    icon: "Receipt",
    group: "Operations",
    built: true,
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
  // Pusher is the whole design-management AND project-management layer:
  // it replaced both of those planned tools rather than sitting beside
  // them. Their slugs stay in the database CHECKs (0036 §1 says why) but
  // nothing links to them any more.
  {
    name: "Pusher",
    description: "Who is holding each task, and for how long.",
    href: "/pusher",
    icon: "Route",
    group: "Management",
    built: true,
  },
  {
    name: "Dashboard",
    description: "One leadership view across projects, money and people.",
    href: "/management-dashboard",
    icon: "LayoutDashboard",
    group: "Management",
    built: false,
  },
  {
    name: "Client Relations",
    description: "Every client and enquiry, from first visit to handover.",
    href: "/client-relations",
    icon: "Handshake",
    group: "Management",
    built: false,
  },
  {
    name: "Financial Management",
    description: "Cash flow, receivables and spending across the company.",
    href: "/financial-management",
    icon: "Landmark",
    group: "Management",
    built: false,
  },
  {
    name: "Business Planning",
    description: "Targets, forecasts and the year's plan in one place.",
    href: "/business-planning",
    icon: "Target",
    group: "Management",
    built: false,
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
