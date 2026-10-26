"use server";

// Type-only import, never re-exported from a "use server" file (check:actions enforces it).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { siteReceiptProblem } from "./site-receipt";

/** The site's confirmation (0135) is Supervisors' own append-only record pointing at Inventory's issue or delivery — no
 * write reaches Inventory's tables. The header and lines are two inserts, so a confirmation whose lines did not all land
 * is finished by the next press rather than refused. The guards check the document, the line and the quantity sent. */

export type SiteReceiptInput = {
  kind: "issue" | "receipt";
  id: string;
  received: Record<string, number | null>;
  note: string | null;
};

export async function confirmSiteReceipt(input: SiteReceiptInput): Promise<ActionState> {
  const user = await requireTool("/supervisors");
  if (!input.id) return { error: "Which delivery?" };
  if ((input.note ?? "").length > 2000) return { error: "Keep the note under 2000 characters." };
  const isIssue = input.kind === "issue";

  const supabase = await createClient();
  const { data: sent, error: sentError } = isIssue
    ? await supabase.from("stock_issue_lines").select("id, quantity").eq("issue_id", input.id)
    : await supabase.from("goods_receipt_lines").select("id, quantity").eq("receipt_id", input.id);
  if (sentError) {
    console.error("confirmSiteReceipt read failed:", sentError);
    return { error: "Could not read what was sent. Try again." };
  }
  const lines = (sent ?? []).map((line) => ({
    lineId: line.id,
    sent: line.quantity,
    received: input.received[line.id] ?? null,
  }));
  const problem = siteReceiptProblem(lines, input.note);
  if (problem) return { error: problem };

  const { data: existing, error: existingError } = await supabase
    .from("site_receipt_confirmations")
    .select("id")
    .eq(isIssue ? "issue_id" : "receipt_id", input.id)
    .maybeSingle();
  if (existingError) {
    console.error("confirmSiteReceipt lookup failed:", existingError);
    return { error: "Could not confirm. Try again." };
  }

  let confirmationId = existing?.id;
  let done = new Set<string>();
  if (confirmationId) {
    const { data: landed, error: landedError } = await supabase
      .from("site_receipt_confirmation_lines")
      .select("issue_line_id, receipt_line_id")
      .eq("confirmation_id", confirmationId);
    if (landedError) {
      console.error("confirmSiteReceipt lines lookup failed:", landedError);
      return { error: "Could not confirm. Try again." };
    }
    done = new Set((landed ?? []).map((line) => line.issue_line_id ?? line.receipt_line_id ?? ""));
    if (lines.every((line) => done.has(line.lineId))) {
      return { error: "This has already been confirmed." };
    }
  } else {
    const { data: created, error } = await supabase
      .from("site_receipt_confirmations")
      .insert({
        issue_id: isIssue ? input.id : null,
        receipt_id: isIssue ? null : input.id,
        note: input.note?.trim() || null,
        confirmed_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("confirmSiteReceipt failed:", error);
      return {
        error: error
          ? dbErrorMessage(error, "Could not confirm. Try again.", ["Only", "signed by"])
          : "Could not confirm. Try again.",
      };
    }
    confirmationId = created.id;
  }

  const missing = lines.filter((line) => !done.has(line.lineId));
  const { error: linesError } = await supabase.from("site_receipt_confirmation_lines").insert(
    missing.map((line) => ({
      confirmation_id: confirmationId,
      issue_line_id: isIssue ? line.lineId : null,
      receipt_line_id: isIssue ? null : line.lineId,
      received_quantity: line.received ?? 0,
    })),
  );
  if (linesError) {
    console.error("confirmSiteReceipt lines failed:", linesError);
    return {
      error: dbErrorMessage(
        linesError,
        "Some lines did not save — press Confirm again to finish.",
        ["More than was sent", "not on the issue"],
      ),
    };
  }

  revalidatePath("/supervisors", "layout");
  revalidatePath("/inventory", "layout");
  return undefined;
}
