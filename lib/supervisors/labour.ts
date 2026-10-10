/**
 * A labour log in the billing team's three formats (0104, founder
 * 2026-10-08) — pure, no database. Still no rupees: the supervisor logs
 * heads or quantities; the billing team prices them in Bills.
 *
 *   nmr      daily wages — heads by trade (masons / helpers / others)
 *   pw_qty   piece-work by quantity — how much of the work, in its unit
 *   pw_lump  piece-work, lump sum — what was done, in words
 *
 * The database's labour_logs_shape_matches_kind CHECK holds the same
 * shapes; this says them in words before a save is refused.
 */

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

export type LabourShapeInput = {
  kind: string;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  /** The work's unit from the rate book, or null when it has none. */
  workUom: string | null;
  description: string;
};

/** What the row stores for its kind — the other kinds' fields cleared. */
export type LabourShape = {
  kind: LabourKind;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  uom: string | null;
  description: string | null;
};

/** The log as the database will store it, or what is wrong in words. */
export function labourShape(input: LabourShapeInput): LabourShape | { error: string } {
  if (!isLabourKind(input.kind)) return { error: "Pick how the work is paid." };

  if (input.kind === "nmr") {
    for (const [label, value] of [
      ["masons", input.masons],
      ["helpers", input.helpers],
      ["others", input.others],
    ] as const) {
      if (!Number.isInteger(value) || value < 0 || value > COUNT_LIMIT) {
        return {
          error: `The ${label} count must be a whole number between 0 and ${COUNT_LIMIT}.`,
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
