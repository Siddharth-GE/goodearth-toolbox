import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listVendors } from "@/lib/masters/vendors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  leftToBuy,
  orderedByIndentLine,
  purchaseHistory,
  type PriceSuggestion,
  type VendorSuggestion,
} from "./from-indent";

// The "order from indents" reads: the pool a PO draws lines from, and the approved indents still to buy.

type Client = SupabaseClient<Database>;

export type PoolLineRow = {
  indent_line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  approved_quantity: number;
  /** Ordered across ALL non-cancelled POs, this one included. */
  already_ordered: number;
  remaining: number;
  /** Already a line on this PO — shown disabled, never hidden. */
  on_this_po: boolean;
  note: string | null;
};

export type PoolIndentGroup = {
  indent_id: string;
  reference: string;
  stage: string | null;
  place: string | null;
  lines: PoolLineRow[];
};

export type IndentPool = {
  scope_label: string;
  groups: PoolIndentGroup[];
};

/** Unit PO: that unit's indents; plot PO: that plot's; GENERAL PO: every approved indent (the bulk buy). Fully-ordered lines render disabled, not hidden. */
export async function getIndentPool(poId: string): Promise<IndentPool | null> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("id, project_id, plot_id, unit_id, units(name), plots(name)")
    .eq("id", poId)
    .maybeSingle();
  assertRead("purchase-orders", "this order's indent pool", poError);
  if (!po) return null;

  // Read to completion: a truncated pool hides approved lines, reading as "already ordered".
  // Build the query fresh per callback: fetchAll re-calls it and a reused builder stacks clauses.
  const indents = await fetchAll((from, to) => {
    let query = supabase
      .from("indents")
      .select("id, reference, stage, plots(name), units(name)")
      .eq("project_id", po.project_id)
      .eq("status", "approved");
    if (po.unit_id) {
      query = query.eq("unit_id", po.unit_id);
    } else if (po.plot_id) {
      query = query.eq("plot_id", po.plot_id);
    }
    return query.order("created_at").order("id").range(from, to);
  });

  const scope_label = po.unit_id
    ? `unit ${(po.units as { name: string } | null)?.name ?? ""}`.trim()
    : po.plot_id
      ? `plot ${(po.plots as { name: string } | null)?.name ?? ""}`.trim()
      : "every villa (a bulk buy)";

  if (indents.length === 0) return { scope_label, groups: [] };

  const indentIds = indents.map((indent) => indent.id);
  const lines = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select(
        "id, indent_id, item_id, quantity, uom, note, items(name, code, thumb_url, brands(name))",
      )
      .in("indent_id", indentIds)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const lineIds = lines.map((line) => line.id);
  const ordered = lineIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("purchase_order_lines")
          .select("indent_line_id, quantity, po_id, purchase_orders(status)")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(from, to),
      )
    : [];

  const orderedByLine = new Map<string, number>();
  const onThisPo = new Set<string>();
  for (const row of ordered) {
    const status = (row.purchase_orders as { status: string } | null)?.status;
    if (status === "cancelled") continue;
    // Direct lines (0079) carry no indent anchor and don't count against any indent.
    if (row.indent_line_id == null) continue;
    orderedByLine.set(
      row.indent_line_id,
      (orderedByLine.get(row.indent_line_id) ?? 0) + row.quantity,
    );
    if (row.po_id === poId) onThisPo.add(row.indent_line_id);
  }

  const byIndent = new Map<string, PoolLineRow[]>();
  for (const line of lines) {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const already = orderedByLine.get(line.id) ?? 0;
    const group = byIndent.get(line.indent_id) ?? [];
    group.push({
      indent_line_id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      uom: line.uom,
      approved_quantity: line.quantity,
      already_ordered: already,
      remaining: Math.max(0, line.quantity - already),
      on_this_po: onThisPo.has(line.id),
      note: line.note,
    });
    byIndent.set(line.indent_id, group);
  }

  return {
    scope_label,
    groups: indents
      .filter((indent) => byIndent.has(indent.id))
      .map((indent) => ({
        indent_id: indent.id,
        reference: indent.reference ?? "—",
        stage: indent.stage,
        place:
          (indent.units as { name: string } | null)?.name ??
          (indent.plots as { name: string } | null)?.name ??
          null,
        lines: byIndent.get(indent.id) ?? [],
      })),
  };
}

type IndentHeadRow = {
  id: string;
  reference: string;
  status: string;
  project_id: string;
  plot_id: string | null;
  unit_id: string | null;
  approved_at: string | null;
  projects: { name: string; code: string | null } | null;
  plots: { name: string; code: string | null } | null;
  units: { name: string; code: string | null } | null;
  work_items: { code: string; name: string } | null;
};

const INDENT_HEAD_COLUMNS =
  "id, reference, status, project_id, plot_id, unit_id, approved_at, projects(name, code), plots(name, code), units(name, code), work_items(code, name)";

const workLabelOf = (work: { code: string; name: string } | null) =>
  work ? `${work.name} — ${work.code}` : null;

async function orderedRows(supabase: Client, indentLineIds?: string[]) {
  if (indentLineIds && indentLineIds.length === 0) return [];
  const rows = await fetchAll((from, to) => {
    let query = supabase
      .from("purchase_order_lines")
      .select("indent_line_id, quantity, purchase_orders(status)")
      .not("indent_line_id", "is", null);
    if (indentLineIds) query = query.in("indent_line_id", indentLineIds);
    return query.order("id").range(from, to);
  });
  return rows.map((row) => ({
    indent_line_id: row.indent_line_id,
    quantity: row.quantity,
    status: (row.purchase_orders as { status: string } | null)?.status ?? "cancelled",
  }));
}

export type IndentToOrderRow = {
  id: string;
  reference: string;
  project_name: string;
  place: string;
  work_label: string | null;
  approved_at: string | null;
  line_count: number;
  lines_left: number;
};

/** Approved indents with anything left to buy. `q` matches number, project, villa or work. Read to completion: a truncated list hides an indent nobody orders. */
export async function listIndentsToOrder(q?: string): Promise<IndentToOrderRow[]> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const [indents, lines, ordered] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("indents")
        .select(INDENT_HEAD_COLUMNS)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("indent_lines")
        .select("id, indent_id, quantity, indents!inner(status)")
        .eq("indents.status", "approved")
        .order("id")
        .range(from, to),
    ),
    orderedRows(supabase),
  ]);

  const orderedByLine = orderedByIndentLine(ordered);
  const counts = new Map<string, { total: number; left: number }>();
  for (const line of lines) {
    const count = counts.get(line.indent_id) ?? { total: 0, left: 0 };
    count.total++;
    if (leftToBuy(line.quantity, orderedByLine.get(line.id) ?? 0) > 0) count.left++;
    counts.set(line.indent_id, count);
  }

  const needle = q?.toLowerCase();
  return (indents as unknown as IndentHeadRow[])
    .map((indent) => ({
      id: indent.id,
      reference: indent.reference,
      project_name: indent.projects?.name ?? "—",
      place: indent.units?.name ?? indent.plots?.name ?? "General",
      work_label: workLabelOf(indent.work_items),
      approved_at: indent.approved_at,
      line_count: counts.get(indent.id)?.total ?? 0,
      lines_left: counts.get(indent.id)?.left ?? 0,
    }))
    .filter((row) => row.lines_left > 0)
    .filter(
      (row) =>
        !needle ||
        [row.reference, row.project_name, row.place, row.work_label ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        ),
    );
}

export type IndentOrderLine = {
  indent_line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  approved_quantity: number;
  already_ordered: number;
  left: number;
  note: string | null;
  /** Masters' GST for the item (0131), offered before any vendor's last one. */
  item_gst_pct: number | null;
  suggestion: VendorSuggestion | null;
};

export type IndentForOrdering = {
  id: string;
  reference: string;
  status: string;
  project_name: string;
  place: string;
  work_label: string | null;
  /** Why a PO can't be numbered for this scope yet (a project, plot or unit without its short code); null when it can. */
  scope_problem: string | null;
  lines: IndentOrderLine[];
  fully_ordered: number;
  vendors: { id: string; name: string }[];
  /** Each vendor's last price per item, keyed by priceKey(item, vendor). */
  prices: Record<string, PriceSuggestion>;
};

export async function getIndentForOrdering(indentId: string): Promise<IndentForOrdering | null> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("indents")
    .select(INDENT_HEAD_COLUMNS)
    .eq("id", indentId)
    .maybeSingle();
  if (error) {
    console.error("getIndentForOrdering failed:", error);
    throw new Error("Could not read the indent.", { cause: error });
  }
  if (!data) return null;
  const indent = data as unknown as IndentHeadRow;

  const lines = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select(
        "id, item_id, quantity, uom, note, items(name, code, thumb_url, gst_pct, brands(name))",
      )
      .eq("indent_id", indentId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  const itemIds = [...new Set(lines.map((line) => line.item_id))];

  const [ordered, purchases, vendors] = await Promise.all([
    orderedRows(
      supabase,
      lines.map((line) => line.id),
    ),
    itemIds.length
      ? fetchAll((from, to) =>
          supabase
            .from("purchase_order_lines")
            .select(
              "item_id, rate, gst_pct, purchase_orders(vendor_id, status, issued_at, created_at)",
            )
            .in("item_id", itemIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    listVendors(true),
  ]);

  const orderedByLine = orderedByIndentLine(ordered);
  const history = purchaseHistory(
    purchases.map((row) => {
      const po = row.purchase_orders as {
        vendor_id: string;
        status: string;
        issued_at: string | null;
        created_at: string;
      } | null;
      return {
        item_id: row.item_id,
        vendor_id: po?.vendor_id ?? "",
        rate: row.rate,
        gst_pct: row.gst_pct,
        at: po?.issued_at ?? po?.created_at ?? "",
        status: po?.status ?? "cancelled",
      };
    }),
  );

  const scopeProblem = !indent.projects?.code
    ? "This project has no short code yet — set one in Masters → Projects before ordering."
    : indent.unit_id
      ? indent.units?.code
        ? null
        : "This unit has no short code yet — set one in Masters before ordering."
      : indent.plot_id && !indent.plots?.code
        ? "This plot has no short code yet — set one in Masters before ordering."
        : null;

  const mapped: IndentOrderLine[] = lines.map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      gst_pct: number | null;
      brands: { name: string } | null;
    } | null;
    const already = orderedByLine.get(line.id) ?? 0;
    return {
      indent_line_id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      uom: line.uom,
      approved_quantity: line.quantity,
      already_ordered: already,
      left: leftToBuy(line.quantity, already),
      note: line.note,
      item_gst_pct: item?.gst_pct ?? null,
      suggestion: history.lastVendor.get(line.item_id) ?? null,
    };
  });
  const open = mapped.filter((line) => line.left > 0);

  return {
    id: indent.id,
    reference: indent.reference,
    status: indent.status,
    project_name: indent.projects?.name ?? "—",
    place: indent.units?.name ?? indent.plots?.name ?? "General",
    work_label: workLabelOf(indent.work_items),
    scope_problem: scopeProblem,
    lines: open,
    fully_ordered: mapped.length - open.length,
    vendors: vendors.map(({ id, name }) => ({ id, name })),
    prices: Object.fromEntries(history.lastPrice),
  };
}
