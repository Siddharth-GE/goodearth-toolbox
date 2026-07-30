"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { clearMarathonSession, createAgentSession, verifyPinHash } from "@/lib/marathon/session";
import { redirect } from "next/navigation";

export type PinState = { error?: string } | undefined;

export async function verifyAgentPin(
  agentId: string,
  _state: PinState,
  formData: FormData,
): Promise<PinState> {
  const pin = String(formData.get("pin") ?? "").trim();
  if (!pin) return { error: "Enter your PIN." };

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("marathon_agents")
    .select("id, pin_hash, pin_salt")
    .eq("id", agentId)
    .single();

  if (!agent || !verifyPinHash(pin, agent.pin_hash, agent.pin_salt)) {
    return { error: "Wrong PIN. Try again." };
  }

  await createAgentSession(agent.id);
  redirect("/marathon/entry");
}

export async function agentLogout() {
  await clearMarathonSession();
  redirect("/marathon");
}
