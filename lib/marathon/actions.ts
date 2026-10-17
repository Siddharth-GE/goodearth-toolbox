"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearMarathonSession,
  createAdminSession,
  createAgentSession,
  hashPin,
  requireAdminSession,
  requireAgentSession,
  verifyAdminPin,
  verifyPinHash,
} from "@/lib/marathon/session";
import {
  ADMIN_TARGET,
  checkLockout,
  clearFailures,
  recordFailure,
} from "@/lib/marathon/rate-limit";
import { redirect } from "next/navigation";

export type PinState = { error?: string } | undefined;

export async function verifyAgentPin(
  agentId: string,
  _state: PinState,
  formData: FormData,
): Promise<PinState> {
  const pin = String(formData.get("pin") ?? "").trim();
  if (!pin) return { error: "Enter your PIN." };

  // Before the PIN is looked at, so someone trying all 10,000 PINs learns nothing while locked out.
  const locked = await checkLockout(agentId);
  if (locked) return locked;

  const supabase = createAdminClient();
  const { data: agent, error: agentError } = await supabase
    .from("marathon_agents")
    .select("id, pin_hash, pin_salt")
    .eq("id", agentId)
    .maybeSingle();
  if (agentError) {
    console.error("agent PIN check read failed:", agentError);
    return { error: "Could not check that PIN. Try again." };
  }

  if (!agent || !verifyPinHash(pin, agent.pin_hash, agent.pin_salt)) {
    return (await recordFailure(agentId)) ?? { error: "Wrong PIN. Try again." };
  }

  await clearFailures(agentId);
  await createAgentSession(agent.id);
  redirect("/marathon/entry");
}

export async function agentLogout() {
  await clearMarathonSession();
  redirect("/marathon");
}

export async function verifyAdminPinAction(
  _state: PinState,
  formData: FormData,
): Promise<PinState> {
  const pin = String(formData.get("pin") ?? "").trim();
  if (!pin) return { error: "Enter the admin PIN." };

  // The shared admin PIN opens every screen, so it matters more than any agent's.
  const locked = await checkLockout(ADMIN_TARGET);
  if (locked) return locked;

  if (!(await verifyAdminPin(pin))) {
    return (await recordFailure(ADMIN_TARGET)) ?? { error: "Wrong PIN. Try again." };
  }

  await clearFailures(ADMIN_TARGET);
  await createAdminSession();
  redirect("/marathon/admin/entries");
}

export async function adminLogout() {
  await clearMarathonSession();
  redirect("/marathon");
}

export type CreateAgentState = { error?: string } | undefined;

export async function createAgent(
  _state: CreateAgentState,
  formData: FormData,
): Promise<CreateAgentState> {
  await requireAdminSession();

  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!name) return { error: "Enter a name." };
  if (!/^[0-9]{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits." };

  const { hash, salt } = hashPin(pin);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("marathon_agents")
    .insert({ name, pin_hash: hash, pin_salt: salt });

  if (error) {
    console.error("createAgent failed:", error);
    return { error: "Could not add member. Try again." };
  }

  redirect("/marathon/admin/members");
}

export type CreateGroupState = { error?: string } | undefined;

export async function createGroup(
  _state: CreateGroupState,
  formData: FormData,
): Promise<CreateGroupState> {
  await requireAdminSession();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a group name." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("marathon_groups").insert({ name });

  if (error) {
    if (error.code === "23505") return { error: "A group with this name already exists." };
    console.error("createGroup failed:", error);
    return { error: "Could not add group. Try again." };
  }

  redirect("/marathon/admin/groups");
}

// The PINs seeded by 0002 are public, so the app must be able to change them.

export type PinChangeState = { error?: string; done?: string } | undefined;

const PIN_RULE = /^[0-9]{4,6}$/;

export async function changeAdminPin(
  _state: PinChangeState,
  formData: FormData,
): Promise<PinChangeState> {
  await requireAdminSession();

  const current = String(formData.get("currentPin") ?? "").trim();
  const next = String(formData.get("newPin") ?? "").trim();
  const confirm = String(formData.get("confirmPin") ?? "").trim();

  // Asked for even though the session proves admin: an unlocked kiosk left on a table is the real threat.
  if (!(await verifyAdminPin(current))) return { error: "That isn't the current admin PIN." };
  if (!PIN_RULE.test(next)) return { error: "New PIN must be 4 to 6 digits." };
  if (next !== confirm) return { error: "The two new PINs don't match." };
  if (next === current) return { error: "That's already the PIN." };

  const { hash, salt } = hashPin(next);
  const supabase = createAdminClient();
  const { data: config, error: configError } = await supabase
    .from("marathon_config")
    .select("id")
    .maybeSingle();
  if (configError) console.error("admin PIN change config read failed:", configError);
  if (!config) return { error: "Could not read the event settings. Try again." };

  const { error } = await supabase
    .from("marathon_config")
    .update({ admin_pin_hash: hash, admin_pin_salt: salt })
    .eq("id", config.id);

  if (error) {
    console.error("changeAdminPin failed:", error);
    return { error: "Could not change the PIN. Try again." };
  }

  return { done: "Admin PIN changed." };
}

export async function resetAgentPin(
  agentId: string,
  _state: PinChangeState,
  formData: FormData,
): Promise<PinChangeState> {
  await requireAdminSession();

  const next = String(formData.get("newPin") ?? "").trim();
  if (!PIN_RULE.test(next)) return { error: "PIN must be 4 to 6 digits." };

  const { hash, salt } = hashPin(next);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("marathon_agents")
    .update({ pin_hash: hash, pin_salt: salt })
    .eq("id", agentId);

  if (error) {
    console.error("resetAgentPin failed:", error);
    return { error: "Could not reset the PIN. Try again." };
  }

  // A locked-out agent has likely forgotten their PIN: a reset lets them straight back in.
  await clearFailures(agentId);
  return { done: "PIN reset." };
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
  if (!Number.isInteger(age) || age < 3 || age > 99)
    return { error: "Enter an age between 3 and 99." };
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

  // marathon_create_entry returns one composite row, not an array.
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
