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
  lockoutMessage,
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

  // Checked before the PIN is even looked at, so somebody working through
  // all 10,000 combinations against this public URL learns nothing from
  // an attempt made while locked out.
  const locked = await checkLockout(agentId);
  if (locked) return { error: lockoutMessage(locked) };

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("marathon_agents")
    .select("id, pin_hash, pin_salt")
    .eq("id", agentId)
    .single();

  if (!agent || !verifyPinHash(pin, agent.pin_hash, agent.pin_salt)) {
    const nowLocked = await recordFailure(agentId);
    return { error: nowLocked ? lockoutMessage(nowLocked) : "Wrong PIN. Try again." };
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

  // The admin PIN is shared and opens every screen, so it matters more
  // than any single agent's.
  const locked = await checkLockout(ADMIN_TARGET);
  if (locked) return { error: lockoutMessage(locked) };

  if (!(await verifyAdminPin(pin))) {
    const nowLocked = await recordFailure(ADMIN_TARGET);
    return { error: nowLocked ? lockoutMessage(nowLocked) : "Wrong PIN. Try again." };
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

// PINs ----------------------------------------------------------------
// Both PINs shipped as seeded defaults in migration 0002 — admin 2026 and
// a test agent on 1234 — and that migration is in version control, on a
// kiosk URL anyone can reach. They have to be changeable from the app;
// asking someone to run SQL to rotate a password is how it never happens.

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

  // Asked for even though the session already proves admin: a kiosk left
  // unlocked on a table is the realistic threat, not a stolen cookie.
  if (!(await verifyAdminPin(current))) return { error: "That isn't the current admin PIN." };
  if (!PIN_RULE.test(next)) return { error: "New PIN must be 4 to 6 digits." };
  if (next !== confirm) return { error: "The two new PINs don't match." };
  if (next === current) return { error: "That's already the PIN." };

  const { hash, salt } = hashPin(next);
  const supabase = createAdminClient();
  const { data: config } = await supabase.from("marathon_config").select("id").single();
  if (!config) return { error: "Could not read the event settings. Try again." };

  const { error } = await supabase
    .from("marathon_config")
    .update({ admin_pin_hash: hash, admin_pin_salt: salt, updated_at: new Date().toISOString() })
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

  // An agent locked out after ten wrong tries has almost certainly
  // forgotten their PIN — resetting it should let them straight back in
  // rather than leaving them waiting out a lockout for a PIN that no
  // longer exists.
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
