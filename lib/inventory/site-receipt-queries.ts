import "server-only";

import { requireTool } from "@/lib/auth/access";
import { profileNames } from "@/lib/masters/names";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

/** What the site said reached it (0135): Supervisors' record, read here for the issue note and delivery note
 * (STATUS.md contract row). Quantities only; Inventory never writes it, and a shortage moves no stock. */

export type SiteConfirmation = {
  confirmedAt: string;
  confirmedByName: string | null;
  note: string | null;
  /** By the issue or delivery line's id. */
  received: Map<string, number>;
};

export async function getSiteConfirmation(
  kind: "issue" | "receipt",
  id: string,
): Promise<SiteConfirmation | null> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const { data: confirmation, error } = await supabase
    .from("site_receipt_confirmations")
    .select("id, note, confirmed_by, confirmed_at")
    .eq(kind === "issue" ? "issue_id" : "receipt_id", id)
    .maybeSingle();
  assertRead("inventory", "the site's confirmation", error);
  if (!confirmation) return null;

  const [{ data: lines, error: linesError }, names] = await Promise.all([
    supabase
      .from("site_receipt_confirmation_lines")
      .select("issue_line_id, receipt_line_id, received_quantity")
      .eq("confirmation_id", confirmation.id),
    profileNames(supabase, [confirmation.confirmed_by]),
  ]);
  assertRead("inventory", "the site's confirmed lines", linesError);

  return {
    confirmedAt: confirmation.confirmed_at,
    confirmedByName: names.get(confirmation.confirmed_by) ?? null,
    note: confirmation.note,
    received: new Map(
      (lines ?? []).map((line) => [
        line.issue_line_id ?? line.receipt_line_id ?? "",
        line.received_quantity,
      ]),
    ),
  };
}
