"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "projects", href: "/masters/projects", label: "Projects" },
  { key: "plots", href: "/masters/plots", label: "Plots" },
  { key: "units", href: "/masters/units", label: "Units" },
  { key: "clients", href: "/masters/clients", label: "Clients" },
  { key: "vendors", href: "/masters/vendors", label: "Vendors" },
  { key: "stores", href: "/masters/stores", label: "Stores" },
  { key: "items", href: "/masters/items", label: "Items" },
  { key: "categories", href: "/masters/categories", label: "Categories & Brands" },
] as const;

export function MastersNav() {
  const pathname = usePathname();
  const active = TABS.find((tab) => pathname.startsWith(tab.href))?.key ?? "projects";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
