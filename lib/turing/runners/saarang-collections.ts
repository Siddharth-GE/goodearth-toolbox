import "server-only";

import {
  addCorrection,
  addExcludedReceipt,
  addExtraUnit,
  removeRule,
  saveFigure,
  savePeriod,
  saveRules,
} from "@/lib/saarang-collections/actions";

import { entryFor, formOf } from "../catalogue-fields";
import type { SAARANG_COLLECTIONS } from "../entries/saarang-collections";
import { recordNow, type Runners, type Values } from "./kit";

type Key = (typeof SAARANG_COLLECTIONS)[number]["key"];

/** A form save, filled as its screen fills it; a change keeps what it leaves out from the row now. */
function viaForm(
  key: Key,
  save: (prev: undefined, form: FormData) => Promise<{ error?: string } | undefined>,
  now?: Record<string, unknown>,
) {
  return async (v: Values) => {
    const entry = entryFor(key);
    if (!entry) return { error: "Turing does not know that change." };
    return save(undefined, formOf(entry, v, now));
  };
}

const removal =
  (list: "excluded" | "correction" | "extra", table: string, gone: string) => async (v: Values) => {
    const id = String(v.rule_id);
    const now = await recordNow(table, { column: "id", id }, ["id"], gone);
    if ("error" in now) return now;
    return removeRule(list, id);
  };

/** Each Saarang Collections entry, run through the tool's own save, as the admin. */
export const SAARANG_COLLECTIONS_RUNNERS: Runners<Key> = {
  saarang_figure: (v) => saveFigure(String(v.project), String(v.figure), String(v.value ?? "")),
  saarang_period: viaForm("saarang_period", savePeriod),
  saarang_rules: async (v) => {
    const now = await recordNow(
      "saarang_collection_settings",
      { column: "one_row", id: "true" },
      ["test_suffix", "dedupe", "gst_plot", "gst_villa", "sold_field_plot", "sold_field_villa"],
      "The rules are missing.",
    );
    if ("error" in now) return now;
    return viaForm("saarang_rules", saveRules, now.row)(v);
  },
  saarang_excluded_add: viaForm("saarang_excluded_add", addExcludedReceipt),
  saarang_correction_add: viaForm("saarang_correction_add", addCorrection),
  saarang_unit_add: viaForm("saarang_unit_add", addExtraUnit),
  saarang_excluded_remove: removal(
    "excluded",
    "saarang_collection_excluded_receipts",
    "That receipt is not on the list any more.",
  ),
  saarang_correction_remove: removal(
    "correction",
    "saarang_collection_corrections",
    "That correction was already removed.",
  ),
  saarang_unit_remove: removal(
    "extra",
    "saarang_collection_extra_units",
    "That unit was already removed.",
  ),
};
