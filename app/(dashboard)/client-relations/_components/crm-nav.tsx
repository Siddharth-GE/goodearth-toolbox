import { ToolNav } from "@/components/ui/tool-nav";

/**
 * NavTabs rather than Radix Tabs: these are separate routes with their own
 * data and their own loading.tsx, not panels of one page. Actions comes
 * first — the Saarang tracker's main screen (root plan.md, seventh piece).
 */
const TABS = [
  { key: "actions", href: "/client-relations/actions", label: "Actions" },
  { key: "plots", href: "/client-relations/plots", label: "Plots" },
  { key: "clients", href: "/client-relations/clients", label: "Clients" },
  { key: "dues", href: "/client-relations/dues", label: "Collections" },
] as const;

export function CrmNav() {
  // Everything else (including a client's own page) belongs to Clients
  // unless a longer href says otherwise.
  return <ToolNav root="/client-relations" tabs={TABS} defaultKey="clients" />;
}
