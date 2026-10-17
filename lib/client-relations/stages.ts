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

export type DeedStatus = "not_started" | "drafting" | "not_signed" | "signed";
export type OriginalWith = "client" | "bank" | "chess_cafe" | "sreejayan" | "tarana";
export type Acknowledgement =
  "received" | "with_bank" | "with_sreejayan" | "requested_from_client" | "pending";

/**
 * The sheet writes these as one value — "Signed, Bank Original" — but they
 * are two independent facts, and splitting them is what turns the sheet's
 * hand-typed "Sale deed: 29" into a single equality rather than a growing
 * chain of ORs. Same vocabulary serves the construction agreement, which
 * is why neither is named for the document it belongs to.
 *
 * The Saarang tracker's lists, in its order (0120 widened every CHECK).
 * 'not_signed' stays the database default, so an untouched plot reads
 * "Not signed" — the honest reading of a deed nobody has recorded.
 */
export const DEED_STATUSES: Option<DeedStatus>[] = [
  { value: "not_started", label: "Not started", tone: "neutral" },
  { value: "drafting", label: "Drafting", tone: "info" },
  { value: "not_signed", label: "Not signed", tone: "neutral" },
  { value: "signed", label: "Signed", tone: "success" },
];

/** Who holds the signed original. Labels are short: they sit in chips. */
export const ORIGINAL_WITH: Option<OriginalWith>[] = [
  { value: "client", label: "Client", tone: "info" },
  { value: "bank", label: "Bank", tone: "warning" },
  { value: "chess_cafe", label: "Chess Cafe", tone: "info" },
  { value: "sreejayan", label: "Sreejayan", tone: "info" },
  { value: "tarana", label: "Tarana", tone: "info" },
];

export const ACKNOWLEDGEMENTS: Option<Acknowledgement>[] = [
  { value: "received", label: "Received", tone: "success" },
  { value: "with_bank", label: "With bank", tone: "warning" },
  { value: "with_sreejayan", label: "With Sreejayan", tone: "info" },
  { value: "requested_from_client", label: "Requested from client", tone: "warning" },
  { value: "pending", label: "Pending", tone: "neutral" },
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

export type Bottleneck =
  "design" | "client" | "payments" | "management" | "interiors" | "legal" | "bank_loan";

/**
 * Stored as a `text[]`, because the sheet genuinely holds more than one at
 * a time ("Interior design, Payments"). Note that 'design' here means
 * "the design team is what this plot is waiting on" — it is not a design
 * STATUS; the three design checks on the plot are (0120).
 *
 * The tracker's last two are appended, not interleaved: the order here is
 * the order a plot's chips render in, and existing plots keep theirs.
 */
export const BOTTLENECKS: Option<Bottleneck>[] = [
  { value: "design", label: "Design", tone: "warning" },
  { value: "client", label: "Client", tone: "info" },
  { value: "payments", label: "Payments", tone: "danger" },
  { value: "management", label: "Management", tone: "warning" },
  { value: "interiors", label: "Interior design", tone: "info" },
  { value: "legal", label: "Legal / documents", tone: "warning" },
  { value: "bank_loan", label: "Bank / loan", tone: "warning" },
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
  return [...seen].sort((a, b) => (BOTTLENECK_ORDER.get(a) ?? 0) - (BOTTLENECK_ORDER.get(b) ?? 0));
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
// Kaadal interiors (0120)
// ---------------------------------------------------------------------

export type KaadalStage =
  | "to_pitch"
  | "pitch_done"
  | "retainer_pending"
  | "retainer_paid"
  | "in_design"
  | "execution"
  | "closed";

/** The tracker's interiors ladder, in its order. Closed ends it either way. */
export const KAADAL_STAGES: Option<KaadalStage>[] = [
  { value: "to_pitch", label: "To pitch", tone: "neutral" },
  { value: "pitch_done", label: "Pitch done", tone: "info" },
  { value: "retainer_pending", label: "Retainer pending", tone: "warning" },
  { value: "retainer_paid", label: "Retainer paid", tone: "success" },
  { value: "in_design", label: "In design", tone: "info" },
  { value: "execution", label: "Execution", tone: "info" },
  { value: "closed", label: "Closed – no interiors", tone: "neutral" },
];

// ---------------------------------------------------------------------
// Actions — the next steps (0120)
// ---------------------------------------------------------------------

export type ActionStatus =
  "open" | "waiting_client" | "waiting_management" | "awaiting_confirmation" | "done";
export type ActionTrack = "sales" | "kaadal";

/**
 * "Waiting on management" is the flag a team member raises when only a
 * manager can clear it; it lifts the action into Needs management at the
 * top of everyone's list.
 */
export const ACTION_STATUSES: Option<ActionStatus>[] = [
  { value: "open", label: "Open", tone: "default" },
  { value: "waiting_client", label: "Waiting on client", tone: "warning" },
  { value: "waiting_management", label: "Waiting on management", tone: "danger" },
  // Finished by its owner; only its setter or a manager closes it (0121).
  { value: "awaiting_confirmation", label: "Finished — waiting to confirm", tone: "success" },
  { value: "done", label: "Done", tone: "success" },
];

/**
 * A plot's two sides, each with its own owner and its own actions: the
 * villa being built, and its interiors (founder, 2026-10-17: "some people
 * may get the interiors or construction of the same plot … call it interior
 * and construction, kaadal can be avoided"). The stored values are the
 * tracker's, from 0120 — `sales` is Construction, `kaadal` is Interior, as
 * are `crm_owner_id` and the `kaadal_*` columns. Only the words changed.
 */
export const ACTION_TRACKS: Option<ActionTrack>[] = [
  { value: "sales", label: "Construction", tone: "default" },
  { value: "kaadal", label: "Interior", tone: "info" },
];

/** The side as a URL says it (`?side=interior`), never the stored value. */
export type SideParam = "construction" | "interior";

const SIDE_TRACK: Record<SideParam, ActionTrack> = { construction: "sales", interior: "kaadal" };

/** `?side=` → a track, or null for both sides (and for anything unknown). */
export function trackForSide(param: string | undefined | null): ActionTrack | null {
  return param && Object.hasOwn(SIDE_TRACK, param) ? SIDE_TRACK[param as SideParam] : null;
}

/** A track → its `?side=` word. */
export function sideForTrack(track: ActionTrack): SideParam {
  return track === "kaadal" ? "interior" : "construction";
}

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
