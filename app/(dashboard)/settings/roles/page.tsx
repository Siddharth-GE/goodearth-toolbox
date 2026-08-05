import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { listRoles } from "@/lib/settings/roles";
import { GRANTABLE_TOOLS, type ToolGroup } from "@/lib/tools";
import { ShieldCheck } from "lucide-react";
import { NewRoleDialog } from "../_components/new-role-dialog";
import { RoleCard } from "../_components/role-card";
import { SettingsNav } from "../_components/settings-nav";

const GROUP_ORDER: ToolGroup[] = ["Operations", "Management", "People", "Events", "Admin"];

export default async function SettingsRolesPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const roles = await listRoles();
  const groups = GROUP_ORDER.map((group) => ({
    group,
    tools: GRANTABLE_TOOLS.filter((tool) => tool.group === group),
  })).filter((entry) => entry.tools.length > 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Settings"
        description="Roles bundle a set of apps and approval rights, so a new joiner is set up in one click."
      />
      <SettingsNav active="roles" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-sm">
          Editing a role changes what everyone holding it can open, straight away. Someone can also
          be given extra apps on top of their role — a role only ever adds.
        </p>
        <NewRoleDialog />
      </div>

      {roles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No roles yet"
          description="Create one for a job that more than one person does — Site Engineer, Purchase, Accounts."
        />
      ) : (
        <div className="space-y-4">
          {roles.map((role) => (
            <RoleCard key={role.id} role={role} groups={groups} />
          ))}
        </div>
      )}
    </div>
  );
}
