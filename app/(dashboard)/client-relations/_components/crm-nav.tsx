"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

/**
 * NavTabs rather than Radix Tabs: these are three separate routes with
 * their own data and their own loading.tsx, not three panels of one page.
 */
const TABS = [
  { key: "clients", href: "/client-relations/clients", label: "Clients" },
  { key: "plots", href: "/client-relations/plots", label: "Plots" },
  { key: "dues", href: "/client-relations/dues", label: "Collections" },
] as const;

export function CrmNav() {
  const pathname = usePathname();
  // The tool root is the welcome screen, which carries its own doors —
  // showing the tabs above them reads as two competing menus.
  if (pathname === "/client-relations") return null;
  // Everything else (including a client's own page) belongs to Clients
  // unless a longer href says otherwise.
  const active =
    TABS.find((tab) => pathname.startsWith(tab.href) && tab.key !== "clients")?.key ?? "clients";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
