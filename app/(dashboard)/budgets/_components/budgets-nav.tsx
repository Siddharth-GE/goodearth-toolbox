import { ToolNav } from "@/components/ui/tool-nav";

/**
 * The two trees inside Budgets: Interiors (priced revisions, client
 * quotes — the original tool) and Construction (the QS team's stage-wise
 * quantity plans). Rendered on the two list screens only; detail screens
 * keep their back-links instead.
 */
const TABS = [
  { key: "interiors", href: "/budgets/interiors", label: "Interiors" },
  { key: "construction", href: "/budgets/construction", label: "Construction" },
] as const;

export function BudgetsNav() {
  return <ToolNav root="/budgets" tabs={TABS} defaultKey="interiors" />;
}
