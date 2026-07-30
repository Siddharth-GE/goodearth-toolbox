"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearMarathonSession,
  createAgentSession,
  requireAgentSession,
  verifyPinHash,
} from "@/lib/marathon/session";
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

export type EntryState = { error?: string; duplicate?: boolean } | undefined;

const TEE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export async function createEntry(_state: EntryState, formData: FormData): Promise<EntryState> {
  const session = await requireAgentSession();

  const groupId = String(formData.get("group") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const mobile = String(formData.get("mobile") ?? "").trim();
  const age = Number(formData.get("age"));
  const gender = String(formData.get("gender") ?? "");
  const teeSize = String(formData.get("teeSize") ?? "");
  const runId = String(formData.get("run") ?? "");
  const confirmed = formData.get("confirmed") === "1";

  if (!groupId) return { error: "Choose a group." };
  if (!name) return { error: "Enter the runner's name." };
  if (!/^[0-9]{10}$/.test(mobile)) return { error: "Enter a valid 10-digit mobile number." };
  if (!Number.isInteger(age) || age < 3 || age > 99) return { error: "Enter an age between 3 and 99." };
  if (gender !== "male" && gender !== "female") return { error: "Choose a gender." };
  if (!TEE_SIZES.includes(teeSize)) return { error: "Choose a t-shirt size." };
  if (!runId) return { error: "Choose a run type." };

  const supabase = createAdminClient();

  if (!confirmed) {
    const { data: existing } = await supabase
      .from("marathon_entries")
      .select("id")
      .eq("mobile", mobile)
      .limit(1);
    if (existing && existing.length > 0) {
      return { duplicate: true, error: "This mobile number is already registered. Save anyway?" };
    }
  }

  // marathon_create_entry returns a single composite row (not setof), so
  // PostgREST hands it back as one object here, not an array.
  const { data, error } = await supabase.rpc("marathon_create_entry", {
    p_run_id: runId,
    p_group_id: groupId,
    p_agent_id: session.agentId,
    p_name: name,
    p_mobile: mobile,
    p_age: age,
    p_gender: gender,
    p_tee_size: teeSize,
  });

  if (error || !data) {
    console.error("marathon_create_entry failed:", error);
    return { error: "Could not save. Check age, gender, and run type, then try again." };
  }

  redirect(`/marathon/entry?saved=${encodeURIComponent(data.bib)}`);
}
