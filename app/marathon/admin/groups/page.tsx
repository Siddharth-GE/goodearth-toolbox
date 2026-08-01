import { EmptyState } from "@/components/ui/empty-state";
import { getAdminGroups } from "@/lib/marathon/queries";
import { requireAdminSession } from "@/lib/marathon/session";
import { Building2 } from "lucide-react";
import { AddGroupForm } from "../_components/add-group-form";
import { AdminNav } from "../_components/admin-nav";

export default async function MarathonAdminGroupsPage() {
  await requireAdminSession();
  const groups = await getAdminGroups();

  return (
    <div>
      <AdminNav active="groups" />

      <div className="px-5 pt-5 pb-16">
        <h1 className="text-foreground mb-1 text-lg font-bold">Groups</h1>
        <p className="text-muted mb-5 text-sm">
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </p>

        <div className="mb-5 space-y-2">
          {groups.map((group) => (
            <div key={group.id} className="border-border bg-surface rounded-2xl border px-3.5 py-3">
              <span className="text-foreground font-medium">{group.name}</span>
            </div>
          ))}
          {groups.length === 0 && <EmptyState icon={Building2} title="No groups yet" />}
        </div>

        <AddGroupForm />
      </div>
    </div>
  );
}
