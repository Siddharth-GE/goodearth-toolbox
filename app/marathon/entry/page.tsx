import { agentLogout } from "@/lib/marathon/actions";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function MarathonEntryPage() {
  const session = await requireAgentSession();

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("marathon_agents")
    .select("name")
    .eq("id", session.agentId)
    .single();

  return (
    <div className="px-6 py-14 text-center">
      <h1 className="text-xl font-semibold text-foreground">Signed in as {agent?.name}</h1>
      <p className="mt-2 text-sm text-muted">New runner form coming next.</p>
      <form action={agentLogout} className="mt-6">
        <button type="submit" className="text-sm font-medium text-accent">
          Exit
        </button>
      </form>
    </div>
  );
}
