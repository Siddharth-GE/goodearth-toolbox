import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/supabase/transient";

import { classifyDesignDrift, type DriftLine, type DriftStatus } from "./pull-rules";
import type { IndentStatus } from "./workflow";

// The single-indent reads: header for the pull screens, full detail with ordered quantities and design drift.

export type IndentLineSource = "direct" | "construction" | "interiors" | "estimate";

export type IndentLineRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  /** Lines move in the item's Masters unit (interiors excepted); another unit shows a warning. */
  item_default_uom: string | null;
  note: string | null;
  source: IndentLineSource;
  updated_by_name: string | null;
  ordered_quantity: number;
  ordered_po_refs: string | null;
  /** Set when a design revision issued after the pull changed or removed this line. */
  design_drift: "changed" | "removed" | null;
  /** Why a line outside the estimate is needed (0113); null on the rest. */
  off_estimate_reason: string | null;
  /** The estimator's answer on a line outside the estimate (0113). */
  estimator: {
    decision: "approved" | "refused";
    by_name: string | null;
    at: string;
    note: string | null;
  } | null;
};

export type IndentDetail = {
  id: string;
  reference: string;
  status: IndentStatus;
  stage: string | null;
  work_item_id: string | null;
  required_by: string | null;
  note: string | null;
  is_urgent: boolean;
  rejection_note: string | null;
  project_id: string;
  project_name: string;
  plot_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  submitted_by_name: string | null;
  approved_by_name: string | null;
  lines: IndentLineRow[];
  line_count: number;
};

export type IndentHeader = {
  id: string;
  reference: string;
  status: IndentStatus;
  project_id: string;
  project_name: string;
  unit_id: string | null;
  work_item_id: string | null;
};

export const getIndentHeader = cache(async (indentId: string): Promise<IndentHeader | null> => {
  await requireTool("/indents");
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("indents")
      .select("id, reference, status, project_id, unit_id, work_item_id, projects(name)")
      .eq("id", indentId)
      .maybeSingle(),
  );
  // Throw: both pull screens turn a null header into notFound(), so a swallowed error reads as "no such indent".
  if (error) {
    console.error("getIndentHeader failed:", error);
    throw new Error("Could not open that indent.", { cause: error });
  }
  if (!data) return null;
  return {
    id: data.id,
    reference: data.reference,
    status: data.status as IndentStatus,
    project_id: data.project_id,
    project_name: (data.projects as { name: string } | null)?.name ?? "—",
    unit_id: data.unit_id,
    work_item_id: data.work_item_id,
  };
});

export const getIndent = cache(async (indentId: string): Promise<IndentDetail | null> => {
  await requireTool("/indents");
  const supabase = await createClient();

  const [{ data: indent, error: indentError }, lines] = await Promise.all([
    supabase
      .from("indents")
      .select(
        "id, reference, status, stage, work_item_id, required_by, note, is_urgent, rejection_note, project_id, unit_id, created_at, submitted_by, submitted_at, approved_by, approved_at, projects(name), plots(name), units(name)",
      )
      .eq("id", indentId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("indent_lines")
        .select(
          "id, item_id, quantity, uom, note, budget_id, line_key, construction_line_id, estimate_id, off_estimate_reason, estimator_decision, estimator_decided_by, estimator_decided_at, estimator_note, created_by, updated_by, created_at, items(name, code, thumb_url, default_uom, brands(name))",
        )
        .eq("indent_id", indentId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  assertRead("indents", "this indent", indentError);
  if (!indent) return null;

  // One profiles read, not embeds (several FKs to profiles).
  const actorIds = [
    ...new Set(
      [
        indent.submitted_by,
        indent.approved_by,
        ...lines.map((line) => line.updated_by ?? line.created_by),
        ...lines.map((line) => line.estimator_decided_by),
      ].filter((id): id is string => id != null),
    ),
  ];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  // Money-free po_line_facts (0022), summed, so read to completion.
  const lineIds = lines.map((line) => line.id);
  const orderedFacts = lineIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("po_line_facts")
          .select("indent_line_id, quantity, po_reference, po_status")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(from, to),
      )
    : [];

  const orderedByLine = new Map<string, { quantity: number; refs: Set<string> }>();
  for (const fact of orderedFacts) {
    if (fact.po_status === "cancelled" || !fact.indent_line_id) continue;
    const entry = orderedByLine.get(fact.indent_line_id) ?? { quantity: 0, refs: new Set() };
    entry.quantity += fact.quantity ?? 0;
    if (fact.po_reference) entry.refs.add(fact.po_reference);
    orderedByLine.set(fact.indent_line_id, entry);
  }

  // Anchored lines may have drifted: compare each to the unit's latest issued revision.
  const driftByAnchor = new Map<string, DriftStatus>();
  const anchoredBudgetIds = [
    ...new Set(lines.map((line) => line.budget_id).filter((id): id is string => id != null)),
  ];
  if (anchoredBudgetIds.length > 0) {
    const { data: anchorBudgets, error: anchorBudgetsError } = await withRetry(() =>
      supabase
        .from("approved_budgets")
        .select("id, selection_id, unit_id")
        .in("id", anchoredBudgetIds),
    );
    // Throw: an empty result would read as "nothing drifted" and clear every flag.
    if (anchorBudgetsError) {
      console.error("indent drift read failed:", anchorBudgetsError);
      throw new Error("Could not check this indent for design changes.", {
        cause: anchorBudgetsError,
      });
    }
    const budgets = (anchorBudgets ?? []).filter(
      (row): row is { id: string; selection_id: string; unit_id: string } =>
        row.id != null && row.selection_id != null && row.unit_id != null,
    );
    const { data: anchorSelections, error: anchorSelectionsError } = budgets.length
      ? await withRetry(() =>
          supabase
            .from("selections")
            .select("id, status")
            .in(
              "id",
              budgets.map((row) => row.selection_id),
            ),
        )
      : { data: [], error: null };
    // Throw: an empty result would mark every budget superseded.
    if (anchorSelectionsError) {
      console.error("indent drift read failed:", anchorSelectionsError);
      throw new Error("Could not check this indent for design changes.", {
        cause: anchorSelectionsError,
      });
    }
    const statusById = new Map((anchorSelections ?? []).map((row) => [row.id, row.status]));
    const superseded = budgets.filter((row) => statusById.get(row.selection_id) !== "issued");

    if (superseded.length > 0) {
      const anchoredKeysByBudget = new Map<string, string[]>();
      for (const line of lines) {
        if (!line.budget_id || !line.line_key) continue;
        const keys = anchoredKeysByBudget.get(line.budget_id) ?? [];
        keys.push(line.line_key);
        anchoredKeysByBudget.set(line.budget_id, keys);
      }

      const { data: issuedSelections, error: issuedSelectionsError } = await withRetry(() =>
        supabase
          .from("selections")
          .select("id, unit_id")
          .in("unit_id", [...new Set(superseded.map((row) => row.unit_id))])
          .eq("status", "issued"),
      );
      // Throw: an empty result would leave every changed line unflagged.
      if (issuedSelectionsError) {
        console.error("indent drift read failed:", issuedSelectionsError);
        throw new Error("Could not check this indent for design changes.", {
          cause: issuedSelectionsError,
        });
      }
      const issuedByUnit = new Map((issuedSelections ?? []).map((row) => [row.unit_id, row.id]));

      const selectionIds = [
        ...new Set([
          ...superseded.map((row) => row.selection_id),
          ...(issuedSelections ?? []).map((row) => row.id),
        ]),
      ];
      const allKeys = [
        ...new Set(superseded.flatMap((row) => anchoredKeysByBudget.get(row.id) ?? [])),
      ];
      const revisionLines = allKeys.length
        ? await fetchAll((from, to) =>
            supabase
              .from("selection_lines")
              .select("selection_id, line_key, item_id, quantity, unit_space_id")
              .in("selection_id", selectionIds)
              .in("line_key", allKeys)
              .order("id")
              .range(from, to),
          )
        : [];
      const linesBySelection = new Map<string, DriftLine[]>();
      for (const row of revisionLines) {
        const bucket = linesBySelection.get(row.selection_id) ?? [];
        bucket.push(row);
        linesBySelection.set(row.selection_id, bucket);
      }

      for (const budget of superseded) {
        const issuedId = issuedByUnit.get(budget.unit_id);
        const keys = anchoredKeysByBudget.get(budget.id) ?? [];
        if (!issuedId || keys.length === 0) continue;
        const drift = classifyDesignDrift(
          keys,
          linesBySelection.get(budget.selection_id) ?? [],
          linesBySelection.get(issuedId) ?? [],
        );
        for (const [key, status] of drift) {
          driftByAnchor.set(`${budget.id}:${key}`, status);
        }
      }
    }
  }

  const mapped: IndentLineRow[] = lines.map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      default_uom: string | null;
      brands: { name: string } | null;
    } | null;
    const ordered = orderedByLine.get(line.id);
    return {
      id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      quantity: line.quantity,
      uom: line.uom,
      item_default_uom: item?.default_uom ?? null,
      note: line.note,
      source:
        line.budget_id != null
          ? "interiors"
          : line.construction_line_id != null
            ? "construction"
            : line.estimate_id != null
              ? "estimate"
              : "direct",
      updated_by_name: nameOf(line.updated_by ?? line.created_by),
      ordered_quantity: ordered?.quantity ?? 0,
      ordered_po_refs: ordered ? [...ordered.refs].sort().join(", ") : null,
      design_drift:
        line.budget_id && line.line_key
          ? (driftByAnchor.get(`${line.budget_id}:${line.line_key}`) ?? null)
          : null,
      off_estimate_reason: line.off_estimate_reason,
      estimator:
        (line.estimator_decision === "approved" || line.estimator_decision === "refused") &&
        line.estimator_decided_at
          ? {
              decision: line.estimator_decision,
              by_name: nameOf(line.estimator_decided_by),
              at: line.estimator_decided_at,
              note: line.estimator_note,
            }
          : null,
    };
  });

  return {
    id: indent.id,
    reference: indent.reference ?? "—",
    status: indent.status as IndentStatus,
    stage: indent.stage,
    work_item_id: indent.work_item_id,
    required_by: indent.required_by,
    note: indent.note,
    is_urgent: indent.is_urgent,
    rejection_note: indent.rejection_note,
    project_id: indent.project_id,
    project_name: (indent.projects as { name: string } | null)?.name ?? "—",
    plot_name: (indent.plots as { name: string } | null)?.name ?? null,
    unit_id: indent.unit_id,
    unit_name: (indent.units as { name: string } | null)?.name ?? null,
    created_at: indent.created_at,
    submitted_at: indent.submitted_at,
    approved_at: indent.approved_at,
    submitted_by_name: nameOf(indent.submitted_by),
    approved_by_name: nameOf(indent.approved_by),
    lines: mapped,
    line_count: mapped.length,
  };
});
