import { ToolNav } from "@/components/ui/tool-nav";

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
  // Everything else (including a client's own page) belongs to Clients
  // unless a longer href says otherwise.
  return <ToolNav root="/client-relations" tabs={TABS} defaultKey="clients" />;
}
