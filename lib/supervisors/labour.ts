/** A labour log in the billing team's three formats (0104), pure and rupee-free: nmr (daily wages by trade),
 * pw_qty (piece-work by quantity), pw_lump (lump sum). labour_logs_shape_matches_kind holds the same shapes in the database. */

export const LABOUR_KINDS = ["nmr", "pw_qty", "pw_lump"] as const;
export type LabourKind = (typeof LABOUR_KINDS)[number];

export const LABOUR_KIND_LABEL: Record<LabourKind, string> = {
  nmr: "Daily wages",
  pw_qty: "Piece-work by quantity",
  pw_lump: "Piece-work, lump sum",
};

export function isLabourKind(value: string): value is LabourKind {
  return (LABOUR_KINDS as readonly string[]).includes(value);
}

const COUNT_LIMIT = 999;
const DESCRIPTION_LIMIT = 500;

/** Half and quarter days count: two decimals at most, as labour_logs holds them (0155). */
function isCount(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= COUNT_LIMIT &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

export type LabourShapeInput = {
  kind: string;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  workUom: string | null;
  description: string;
};

export type LabourShape = {
  kind: LabourKind;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  uom: string | null;
  description: string | null;
};

export function labourShape(input: LabourShapeInput): LabourShape | { error: string } {
  if (!isLabourKind(input.kind)) return { error: "Pick how the work is paid." };

  if (input.kind === "nmr") {
    for (const [label, value] of [
      ["masons", input.masons],
      ["helpers", input.helpers],
      ["others", input.others],
    ] as const) {
      if (!isCount(value)) {
        return {
          error: `The ${label} count must be between 0 and ${COUNT_LIMIT}, to two decimals — 0.5 for half a day.`,
        };
      }
    }
    if (input.masons + input.helpers + input.others === 0) {
      return { error: "Enter at least one worker — a day with nobody on it needs no log." };
    }
    return {
      kind: "nmr",
      masons: input.masons,
      helpers: input.helpers,
      others: input.others,
      quantity: null,
      uom: null,
      description: null,
    };
  }

  const description = input.description.trim();
  if (description.length > DESCRIPTION_LIMIT) {
    return { error: `Keep the description under ${DESCRIPTION_LIMIT} characters.` };
  }

  if (input.kind === "pw_qty") {
    if (!input.workUom) {
      return {
        error:
          "This work has no unit in the rate book yet, so it can't be measured — log it as a lump sum, or ask the QS to set its unit.",
      };
    }
    if (input.quantity === null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      return { error: `Enter how much was done, in ${input.workUom}.` };
    }
    return {
      kind: "pw_qty",
      masons: 0,
      helpers: 0,
      others: 0,
      quantity: input.quantity,
      uom: input.workUom,
      description: description || null,
    };
  }

  if (!description) return { error: "Say what was done for the lump sum." };
  return {
    kind: "pw_lump",
    masons: 0,
    helpers: 0,
    others: 0,
    quantity: null,
    uom: null,
    description,
  };
}

/** One line for a list: "2 masons, 3 helpers" · "2 cum" · "Lump sum: plastering the porch". */
export function describeLabour(log: {
  kind: LabourKind;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  uom: string | null;
  description: string | null;
}): string {
  if (log.kind === "pw_qty") {
    const amount = `${Number((log.quantity ?? 0).toFixed(3))} ${log.uom ?? ""}`.trim();
    return `Piece-work ${amount}${log.description ? ` · ${log.description}` : ""}`;
  }
  if (log.kind === "pw_lump") return `Lump sum: ${log.description ?? "—"}`;
  const parts: string[] = [];
  if (log.masons) parts.push(`${log.masons} mason${log.masons === 1 ? "" : "s"}`);
  if (log.helpers) parts.push(`${log.helpers} helper${log.helpers === 1 ? "" : "s"}`);
  if (log.others) parts.push(`${log.others} other${log.others === 1 ? "" : "s"}`);
  return parts.join(", ") || "Nobody";
}

const NAME_LIMIT = 120;

/** What a log was on: a Masters work, or — for Additional work or Rework only — a typed name (0156). A named log is
 * daily wages or a lump sum: piece-work by quantity needs a work's unit. labour_logs_work_or_name holds the same. */
export function labourWork(input: {
  workItemId: string;
  customName: string;
  workClass: string;
  kind: string;
}): { work_item_id: string | null; custom_name: string | null } | { error: string } {
  const name = input.customName.trim();
  if (!name) {
    return input.workItemId
      ? { work_item_id: input.workItemId, custom_name: null }
      : { error: "Pick the work the labour was on." };
  }
  if (input.workClass !== "additional" && input.workClass !== "rework") {
    return { error: "Only Additional work or Rework can be given a name instead of a work." };
  }
  if (input.kind === "pw_qty") {
    return {
      error:
        "Work with a typed name is paid as daily wages or a lump sum — a quantity needs a work's unit.",
    };
  }
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  return { work_item_id: null, custom_name: name };
}
