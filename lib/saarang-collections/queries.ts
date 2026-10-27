import "server-only";

import { requireTool } from "@/lib/auth/access";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import {
  compute,
  KINDS,
  PROJECTS,
  rulesOf,
  type Datasets,
  type Project,
  type ProjectResult,
  type Rules,
  type Slot,
} from "./core";
import { FIGURE_KEYS, GRANT, type FigureProject } from "./shared";

// Every function opens with requireTool: 0161's policies gate SELECT too. Reads nothing outside the tool.
const TOOL = "Saarang Collections";
const SLOTS = PROJECTS.flatMap((p) => KINDS.map((k) => `${p}_${k}` as Slot));

/** Counts and dates only — the welcome screen never shows a rupee. */
export async function getWelcomeCounts(): Promise<{
  reportsLoaded: number;
  reportDate: string | null;
  excludedReceipts: number;
  corrections: number;
  extraUnits: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const head = { count: "exact", head: true } as const;
  const [slots, settings, excluded, corrections, extra] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("saarang_collection_uploads").select("slot, id").order("id").range(from, to),
    ),
    supabase.from("saarang_collection_settings").select("report_date").maybeSingle(),
    supabase.from("saarang_collection_excluded_receipts").select("id", head),
    supabase.from("saarang_collection_corrections").select("id", head),
    supabase.from("saarang_collection_extra_units").select("id", head),
  ]);
  assertRead(TOOL, "the report date", settings.error);
  assertRead(TOOL, "the excluded receipts", excluded.error);
  assertRead(TOOL, "the corrections", corrections.error);
  assertRead(TOOL, "the units added by hand", extra.error);

  return {
    reportsLoaded: new Set(slots.map((row) => row.slot)).size,
    reportDate: settings.data?.report_date ?? null,
    excludedReceipts: excluded.count ?? 0,
    corrections: corrections.count ?? 0,
    extraUnits: extra.count ?? 0,
  };
}

export type SlotState = {
  slot: Slot;
  /** null: Missing. `fresh`: came in with the newest set, within an hour of it ("Updated"), else "Loaded". */
  upload: {
    fileName: string;
    asOf: string | null;
    rowCount: number;
    uploadedAt: string;
    uploadedBy: string | null;
    fresh: boolean;
  } | null;
};

type Attributed = { id: string; addedBy: string | null; addedAt: string };

export type Collections = {
  settings: {
    periodFrom: string | null;
    periodTo: string | null;
    reportDate: string | null;
    updatedBy: string | null;
    updatedAt: string;
  };
  rules: Rules;
  excluded: (Rules["excluded"][number] & Attributed)[];
  corrections: (Rules["corrections"][number] & Attributed)[];
  extraUnits: (Rules["extra_units"][number] & Attributed)[];
  /** Every hand-typed cell, null when blank. */
  figures: Record<FigureProject, Record<string, number | null>>;
  slots: SlotState[];
  result: Record<Project, ProjectResult>;
};

/** Everything the Summary, Reports, Rules and the Excel download show, worked out from the latest upload per slot. */
export async function getCollections(): Promise<Collections> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const [settings, figures, excluded, corrections, extra, uploads] = await Promise.all([
    supabase
      .from("saarang_collection_settings")
      .select(
        "test_suffix, dedupe, gst_plot, gst_villa, sold_field_plot, sold_field_villa, period_from, period_to, report_date, updated_by, updated_at",
      )
      .single(),
    supabase.from("saarang_collection_figures").select("project, key, value"),
    supabase
      .from("saarang_collection_excluded_receipts")
      .select("id, receipt_no, reason, added_by, added_at")
      .order("added_at"),
    supabase
      .from("saarang_collection_corrections")
      .select("id, unit, stage, delta, note, added_by, added_at")
      .order("added_at"),
    supabase
      .from("saarang_collection_extra_units")
      .select("id, unit, applicant, sold_value, completed, pending, note, added_by, added_at")
      .order("added_at"),
    fetchAll((from, to) =>
      supabase
        .from("saarang_collection_uploads")
        .select("id, slot, file_name, as_of, row_count, uploaded_by, uploaded_at")
        .order("uploaded_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  assertRead(TOOL, "the rules", settings.error);
  assertRead(TOOL, "the typed figures", figures.error);
  assertRead(TOOL, "the excluded receipts", excluded.error);
  assertRead(TOOL, "the corrections", corrections.error);
  assertRead(TOOL, "the units added by hand", extra.error);

  const latest = new Map<Slot, (typeof uploads)[number]>();
  for (const upload of uploads) {
    if (!latest.has(upload.slot as Slot)) latest.set(upload.slot as Slot, upload);
  }
  const ids = [...latest.values()].map((upload) => upload.id);
  const withRows = ids.length
    ? await supabase.from("saarang_collection_uploads").select("slot, rows").in("id", ids)
    : { data: [], error: null };
  assertRead(TOOL, "the uploaded reports", withRows.error);
  const datasets = Object.fromEntries(
    (withRows.data ?? []).map((upload) => [upload.slot, { rows: upload.rows }]),
  ) as Datasets;

  const s = settings.data;
  const rules: Rules = rulesOf({
    test_suffix: s.test_suffix,
    dedupe: s.dedupe,
    gst_plot: Number(s.gst_plot),
    gst_villa: Number(s.gst_villa),
    sold_field_plot: s.sold_field_plot === "incl" ? "incl" : "price",
    sold_field_villa: s.sold_field_villa === "incl" ? "incl" : "price",
    excluded: excluded.data ?? [],
    corrections: (corrections.data ?? []).map((c) => ({ ...c, delta: Number(c.delta) })),
    extra_units: (extra.data ?? []).map((x) => ({
      ...x,
      sold_value: Number(x.sold_value),
      completed: Number(x.completed),
      pending: Number(x.pending),
    })),
  });

  const names = await profileNames(supabase, [
    s.updated_by,
    ...[...latest.values()].map((u) => u.uploaded_by),
    ...[...(excluded.data ?? []), ...(corrections.data ?? []), ...(extra.data ?? [])].map(
      (row) => row.added_by,
    ),
  ]);
  const attributed = <T extends { id: string; added_by: string; added_at: string }>(row: T) => ({
    id: row.id,
    addedBy: names.get(row.added_by) ?? null,
    addedAt: row.added_at,
  });

  const typed = Object.fromEntries(
    Object.entries(FIGURE_KEYS).map(([project, keys]) => [
      project,
      Object.fromEntries(keys.map((key) => [key, null])),
    ]),
  ) as Collections["figures"];
  for (const row of figures.data ?? []) {
    if (row.project in typed) {
      typed[row.project as FigureProject][row.key] = row.value === null ? null : Number(row.value);
    }
  }

  const newest = uploads[0] ? Date.parse(uploads[0].uploaded_at) : 0;
  return {
    settings: {
      periodFrom: s.period_from,
      periodTo: s.period_to,
      reportDate: s.report_date,
      updatedBy: s.updated_by ? (names.get(s.updated_by) ?? null) : null,
      updatedAt: s.updated_at,
    },
    rules,
    excluded: (excluded.data ?? []).map((row) => ({ ...row, ...attributed(row) })),
    corrections: rules.corrections.map((row, i) => ({
      ...row,
      ...attributed(corrections.data![i]),
    })),
    extraUnits: rules.extra_units.map((row, i) => ({ ...row, ...attributed(extra.data![i]) })),
    figures: typed,
    slots: SLOTS.map((slot) => {
      const upload = latest.get(slot);
      return {
        slot,
        upload: upload
          ? {
              fileName: upload.file_name,
              asOf: upload.as_of,
              rowCount: upload.row_count,
              uploadedAt: upload.uploaded_at,
              uploadedBy: names.get(upload.uploaded_by) ?? null,
              fresh: newest - Date.parse(upload.uploaded_at) < 3_600_000,
            }
          : null,
      };
    }),
    result: compute(datasets, rules, {
      periodFrom: s.period_from,
      periodTo: s.period_to,
      reportDate: s.report_date,
    }),
  };
}
