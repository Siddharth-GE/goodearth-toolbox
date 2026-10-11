"use server";

// Type-only import, and deliberately NOT re-exported (BUGCATCHER #5).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { GRANT, TEXT_LIMIT } from "./shared";

/**
 * The estimator's answer on an indent line outside the estimate (0113):
 * approve it, or refuse it with a reason the indent's approver reads.
 * Written through decide_indent_line() — Indents' table, the cross-tool
 * write SECURITY.md lists — which checks /estimator, that the indent is
 * waiting for approval, and that the line really is outside the estimate.
 * An answer can be changed while the indent waits.
 */
export async function decideIndentLine(input: {
  lineId: string;
  decision: "approved" | "refused";
  note: string;
}): Promise<ActionState> {
  await requireTool(GRANT);

  if (!input.lineId) return { error: "This line is missing its id — reload the page." };
  if (input.decision !== "approved" && input.decision !== "refused") {
    return { error: "Approve the line or refuse it." };
  }
  const note = input.note.trim().slice(0, TEXT_LIMIT);
  if (input.decision === "refused" && !note) {
    return { error: "Say why it is refused — the indent's approver reads this." };
  }

  const supabase = await createClient();
  // The cast papers over the typegen limitation every optional RPC
  // argument meets (the create_indent precedent).
  const { error } = await supabase.rpc("decide_indent_line", {
    p_line_id: input.lineId,
    p_decision: input.decision,
    p_note: (note || null) as unknown as string,
  });
  if (error) {
    console.error("decideIndentLine failed:", error);
    // The function's refusals are written for a person to read.
    return { error: dbErrorMessage(error, "Could not save the answer. Try again.") };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}
