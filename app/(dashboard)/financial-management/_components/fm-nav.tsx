"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

/**
 * NavTabs rather than Radix Tabs: three separate routes with their own
 * data and their own loading.tsx, not three panels of one page (the
 * CrmNav reasoning).
 */
const TABS = [
  { key: "cash", href: "/financial-management/cash", label: "Cash" },
  { key: "forward", href: "/financial-management/forward", label: "Forward" },
  { key: "funding", href: "/financial-management/funding", label: "Funding" },
] as const;

export function FmNav() {
  const pathname = usePathname();
  // The tool root is the welcome screen, which carries its own doors —
  // showing the tabs above them reads as two competing menus.
  if (pathname === "/financial-management") return null;
  const active = TABS.find((tab) => pathname.startsWith(tab.href))?.key ?? "cash";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
