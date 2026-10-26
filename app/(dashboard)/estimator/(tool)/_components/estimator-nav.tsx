import { ToolNav } from "@/components/ui/tool-nav";

/** Separate routes with their own data and loading.tsx, not panels of one page. Ordered by how often they are opened. */
const TABS = [
  { key: "estimates", href: "/estimator/estimates", label: "Estimates" },
  { key: "works", href: "/estimator/works", label: "Rate book" },
  { key: "mixes", href: "/estimator/mixes", label: "Mixes" },
  { key: "site-check", href: "/estimator/site-check", label: "Site check" },
] as const;

export function EstimatorNav() {
  return <ToolNav root="/estimator" tabs={TABS} defaultKey="estimates" />;
}
