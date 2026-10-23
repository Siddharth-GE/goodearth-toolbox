"use server";

// Type-only import, never re-exported from a "use server" file (check:actions enforces it).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isSequenceLink } from "./schedule";

/** Writes to the site sequence (0137). The database refuses a stage that would end up waiting on itself. Every villa's dates
 * follow at once, so each action revalidates the whole tool. */

const GRANT = "/supervisors";
const STEP = 10;

function refresh() {
  revalidatePath("/supervisors", "layout");
}

function wholeOrBlank(text: string, min: number): number | null | "bad" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= min && value <= 999 ? value : "bad";
}

function saveFailed(what: string, error: { code?: string; message: string }): ActionState {
  console.error(`${what} failed:`, error);
  if (error.code === "P0001") return { error: error.message };
  return { error: "Could not save the sequence. Try again." };
}

/** What a stage follows, how, the curing wait after it, and its typical days. */
export async function updateSequenceStage(input: {
  groupId: string;
  followsGroupId: string;
  link: string;
  waitDays: string;
  typicalDays: string;
}): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!input.groupId) return { error: "Which stage?" };
  if (!isSequenceLink(input.link)) return { error: "Pick after or alongside." };
  const wait = wholeOrBlank(input.waitDays, 0);
  if (wait === "bad") return { error: "Wait days is a whole number, 0 or more." };
  const typical = wholeOrBlank(input.typicalDays, 1);
  if (typical === "bad") return { error: "Typical days is a whole number, 1 or more." };
  if (input.followsGroupId === input.groupId) return { error: "A stage can't follow itself." };

  const supabase = await createClient();
  if (input.followsGroupId) {
    const { data: followed, error: followedError } = await supabase
      .from("site_sequence")
      .select("id")
      .eq("work_group_id", input.followsGroupId)
      .maybeSingle();
    if (followedError) return saveFailed("updateSequenceStage read", followedError);
    if (!followed) return { error: "That stage was taken out of the sequence — pick another." };
  }
  const { data, error } = await supabase
    .from("site_sequence")
    .update({
      follows_group_id: input.followsGroupId || null,
      link: input.link,
      wait_days: wait ?? 0,
      typical_days: typical,
      days_to_confirm: false,
      updated_by: user.id,
    })
    .eq("work_group_id", input.groupId)
    .select("id");
  if (error) return saveFailed("updateSequenceStage", error);
  if ((data ?? []).length === 0) return { error: "That stage is no longer in the sequence." };
  refresh();
  return undefined;
}

/** One number typed straight into the list: a stage's typical days or its wait. Typed days are no longer a stand-in. */
export async function setSequenceDays(input: {
  groupId: string;
  field: "typical" | "wait";
  value: string;
}): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!input.groupId) return { error: "Which stage?" };
  const typical = input.field === "typical";
  const value = wholeOrBlank(input.value, typical ? 1 : 0);
  if (value === "bad") {
    return {
      error: typical ? "Days is a whole number, 1 or more." : "Wait is a whole number, 0 or more.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_sequence")
    .update(
      typical
        ? { typical_days: value, days_to_confirm: false, updated_by: user.id }
        : { wait_days: value ?? 0, updated_by: user.id },
    )
    .eq("work_group_id", input.groupId)
    .select("id");
  if (error) return saveFailed("setSequenceDays", error);
  if ((data ?? []).length === 0) return { error: "That stage is no longer in the sequence." };
  refresh();
  return undefined;
}

/** Swaps a stage with its neighbour in the list. The order is how the programme reads; the dates come from what each follows. */
export async function moveSequenceStage(input: {
  groupId: string;
  direction: "up" | "down";
}): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  let list: { work_group_id: string; position: number }[];
  try {
    list = await fetchAll((from, to) =>
      supabase
        .from("site_sequence")
        .select("work_group_id, position")
        .order("position")
        .order("id")
        .range(from, to),
    );
  } catch (thrown) {
    console.error("moveSequenceStage read failed:", thrown);
    return { error: "Could not save the sequence. Try again." };
  }
  const at = list.findIndex((row) => row.work_group_id === input.groupId);
  const other = at + (input.direction === "up" ? -1 : 1);
  if (at === -1 || other < 0 || other >= list.length) return undefined;

  // Renumbered in steps, so two stages never share a position after the swap.
  [list[at], list[other]] = [list[other], list[at]];
  for (const [index, row] of list.entries()) {
    const position = (index + 1) * STEP;
    if (row.position === position) continue;
    const { error: moveError } = await supabase
      .from("site_sequence")
      .update({ position, updated_by: user.id })
      .eq("work_group_id", row.work_group_id);
    if (moveError) return saveFailed("moveSequenceStage", moveError);
  }
  refresh();
  return undefined;
}

/** Adds a work group at the end, after the last stage. */
export async function addSequenceStage(input: { groupId: string }): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!input.groupId) return { error: "Pick a stage to add." };
  const supabase = await createClient();
  const { data: last, error } = await supabase
    .from("site_sequence")
    .select("work_group_id, position")
    .order("position", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return saveFailed("addSequenceStage read", error);
  const { error: insertError } = await supabase.from("site_sequence").insert({
    work_group_id: input.groupId,
    position: (last?.position ?? 0) + STEP,
    follows_group_id: last?.work_group_id ?? null,
    link: "after",
    created_by: user.id,
    updated_by: user.id,
  });
  if (insertError) {
    if (insertError.code === "23505") return { error: "That stage is already in the sequence." };
    return saveFailed("addSequenceStage", insertError);
  }
  refresh();
  return undefined;
}

/** Takes a stage out of the sequence; the stages that followed it follow what it followed. */
export async function removeSequenceStage(input: { groupId: string }): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("site_sequence")
    .select("follows_group_id, link")
    .eq("work_group_id", input.groupId)
    .maybeSingle();
  if (error) return saveFailed("removeSequenceStage read", error);
  if (!row) return undefined;
  const { error: repointError } = await supabase
    .from("site_sequence")
    // Where it would have started: its followers take its place in the chain, after or alongside as it was.
    .update({ follows_group_id: row.follows_group_id, link: row.link, updated_by: user.id })
    .eq("follows_group_id", input.groupId);
  if (repointError) return saveFailed("removeSequenceStage repoint", repointError);
  const { error: deleteError } = await supabase
    .from("site_sequence")
    .delete()
    .eq("work_group_id", input.groupId);
  if (deleteError) return saveFailed("removeSequenceStage", deleteError);
  refresh();
  return undefined;
}

/** The villa size the typical days are for; blank takes the typical days as they are, unscaled. */
export async function setTypicalSqft(input: { sqft: string }): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const trimmed = input.sqft.trim().replace(/,/g, "");
  const sqft = trimmed ? Number(trimmed) : null;
  if (sqft !== null && (!Number.isFinite(sqft) || sqft <= 0)) {
    return { error: "The size is a number of sqft, more than 0." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_schedule_settings")
    .update({ typical_sqft: sqft, updated_by: user.id })
    .eq("singleton", true);
  if (error) return saveFailed("setTypicalSqft", error);
  refresh();
  return undefined;
}
