import { Avatar } from "@/components/ui/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PinPad } from "../_components/pin-pad";

export default async function MarathonPinPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentId } = await searchParams;
  if (!agentId) notFound();

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("marathon_agents")
    .select("id, name")
    .eq("id", agentId)
    .single();

  if (!agent) notFound();

  return (
    <div className="px-7 py-14 text-center">
      <div className="flex justify-center">
        <Avatar name={agent.name} size={64} />
      </div>
      <h1 className="mt-4 text-xl font-bold text-foreground">{agent.name}</h1>
      <p className="mt-1 text-sm text-muted">Enter your PIN</p>

      <PinPad agentId={agent.id} />

      <Link href="/marathon" className="mt-6 inline-block text-sm font-medium text-accent">
        Back
      </Link>
    </div>
  );
}
