"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

/**
 * Four separate routes with their own data and their own loading.tsx,
 * not four panels of one page (the FmNav reasoning). Ordered by how
 * often they are opened, not by how they are set up.
 */
const TABS = [
  { key: "estimates", href: "/estimator/estimates", label: "Estimates" },
  { key: "works", href: "/estimator/works", label: "Works" },
  { key: "mixes", href: "/estimator/mixes", label: "Mixes" },
] as const;

export function EstimatorNav() {
  const pathname = usePathname();
  // The tool root is the welcome screen, which carries its own doors.
  if (pathname === "/estimator") return null;
  const active = TABS.find((tab) => pathname.startsWith(tab.href))?.key ?? "estimates";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
