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
  { key: "stages", href: "/masters/stages", label: "Stages" },
  { key: "works", href: "/masters/works", label: "Works" },
  { key: "gst-rates", href: "/masters/gst-rates", label: "GST Rates" },
  { key: "requests", href: "/masters/requests", label: "Requests" },
] as const;

export function MastersNav() {
  const pathname = usePathname();
  const active = TABS.find((tab) => pathname.startsWith(tab.href))?.key ?? "projects";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
