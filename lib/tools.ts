import {
  Banknote,
  Bed,
  BookOpen,
  Boxes,
  Calculator,
  ClipboardList,
  DraftingCompass,
  FileChartColumn,
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

// Icons are stored as a lookup key: component references can't cross the Server to Client boundary.
export const TOOL_ICONS = {
  Banknote,
  Bed,
  BookOpen,
  Boxes,
  Calculator,
  ClipboardList,
  DraftingCompass,
  FileChartColumn,
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

// Teams in Settings (lib/nav/), not this file, decide the sidebar heading; a new tool sits under "Other".
export type Tool = {
  name: string;
  description: string;
  href: string;
  icon: keyof typeof TOOL_ICONS;
  // false: the sidebar links to it but the route renders the shared ComingSoon stub.
  built: boolean;
  /** Shown in amber beside this tool's checkbox wherever it can be granted. */
  grantWarning?: string;
  /** Renders the catalogue picker: /api/catalogue's allow-list is derived from this flag. */
  catalogue?: true;
  /**
   * Each person sees only assigned work; admins and team leads see all (0122). The tool's own migration
   * narrows its policies with is_lead(). SECURITY.md, "Assigned work".
   */
  scoped?: true;
};

// Admins see every tool; staff see what they are granted (lib/auth/access.ts). Overview and Settings are never grantable.
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
    // No catalogue flag: a PO line comes from an indent, never the picker (0113).
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
  // Relay and Design Management both stay legal slugs in the database CHECKs (0036 §1).
  // Design Management also passes each villa from stage to stage (0126).
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
    // Reporter PLAN.md decisions 3 and 4 (policies 0055, Birdwing's views 0117) require this copy.
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
    name: "Saarang Collections",
    description: "The monthly Saarang collection meeting, from the Zoho exports.",
    href: "/saarang-collections",
    icon: "Banknote",
    built: true,
    grantWarning:
      "Shows every Saarang unit's sold value, every receipt and unpaid invoice from Zoho, and the project's expense figures.",
  },
  {
    name: "Financial Management",
    description: "Cash flow, receivables and spending across the company.",
    href: "/financial-management",
    icon: "Landmark",
    built: true,
    // Financial Management PLAN.md (views 0058, Birdwing's 0117) requires this copy.
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
  // The Hospitality pair (0115, 0116): the caretaker books and bills, accounts keeps the books.
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

/**
 * Turing, the admins' assistant: its own row at the top of the sidebar, never in a team and never
 * grantable, so it stays out of TOOLS. lib/turing/ and its routes are still a tool to check:boundaries.
 */
export const TURING = {
  name: "Turing",
  description: "Claude, working inside the toolbox with you.",
  href: "/turing",
} as const;

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
