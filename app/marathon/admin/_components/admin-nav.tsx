import { ExitButton } from "@/app/marathon/_components/exit-button";
import { PageHeader } from "@/components/ui/page-header";
import { NavTabs } from "@/components/ui/tabs";
import { adminLogout } from "@/lib/marathon/actions";

const TABS = [
  { key: "entries", href: "/marathon/admin/entries", label: "Entries" },
  { key: "members", href: "/marathon/admin/members", label: "Members" },
  { key: "groups", href: "/marathon/admin/groups", label: "Groups" },
] as const;

export function AdminNav({ active }: { active: "entries" | "members" | "groups" }) {
  return (
    <PageHeader actions={<ExitButton action={adminLogout} />}>
      <NavTabs tabs={[...TABS]} active={active} />
    </PageHeader>
  );
}
