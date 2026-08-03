"use client";

import { NavTabs } from "@/components/ui/tabs";
import { usePathname } from "next/navigation";

/**
 * The two trees inside Budgets: Interiors (priced revisions, client
 * quotes — the original tool) and Construction (the QS team's stage-wise
 * quantity plans). Rendered on the two list screens only; detail screens
 * keep their back-links instead.
 */
const TABS = [
  { key: "interiors", href: "/budgets", label: "Interiors" },
  { key: "construction", href: "/budgets/construction", label: "Construction" },
] as const;

export function BudgetsNav() {
  const pathname = usePathname();
  const active = pathname.startsWith("/budgets/construction") ? "construction" : "interiors";
  return <NavTabs tabs={[...TABS]} active={active} />;
}
