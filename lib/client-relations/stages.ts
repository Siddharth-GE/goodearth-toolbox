/**
 * Every vocabulary Client Relations uses, in one place.
 *
 * The database CHECK constraints in migration 0050 are the real boundary;
 * these lists are the mirror that renders the dropdowns and the badges.
 * When one changes, both change — a value the database accepts but this
 * file has never heard of shows up on screen as a raw snake_case string,
 * which is how "signed_chess_cafe_original" ends up in front of a client.
 *
 * Pure, with no imports, so it is safe in Server Components, Client
 * Components and tests alike. `tone` is a components/ui/badge.tsx variant
 * name, deliberately a plain string here so this file never imports React.
 */

export type BadgeTone = "default" | "neutral" | "success" | "warning" | "danger" | "info";

export type Option<T extends string> = {
  value: T;
  label: string;
  tone: BadgeTone;
};

// ---------------------------------------------------------------------
// The client lifecycle
// ---------------------------------------------------------------------

export type ClientStage = "prospect" | "client" | "lost";

/**
 * One list holds both, per the founder: "a new client can be a prospect
 * or a client and once they are a client they can be added to the master."
 * Becoming a client is not a dropdown choice — it is what assigning a
 * plot leaves behind. See assignPlot in actions.ts.
 */
export const CLIENT_STAGES: Option<ClientStage>[] = [
  { value: "prospect", label: "Prospect", tone: "info" },
  { value: "client", label: "Client", tone: "success" },
  { value: "lost", label: "Lost", tone: "neutral" },
];

// ---------------------------------------------------------------------
// Sale deed and construction agreement
// ---------------------------------------------------------------------

export type DeedStatus = "not_signed" | "signed";
export type OriginalWith = "chess_cafe" | "client" | "bank";
export type Acknowledgement = "with_bank" | "received";

/**
 * The sheet writes these as one value — "Signed, Bank Original" — but they
 * are two independent facts, and splitting them is what turns the sheet's
 * hand-typed "Sale deed: 29" into a single equality rather than a growing
 * chain of ORs. Same vocabulary serves the construction agreement, which
 * is why neither is named for the document it belongs to.
 */
export const DEED_STATUSES: Option<DeedStatus>[] = [
  { value: "not_signed", label: "Not signed", tone: "neutral" },
  { value: "signed", label: "Signed", tone: "success" },
];

export const ORIGINAL_WITH: Option<OriginalWith>[] = [
  { value: "chess_cafe", label: "Chess Cafe original", tone: "info" },
  { value: "client", label: "Client original", tone: "info" },
  { value: "bank", label: "Bank original", tone: "warning" },
];

export const ACKNOWLEDGEMENTS: Option<Acknowledgement>[] = [
  { value: "with_bank", label: "With bank", tone: "warning" },
  { value: "received", label: "Received", tone: "success" },
];

// ---------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------

export type RegistrationStage = "not_due" | "due" | "scheduled" | "registered";

/**
 * A ladder rather than prose because the sheet's own header aggregates it
 * ("Plots for registration 5 9 27 30 33 36 37 38 40"). Anything the
 * founder counts by hand has to be countable here.
 */
export const REGISTRATION_STAGES: Option<RegistrationStage>[] = [
  { value: "not_due", label: "Not due", tone: "neutral" },
  { value: "due", label: "Due", tone: "warning" },
  { value: "scheduled", label: "Scheduled", tone: "info" },
  { value: "registered", label: "Registered", tone: "success" },
];

// ---------------------------------------------------------------------
// Bottlenecks — several at once
// ---------------------------------------------------------------------

export type Bottleneck = "design" | "client" | "payments" | "management" | "interiors";

/**
 * Stored as a `text[]`, because the sheet genuinely holds more than one at
 * a time ("Interior design, Payments"). Note that 'design' here means
 * "the design team is what this plot is waiting on" — it is not a design
 * STATUS. Design status comes from Relay and is never typed.
 */
export const BOTTLENECKS: Option<Bottleneck>[] = [
  { value: "design", label: "Design", tone: "warning" },
  { value: "client", label: "Client", tone: "info" },
  { value: "payments", label: "Payments", tone: "danger" },
  { value: "management", label: "Management", tone: "warning" },
  { value: "interiors", label: "Interiors", tone: "info" },
];

const BOTTLENECK_ORDER = new Map(BOTTLENECKS.map((b, i) => [b.value, i]));

/**
 * Canonicalise before writing: drop anything unknown, drop duplicates, and
 * sort into the order above.
 *
 * Without this, `{payments,design}` and `{design,payments}` are different
 * arrays holding the same meaning — they render in whatever order the
 * boxes were ticked, and two identical plots look different. The database
 * CHECK rejects unknown values but has no opinion on order or repeats.
 */
export function normaliseBottlenecks(raw: readonly string[]): Bottleneck[] {
  const seen = new Set<Bottleneck>();
  for (const value of raw) {
    if (BOTTLENECK_ORDER.has(value as Bottleneck)) seen.add(value as Bottleneck);
  }
  return [...seen].sort(
    (a, b) => (BOTTLENECK_ORDER.get(a) ?? 0) - (BOTTLENECK_ORDER.get(b) ?? 0),
  );
}

// ---------------------------------------------------------------------
// The payment ladder
// ---------------------------------------------------------------------

export type MilestoneStage =
  | "plot"
  | "booking"
  | "foundation"
  | "ground_floor_slab"
  | "first_floor_slab"
  | "internal_plastering"
  | "floor_laying"
  | "painting_polishing"
  | "completed";

/**
 * All nine, in order, seeded onto every engagement by
 * create_client_engagement (0050 §7). The Collections tab is this list —
 * a fixed grid you fill in, with no "add a row" step, which is the shape
 * the sheet already had.
 */
export const MILESTONE_STAGES: { value: MilestoneStage; label: string; sortOrder: number }[] = [
  { value: "plot", label: "Plot amount", sortOrder: 10 },
  { value: "booking", label: "Booking", sortOrder: 20 },
  { value: "foundation", label: "Foundation", sortOrder: 30 },
  { value: "ground_floor_slab", label: "Ground floor slab", sortOrder: 40 },
  { value: "first_floor_slab", label: "First floor slab", sortOrder: 50 },
  { value: "internal_plastering", label: "Internal plastering", sortOrder: 60 },
  { value: "floor_laying", label: "Floor laying", sortOrder: 70 },
  { value: "painting_polishing", label: "Painting and polishing", sortOrder: 80 },
  { value: "completed", label: "Completed", sortOrder: 90 },
];

const MILESTONE_LABELS = new Map(MILESTONE_STAGES.map((s) => [s.value, s.label]));

export function milestoneLabel(stage: string): string {
  return MILESTONE_LABELS.get(stage as MilestoneStage) ?? stage;
}

/**
 * The eight the sheet calls "Current Stage of Invoice Raising".
 *
 * `plot` is excluded on purpose: it is the sheet's separate "Due date for
 * Plot amount to be received" column, and including it would put a value
 * in the invoice-stage cell that the founder's own sheet never shows.
 */
export const INVOICE_STAGES = MILESTONE_STAGES.filter((s) => s.value !== "plot");

/**
 * The sheet's invoice stage, DERIVED rather than stored: the furthest
 * stage anyone has raised an invoice for.
 *
 * Derived because a stored ladder position and the rows behind it can
 * disagree, and when they do there is no way to tell which one lied.
 * Returns null when nothing has been invoiced — rendered as a dash, not
 * as "Booking", because "not started" and "at the first rung" are
 * different answers.
 */
export function invoiceStageOf(
  milestones: readonly { stage: string; invoicedOn: string | null }[],
): MilestoneStage | null {
  let best: { stage: MilestoneStage; sortOrder: number } | null = null;
  for (const milestone of milestones) {
    if (!milestone.invoicedOn) continue;
    const known = INVOICE_STAGES.find((s) => s.value === milestone.stage);
    if (!known) continue;
    if (!best || known.sortOrder > best.sortOrder) {
      best = { stage: known.value, sortOrder: known.sortOrder };
    }
  }
  return best?.stage ?? null;
}

// ---------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------

export type ReceiptMode = "bank" | "cheque" | "upi" | "cash" | "other";

export const RECEIPT_MODES: Option<ReceiptMode>[] = [
  { value: "bank", label: "Bank transfer", tone: "default" },
  { value: "cheque", label: "Cheque", tone: "default" },
  { value: "upi", label: "UPI", tone: "default" },
  { value: "cash", label: "Cash", tone: "default" },
  { value: "other", label: "Other", tone: "neutral" },
];

// ---------------------------------------------------------------------
// Shared lookup
// ---------------------------------------------------------------------

/**
 * Label and tone for a stored value, or a safe fallback.
 *
 * The fallback matters: a value written by a migration this file has not
 * caught up with should read as itself, not crash the row it is in.
 */
export function optionFor<T extends string>(
  options: readonly Option<T>[],
  value: string | null | undefined,
): Option<T> | null {
  if (!value) return null;
  return options.find((option) => option.value === value) ?? null;
}
