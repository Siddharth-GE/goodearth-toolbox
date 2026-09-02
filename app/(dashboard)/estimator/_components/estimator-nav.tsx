import { ToolNav } from "@/components/ui/tool-nav";

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
  return <ToolNav root="/estimator" tabs={TABS} defaultKey="estimates" />;
}
