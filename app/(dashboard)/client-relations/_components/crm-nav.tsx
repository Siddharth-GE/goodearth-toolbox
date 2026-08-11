"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

/**
 * NavTabs rather than Radix Tabs: these are three separate routes with
 * their own data and their own loading.tsx, not three panels of one page.
 */
const TABS = [
  { key: "clients", href: "/client-relations", label: "Clients" },
  { key: "plots", href: "/client-relations/plots", label: "Plots" },
  { key: "dues", href: "/client-relations/dues", label: "Collections" },
] as const;

export function CrmNav() {
  const pathname = usePathname();
  // Longest match first, because every href starts with the Clients one.
  const active =
    [...TABS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((tab) => pathname.startsWith(tab.href))?.key ?? "clients";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
