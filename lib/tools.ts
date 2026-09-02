import {
  Boxes,
  Calculator,
  ClipboardList,
  DraftingCompass,
  FileChartColumn,
  Footprints,
  GraduationCap,
  Handshake,
  HardHat,
  Landmark,
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
  Calculator,
  ClipboardList,
  DraftingCompass,
  FileChartColumn,
  Footprints,
  GraduationCap,
  Handshake,
  HardHat,
  Landmark,
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
  /**
   * Shown in AMBER beside this tool's checkbox everywhere it can be
   * granted (a person's page, the role editor). For the one grant whose
   * consequence is easy to under-imagine — the founder's requirement
   * that Settings says it out loud, next to the tick, not in a doc.
   */
  grantWarning?: string;
  /**
   * Renders the shared catalogue picker or margins browser, so this grant
   * must reach /api/catalogue. The route derives its allow-list from this
   * flag: a tool that adopts the picker without setting it fails as an
   * unparseable fetch inside the dialog, not as a friendly refusal — the
   * way /inventory once did, when the route kept a hand list.
   */
  catalogue?: true;
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
    name: "Estimator",
    description: "Cost a villa from its works: materials, mixes and labour.",
    href: "/estimator",
    icon: "Calculator",
    group: "Operations",
    built: true,
  },
  {
    name: "Supervisors",
    description: "Log site labour and request materials, villa by villa.",
    href: "/supervisors",
    icon: "HardHat",
    group: "Operations",
    built: true,
    catalogue: true,
  },
  {
    name: "Selections",
    description: "Specify what goes into every space of a unit.",
    href: "/selections",
    icon: "Palette",
    group: "Operations",
    built: true,
    catalogue: true,
  },
  {
    name: "Budgets",
    description: "Price an issued design revision, space by space.",
    href: "/budgets",
    icon: "PiggyBank",
    group: "Operations",
    built: true,
    catalogue: true,
  },
  {
    name: "Indents",
    description: "Site teams request materials, tagged to project/plot.",
    href: "/indents",
    icon: "ClipboardList",
    group: "Operations",
    built: true,
    catalogue: true,
  },
  {
    name: "Purchase Orders",
    description: "Created from indent lines, split by vendor.",
    href: "/purchase-orders",
    icon: "ShoppingCart",
    group: "Operations",
    built: true,
    catalogue: true,
  },
  {
    name: "Inventory",
    description: "Goods receipt against POs, stock by store, issues out.",
    href: "/inventory",
    icon: "Warehouse",
    group: "Operations",
    built: true,
    catalogue: true,
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
    name: "Marathon",
    description: "Register runners and manage bib numbers on race day.",
    href: "/marathon",
    icon: "Footprints",
    group: "Events",
    built: true,
  },
  {
    name: "Directory",
    description: "Everyone who works here, and how to reach them.",
    href: "/directory",
    icon: "Users",
    group: "People",
    built: true,
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
    catalogue: true,
  },
  {
    name: "Settings",
    description: "Manage which apps each person can access.",
    href: "/settings",
    icon: "Settings",
    group: "Admin",
    built: true,
  },
  // Relay replaced both the planned Design Management AND
  // project-management layers when it shipped — but 2026-08-22 revived
  // Design Management to hold the artefacts Relay deliberately refuses
  // to store. The boundary now: Relay keeps accountability (who is
  // holding the baton); Design Management holds the artefacts
  // themselves (the drawings). Both slugs stay legal in the database
  // CHECKs (0036 §1 says why).
  {
    name: "Relay",
    description: "Who is holding each task, and for how long.",
    href: "/relay",
    icon: "Route",
    group: "Management",
    built: true,
  },
  {
    name: "Design Management",
    description:
      "Drawing sets and their revisions for each villa, and the transmittals that send them to site.",
    href: "/design-management",
    icon: "DraftingCompass",
    group: "Management",
    built: true,
  },
  {
    name: "Reporter",
    description: "Build a report over any data — chart it, save it, download it.",
    href: "/reporter",
    icon: "FileChartColumn",
    group: "Management",
    built: true,
    // The founder's decision (Reporter PLAN.md, decisions 3 and 4;
    // policies widened by 0055) and the copy that decision requires.
    grantWarning:
      "Shows all money: every vendor rate, every bill amount, and the margin on every quoted line.",
  },
  {
    name: "Client Relations",
    description: "Every client and plot, from first visit to the last payment.",
    href: "/client-relations",
    icon: "Handshake",
    group: "Management",
    built: true,
  },
  {
    name: "Financial Management",
    description: "Cash flow, receivables and spending across the company.",
    href: "/financial-management",
    icon: "Landmark",
    group: "Management",
    built: true,
    // The founder's decision (Financial Management PLAN.md; views
    // restated by 0058) and the copy that decision requires.
    grantWarning:
      "Shows the company's full money picture: every client's dues and receipts, every bill's amount, and every loan and investor with its terms.",
  },
  {
    name: "Business Planning",
    description: "Model a project before you build it — line by line, to profit and funding.",
    href: "/business-planning",
    icon: "Target",
    group: "Management",
    built: true,
  },
];

// Tools a user can actually be granted (Settings manages access, so it
// isn't itself grantable — only reachable via the admin bypass).
export const GRANTABLE_TOOLS = TOOLS.filter((tool) => tool.href !== "/settings");

// The grants that may search the catalogue — see Tool.catalogue.
export const CATALOGUE_TOOLS = TOOLS.filter((tool) => tool.catalogue).map((tool) => tool.href);

export function visibleTools(profile: { role: string } | null, grantedApps: string[]) {
  if (!profile) return [];
  if (profile.role === "admin") return TOOLS;
  return TOOLS.filter((tool) => grantedApps.includes(tool.href));
}
