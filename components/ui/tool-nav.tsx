"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

// The one tab strip every tool shares: NavTabs (real routes), hidden at the tool root because the welcome screen carries its own doors.
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

  // Longest matching href wins, so /directory/people/123 is People even when another tab's href is a prefix.
  const active =
    [...tabs]
      .filter((tab) => pathname.startsWith(tab.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key ??
    defaultKey ??
    tabs[0]?.key;

  return <NavTabs tabs={[...tabs]} active={active} />;
}
