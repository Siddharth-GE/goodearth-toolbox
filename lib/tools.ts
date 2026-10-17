import {
  Bed,
  BookOpen,
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
  Presentation,
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
  Bed,
  BookOpen,
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
  Presentation,
  Receipt,
  Route,
  Settings: SettingsIcon,
  ShoppingCart,
  Target,
  Users,
  Warehouse,
} satisfies Record<string, LucideIcon>;

// Which heading a tool sits under is not here: the founder arranges
// teams in Settings → Teams (0114, lib/nav/). A new tool appears under
// "Other" until it is given one.
export type Tool = {
  name: string;
  description: string;
  href: string;
  icon: keyof typeof TOOL_ICONS;
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
  /**
   * Each person sees only the work assigned to them; admins and the tool's
   * team leads see everyone's (0122). Settings offers the "Team lead" tick
   * beside exactly these grants. Setting the flag switches nothing on by
   * itself — the tool's own migration says what "assigned" means for its
   * rows and narrows its policies with is_lead() (0123 for Client
   * Relations). SECURITY.md, "Assigned work".
   */
  scoped?: true;
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
    built: true,
  },
  {
    name: "Supervisors",
    description: "Log site labour and request materials, villa by villa.",
    href: "/supervisors",
    icon: "HardHat",
    built: true,
    catalogue: true,
  },
  {
    name: "Selections",
    description: "Specify what goes into every space of a unit.",
    href: "/selections",
    icon: "Palette",
    built: true,
    catalogue: true,
  },
  {
    name: "Budgets",
    description: "Price an issued design revision, space by space.",
    href: "/budgets",
    icon: "PiggyBank",
    built: true,
    catalogue: true,
  },
  {
    name: "Indents",
    description: "Site teams request materials, tagged to project/plot.",
    href: "/indents",
    icon: "ClipboardList",
    built: true,
    catalogue: true,
  },
  {
    name: "Purchase Orders",
    description: "Created from indent lines, split by vendor.",
    href: "/purchase-orders",
    icon: "ShoppingCart",
    built: true,
    // No catalogue flag since 0113: a PO line comes from an indent, never
    // from the picker, so this grant has no reason to reach /api/catalogue.
  },
  {
    name: "Inventory",
    description: "Goods receipt against POs, stock by store, issues out.",
    href: "/inventory",
    icon: "Warehouse",
    built: true,
    catalogue: true,
  },
  {
    name: "Bills",
    description: "Recording against POs and work orders.",
    href: "/bills",
    icon: "Receipt",
    built: true,
  },
  {
    name: "Marathon",
    description: "Register runners and manage bib numbers on race day.",
    href: "/marathon",
    icon: "Footprints",
    built: true,
  },
  {
    name: "Directory",
    description: "Everyone who works here, and how to reach them.",
    href: "/directory",
    icon: "Users",
    built: true,
  },
  {
    name: "Training",
    description: "Assigned courses and completion tracking.",
    href: "/training",
    icon: "GraduationCap",
    built: false,
  },
  {
    name: "Projects & Masters",
    description: "Projects, plots, items, vendors, stores.",
    href: "/masters",
    icon: "Boxes",
    built: true,
    catalogue: true,
  },
  {
    name: "Settings",
    description: "Manage which apps each person can access.",
    href: "/settings",
    icon: "Settings",
    built: true,
  },
  // Relay replaced both the planned Design Management AND
  // project-management layers when it shipped — but 2026-08-22 revived
  // Design Management to hold the artefacts Relay deliberately refuses
  // to store, and since 0125 (founder, 2026-10-17: "build it full forget
  // relay") it also passes each villa from stage to stage, with people
  // and actions. Relay keeps whatever trails are filed in it; nothing
  // links the two. Both slugs stay legal in the database CHECKs (0036 §1
  // says why).
  {
    name: "Relay",
    description: "Who is holding each task, and for how long.",
    href: "/relay",
    icon: "Route",
    built: true,
  },
  {
    name: "Design Management",
    description:
      "Each villa's design from stage to stage, who is on it, and the drawings that go to site.",
    href: "/design-management",
    icon: "DraftingCompass",
    built: true,
  },
  {
    name: "Dexter",
    description: "Client presentations as shareable links — upload an HTML deck, send the link.",
    href: "/dexter",
    icon: "Presentation",
    built: true,
  },
  {
    name: "Reporter",
    description: "Build a report over any data — chart it, save it, download it.",
    href: "/reporter",
    icon: "FileChartColumn",
    built: true,
    // The founder's decision (Reporter PLAN.md, decisions 3 and 4;
    // policies widened by 0055; Birdwing's views by 0117) and the copy
    // that decision requires.
    grantWarning:
      "Shows all money: every vendor rate, every bill amount, the margin on every quoted line, and Birdwing's stays, guests' bills and expenses.",
  },
  {
    name: "Client Relations",
    description: "Every client and plot, from first visit to the last payment.",
    href: "/client-relations",
    icon: "Handshake",
    built: true,
    // Each person sees the plots and actions assigned to them (0123).
    scoped: true,
  },
  {
    name: "Financial Management",
    description: "Cash flow, receivables and spending across the company.",
    href: "/financial-management",
    icon: "Landmark",
    built: true,
    // The founder's decision (Financial Management PLAN.md; views
    // restated by 0058; Birdwing's added by 0117) and the copy that
    // decision requires.
    grantWarning:
      "Shows the company's full money picture: every client's dues and receipts, every bill's amount, every loan and investor with its terms, and Birdwing's takings and spending.",
  },
  {
    name: "Business Planning",
    description: "Model a project before you build it — line by line, to profit and funding.",
    href: "/business-planning",
    icon: "Target",
    built: true,
  },
  // The Hospitality pair (0115, 0116): Birdwing Farmstay's guest house.
  // Two tools because the people differ — the caretaker books and bills,
  // accounts keeps the books. 0115 puts both under a Hospitality team.
  {
    name: "Birdwing Stays",
    description: "Bookings, rooms, invoices and collections at Birdwing Farmstay.",
    href: "/birdwing",
    icon: "Bed",
    built: true,
  },
  {
    name: "Birdwing Books",
    description: "Birdwing's expenses, staff attendance and salaries.",
    href: "/birdwing-books",
    icon: "BookOpen",
    built: true,
    grantWarning: "Shows every Birdwing staff member's salary and pay rule.",
  },
];

// Tools a user can actually be granted (Settings manages access, so it
// isn't itself grantable — only reachable via the admin bypass).
export const GRANTABLE_TOOLS = TOOLS.filter((tool) => tool.href !== "/settings");

// The grants that may search the catalogue — see Tool.catalogue.
export const CATALOGUE_TOOLS = TOOLS.filter((tool) => tool.catalogue).map((tool) => tool.href);

// The grants that can carry a team lead — see Tool.scoped.
export const SCOPED_TOOLS = TOOLS.filter((tool) => tool.scoped).map((tool) => tool.href);

export function visibleTools(profile: { role: string } | null, grantedApps: string[]) {
  if (!profile) return [];
  if (profile.role === "admin") return TOOLS;
  return TOOLS.filter((tool) => grantedApps.includes(tool.href));
}
