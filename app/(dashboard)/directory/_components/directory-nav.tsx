"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  // The tool root is the welcome screen, which carries its own doors —
  // showing the tabs above them reads as two competing menus.
  if (pathname === "/directory") return null;

  const tabs = isAdmin ? [...TABS, DEPARTMENTS] : [...TABS];
  // Everything else (including one person's page) belongs to People
  // unless a longer href says otherwise.
  const active =
    tabs.find((tab) => pathname.startsWith(tab.href) && tab.key !== "people")?.key ?? "people";

  return <NavTabs tabs={tabs} active={active} />;
}
