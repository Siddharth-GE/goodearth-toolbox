import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

/** What reached a villa: its store issues and deliveries straight to site (quantities only, open to every signed-in
 * person, 0023), each with the site's confirmation (0135, Supervisors' own record). The newest few, confirmed or not. */

const GRANT = "/supervisors";
const RECENT = 20;

const fail = (context: string, error: { message: string }): never =>
  readFailed("supervisors", context, error);

export type DeliveryLine = {
  id: string;
  itemName: string;
  uom: string;
  sent: number;
  /** Null until the site confirms. */
  received: number | null;
};

export type VillaDelivery = {
  kind: "issue" | "receipt";
  id: string;
  reference: string;
  on: string;
  /** Issue: the work it was for; delivery: the PO's vendor is not read here. */
  label: string | null;
  lines: DeliveryLine[];
  confirmedAt: string | null;
  confirmedByName: string | null;
  note: string | null;
};

export async function listVillaDeliveries(plotId: string): Promise<VillaDelivery[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [{ data: issues, error: issuesError }, { data: receipts, error: receiptsError }] =
    await Promise.all([
      supabase
        .from("stock_issues")
        .select("id, reference, issued_at, work_items(code, name)")
        .eq("plot_id", plotId)
        .order("issued_at", { ascending: false })
        .order("id")
        .limit(RECENT),
      supabase
        .from("goods_receipts")
        .select("id, reference, received_at, work_items(code, name)")
        .eq("plot_id", plotId)
        .eq("to_site", true)
        .order("received_at", { ascending: false })
        .order("id")
        .limit(RECENT),
    ]);
  if (issuesError) fail("issues to the villa", issuesError);
  if (receiptsError) fail("deliveries to the villa", receiptsError);

  const issueIds = (issues ?? []).map((issue) => issue.id);
  const receiptIds = (receipts ?? []).map((receipt) => receipt.id);

  const [issueLines, receiptLines, confirmations] = await Promise.all([
    issueIds.length
      ? fetchAll((from, to) =>
          supabase
            .from("stock_issue_lines")
            .select("id, issue_id, item_id, quantity, uom")
            .in("issue_id", issueIds)
            .order("created_at")
            .order("id")
            .range(from, to),
        )
      : [],
    receiptIds.length
      ? fetchAll((from, to) =>
          supabase
            .from("goods_receipt_lines")
            .select("id, receipt_id, item_id, quantity, uom")
            .in("receipt_id", receiptIds)
            .order("created_at")
            .order("id")
            .range(from, to),
        )
      : [],
    issueIds.length || receiptIds.length
      ? fetchAll((from, to) =>
          supabase
            .from("site_receipt_confirmations")
            .select("id, issue_id, receipt_id, note, confirmed_by, confirmed_at")
            .or(
              [
                issueIds.length ? `issue_id.in.(${issueIds.join(",")})` : null,
                receiptIds.length ? `receipt_id.in.(${receiptIds.join(",")})` : null,
              ]
                .filter(Boolean)
                .join(","),
            )
            .order("id")
            .range(from, to),
        )
      : [],
  ]);

  const confirmationIds = confirmations.map((confirmation) => confirmation.id);
  const itemIds = [...new Set([...issueLines, ...receiptLines].map((line) => line.item_id))];
  const peopleIds = [...new Set(confirmations.map((confirmation) => confirmation.confirmed_by))];
  const [confirmedLines, { data: items, error: itemsError }, { data: people, error: peopleError }] =
    await Promise.all([
      confirmationIds.length
        ? fetchAll((from, to) =>
            supabase
              .from("site_receipt_confirmation_lines")
              .select("issue_line_id, receipt_line_id, received_quantity")
              .in("confirmation_id", confirmationIds)
              .order("id")
              .range(from, to),
          )
        : [],
      itemIds.length
        ? supabase.from("items").select("id, name").in("id", itemIds)
        : Promise.resolve({ data: [], error: null }),
      peopleIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", peopleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (itemsError) fail("the delivered items", itemsError);
  if (peopleError) fail("who confirmed", peopleError);

  const itemName = new Map((items ?? []).map((item) => [item.id, item.name]));
  const personName = new Map((people ?? []).map((person) => [person.id, person.full_name]));
  const received = new Map(
    confirmedLines.map((line) => [
      line.issue_line_id ?? line.receipt_line_id ?? "",
      line.received_quantity,
    ]),
  );
  const workLabel = (work: unknown) => {
    const found = work as { code: string; name: string } | null;
    return found ? `${found.name} — ${found.code}` : null;
  };
  const toLine = (line: { id: string; item_id: string; quantity: number; uom: string }) => ({
    id: line.id,
    itemName: itemName.get(line.item_id) ?? "—",
    uom: line.uom,
    sent: line.quantity,
    received: received.get(line.id) ?? null,
  });
  const confirmationOf = (match: (row: (typeof confirmations)[number]) => boolean) => {
    const found = confirmations.find(match);
    return {
      confirmedAt: found?.confirmed_at ?? null,
      confirmedByName: found ? (personName.get(found.confirmed_by) ?? null) : null,
      note: found?.note ?? null,
    };
  };

  const deliveries: VillaDelivery[] = [
    ...(issues ?? []).map((issue) => ({
      kind: "issue" as const,
      id: issue.id,
      reference: issue.reference ?? "—",
      on: issue.issued_at,
      label: workLabel(issue.work_items),
      lines: issueLines.filter((line) => line.issue_id === issue.id).map(toLine),
      ...confirmationOf((row) => row.issue_id === issue.id),
    })),
    ...(receipts ?? []).map((receipt) => ({
      kind: "receipt" as const,
      id: receipt.id,
      reference: receipt.reference ?? "—",
      on: receipt.received_at,
      label: workLabel(receipt.work_items),
      lines: receiptLines.filter((line) => line.receipt_id === receipt.id).map(toLine),
      ...confirmationOf((row) => row.receipt_id === receipt.id),
    })),
  ];
  return deliveries.sort((a, b) => b.on.localeCompare(a.on)).slice(0, RECENT);
}
