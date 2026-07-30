import { getAdminGroups } from "@/lib/marathon/queries";
import { requireAdminSession } from "@/lib/marathon/session";
import { AddGroupForm } from "../_components/add-group-form";
import { AdminNav } from "../_components/admin-nav";

export default async function MarathonAdminGroupsPage() {
  await requireAdminSession();
  const groups = await getAdminGroups();

  return (
    <div className="px-5 pt-8 pb-16">
      <AdminNav active="groups" />

      <h1 className="mb-1 text-lg font-bold text-foreground">Groups</h1>
      <p className="mb-5 text-sm text-muted">{groups.length} group{groups.length === 1 ? "" : "s"}</p>

      <div className="mb-5 space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="rounded-2xl border border-border bg-surface px-3.5 py-3">
            <span className="font-medium text-foreground">{group.name}</span>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-muted">No groups yet.</p>}
      </div>

      <AddGroupForm />
    </div>
  );
}
