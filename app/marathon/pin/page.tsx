import { Avatar } from "@/components/ui/avatar";
import { verifyAgentPin } from "@/lib/marathon/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft } from "lucide-react";
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
  const { data: agent, error } = await supabase
    .from("marathon_agents")
    .select("id, name")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    console.error("marathon pin page read failed:", error);
    throw new Error("Could not load that agent.");
  }

  if (!agent) notFound();

  return (
    <div className="px-7 py-14 text-center">
      <div className="flex justify-center">
        <Avatar name={agent.name} size={64} />
      </div>
      <h1 className="text-foreground mt-4 text-xl font-bold">{agent.name}</h1>
      <p className="text-muted mt-1 text-sm">Enter your PIN</p>

      <PinPad action={verifyAgentPin.bind(null, agent.id)} />

      <Link
        href="/marathon"
        className="text-accent mt-6 inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
    </div>
  );
}
