import { ToolNav } from "@/components/ui/tool-nav";

/** NavTabs, not Radix Tabs: these are separate routes. The Departments tab is hidden for non-admins, but that is cosmetic; /directory/departments calls requireAdmin. */
const TABS = [
  { key: "people", href: "/directory/people", label: "People" },
  { key: "birthdays", href: "/directory/birthdays", label: "Birthdays" },
  { key: "me", href: "/directory/me", label: "My details" },
] as const;

const DEPARTMENTS = { key: "departments", href: "/directory/departments", label: "Departments" };

export function DirectoryNav({ isAdmin }: { isAdmin: boolean }) {
  const tabs = isAdmin ? [...TABS, DEPARTMENTS] : [...TABS];
  // Everything else (including a person's page) belongs to People unless a longer href matches.
  return <ToolNav root="/directory" tabs={tabs} defaultKey="people" />;
}
