import { ToolNav } from "@/components/ui/tool-nav";

/** Interiors (priced revisions, client quotes) and Construction (QS stage-wise quantity plans). Shown on the two list screens only. */
const TABS = [
  { key: "interiors", href: "/budgets/interiors", label: "Interiors" },
  { key: "construction", href: "/budgets/construction", label: "Construction" },
] as const;

export function BudgetsNav() {
  return <ToolNav root="/budgets" tabs={TABS} defaultKey="interiors" />;
}
