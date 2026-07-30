import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminAgents } from "@/lib/marathon/queries";
import { requireAdminSession } from "@/lib/marathon/session";
import { Users } from "lucide-react";
import { AddAgentForm } from "../_components/add-agent-form";
import { AdminNav } from "../_components/admin-nav";

export default async function MarathonAdminMembersPage() {
  await requireAdminSession();
  const agents = await getAdminAgents();

  return (
    <div>
      <AdminNav active="members" />

      <div className="px-5 pt-5 pb-16">
        <h1 className="mb-1 text-lg font-bold text-foreground">Members</h1>
        <p className="mb-5 text-sm text-muted">{agents.length} agent{agents.length === 1 ? "" : "s"}</p>

        <div className="mb-5 space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
            >
              <Avatar name={agent.name} size={36} />
              <span className="font-medium text-foreground">{agent.name}</span>
            </div>
          ))}
          {agents.length === 0 && <EmptyState icon={Users} title="No members yet" />}
        </div>

        <AddAgentForm />
      </div>
    </div>
  );
}
