import { ToolNav } from "@/components/ui/tool-nav";

/**
 * NavTabs rather than Radix Tabs: these are separate routes with their own
 * data and their own loading.tsx, not panels of one page.
 *
 * The Departments tab is hidden for everyone but an admin. That is
 * cosmetic — /directory/departments calls requireAdmin itself, and that
 * call is the boundary.
 */
const TABS = [
  { key: "people", href: "/directory/people", label: "People" },
  { key: "birthdays", href: "/directory/birthdays", label: "Birthdays" },
  { key: "me", href: "/directory/me", label: "My details" },
] as const;

const DEPARTMENTS = { key: "departments", href: "/directory/departments", label: "Departments" };

export function DirectoryNav({ isAdmin }: { isAdmin: boolean }) {
  const tabs = isAdmin ? [...TABS, DEPARTMENTS] : [...TABS];
  // Everything else (including one person's page) belongs to People
  // unless a longer href says otherwise.
  return <ToolNav root="/directory" tabs={tabs} defaultKey="people" />;
}
