/**
 * The database CHECKs (0050) are the boundary; these lists mirror them. Change both together, or a new value shows as raw snake_case.
 * Pure, no imports, so it is safe anywhere. `tone` is a badge variant name, a plain string so React is never imported.
 */

export type BadgeTone = "default" | "neutral" | "success" | "warning" | "danger" | "info";

export type Option<T extends string> = {
  value: T;
  label: string;
  tone: BadgeTone;
};

export type ClientStage = "prospect" | "client" | "lost";

/** Prospect and client share one list. Assigning a plot makes a client (assignPlot in actions.ts); it is not a dropdown choice. */
export const CLIENT_STAGES: Option<ClientStage>[] = [
  { value: "prospect", label: "Prospect", tone: "info" },
  { value: "client", label: "Client", tone: "success" },
  { value: "lost", label: "Lost", tone: "neutral" },
];

export type DeedStatus = "not_started" | "drafting" | "not_signed" | "signed";
export type OriginalWith = "client" | "bank" | "chess_cafe" | "sreejayan" | "tarana";
export type Acknowledgement =
  "received" | "with_bank" | "with_sreejayan" | "requested_from_client" | "pending";

/**
 * The sheet wrote "Signed, Bank Original" as one value; they are two independent facts. Serves the construction agreement too.
 * 'not_signed' is the database default (0120).
 */
export const DEED_STATUSES: Option<DeedStatus>[] = [
  { value: "not_started", label: "Not started", tone: "neutral" },
  { value: "drafting", label: "Drafting", tone: "info" },
  { value: "not_signed", label: "Not signed", tone: "neutral" },
  { value: "signed", label: "Signed", tone: "success" },
];

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

export type RegistrationStage = "not_due" | "due" | "scheduled" | "registered";

/** A ladder, so the sheet's registration counts stay countable. */
export const REGISTRATION_STAGES: Option<RegistrationStage>[] = [
  { value: "not_due", label: "Not due", tone: "neutral" },
  { value: "due", label: "Due", tone: "warning" },
  { value: "scheduled", label: "Scheduled", tone: "info" },
  { value: "registered", label: "Registered", tone: "success" },
];

export type Bottleneck =
  "design" | "client" | "payments" | "management" | "interiors" | "legal" | "bank_loan";

/**
 * A `text[]`: a plot can wait on several things. 'design' means the design team is the holdup, not a design status (0120).
 * New values are appended: this order is the order chips render in.
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

/** Drop unknowns and repeats, sort into the order above: the CHECK ignores order, so equal sets would render differently. */
export function normaliseBottlenecks(raw: readonly string[]): Bottleneck[] {
  const seen = new Set<Bottleneck>();
  for (const value of raw) {
    if (BOTTLENECK_ORDER.has(value as Bottleneck)) seen.add(value as Bottleneck);
  }
  return [...seen].sort((a, b) => (BOTTLENECK_ORDER.get(a) ?? 0) - (BOTTLENECK_ORDER.get(b) ?? 0));
}

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

/** All nine, seeded onto every engagement by create_client_engagement (0050): a fixed grid, no add-a-row. */
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

/** The sheet's eight invoice stages; `plot` is its separate due-date column, so it is left out. */
export const INVOICE_STAGES = MILESTONE_STAGES.filter((s) => s.value !== "plot");

/**
 * Derived, not stored: the furthest stage anyone has raised an invoice for (a stored position can disagree with the rows).
 * Null when nothing is invoiced: a dash, not "Booking".
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

export type ReceiptMode = "bank" | "cheque" | "upi" | "cash" | "other";

export const RECEIPT_MODES: Option<ReceiptMode>[] = [
  { value: "bank", label: "Bank transfer", tone: "default" },
  { value: "cheque", label: "Cheque", tone: "default" },
  { value: "upi", label: "UPI", tone: "default" },
  { value: "cash", label: "Cash", tone: "default" },
  { value: "other", label: "Other", tone: "neutral" },
];

export type KaadalStage =
  | "to_pitch"
  | "pitch_done"
  | "retainer_pending"
  | "retainer_paid"
  | "in_design"
  | "execution"
  | "closed";

/** Closed ends the ladder either way. */
export const KAADAL_STAGES: Option<KaadalStage>[] = [
  { value: "to_pitch", label: "To pitch", tone: "neutral" },
  { value: "pitch_done", label: "Pitch done", tone: "info" },
  { value: "retainer_pending", label: "Retainer pending", tone: "warning" },
  { value: "retainer_paid", label: "Retainer paid", tone: "success" },
  { value: "in_design", label: "In design", tone: "info" },
  { value: "execution", label: "Execution", tone: "info" },
  { value: "closed", label: "Closed – no interiors", tone: "neutral" },
];

export type ActionStatus =
  "open" | "waiting_client" | "waiting_management" | "awaiting_confirmation" | "done";
export type ActionTrack = "sales" | "kaadal";

/** "Waiting on management" lifts an action into Needs management at the top of everyone's list. */
export const ACTION_STATUSES: Option<ActionStatus>[] = [
  { value: "open", label: "Open", tone: "default" },
  { value: "waiting_client", label: "Waiting on client", tone: "warning" },
  { value: "waiting_management", label: "Waiting on management", tone: "danger" },
  // Finished by its owner; only its setter or a manager closes it (0121).
  { value: "awaiting_confirmation", label: "Finished — waiting to confirm", tone: "success" },
  { value: "done", label: "Done", tone: "success" },
];

/**
 * A plot's two sides, each with its own owner and actions. Stored values are the tracker's (0120): `sales` is Construction,
 * `kaadal` is Interior, as are `crm_owner_id` and the `kaadal_*` columns.
 */
export const ACTION_TRACKS: Option<ActionTrack>[] = [
  { value: "sales", label: "Construction", tone: "default" },
  { value: "kaadal", label: "Interior", tone: "info" },
];

/** The side as a URL says it (`?side=interior`), never the stored value. */
export type SideParam = "construction" | "interior";

const SIDE_TRACK: Record<SideParam, ActionTrack> = { construction: "sales", interior: "kaadal" };

export function trackForSide(param: string | undefined | null): ActionTrack | null {
  return param && Object.hasOwn(SIDE_TRACK, param) ? SIDE_TRACK[param as SideParam] : null;
}

export function sideForTrack(track: ActionTrack): SideParam {
  return track === "kaadal" ? "interior" : "construction";
}

/** Label and tone for a stored value, or a safe fallback: a value from a newer migration should read as itself, not crash the row. */
export function optionFor<T extends string>(
  options: readonly Option<T>[],
  value: string | null | undefined,
): Option<T> | null {
  if (!value) return null;
  return options.find((option) => option.value === value) ?? null;
}
