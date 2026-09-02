"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

// The one tab strip every tool's screens share: NavTabs (real routes
// with their own loading.tsx, not Radix panels of one page), hidden on
// the tool root because the welcome screen there carries its own doors —
// showing the tabs above it would read as two competing menus. Seven
// tools used to each carry a copy of this file; this is the shared one.
export type ToolTab = { key: string; href: string; label: string };

export function ToolNav({
  root,
  tabs,
  defaultKey,
}: {
  root: string;
  tabs: readonly ToolTab[];
  defaultKey?: string;
}) {
  const pathname = usePathname();
  if (pathname === root) return null;

  // Longest matching href wins, so e.g. "/directory/people/123" is People
  // and "/directory/departments" is Departments even when one tab's href
  // is a prefix of the current path and another's is a closer match.
  const active =
    [...tabs]
      .filter((tab) => pathname.startsWith(tab.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key ??
    defaultKey ??
    tabs[0]?.key;

  return <NavTabs tabs={[...tabs]} active={active} />;
}
