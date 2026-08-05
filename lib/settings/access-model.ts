/**
 * How a role's bundle and a person's own grants combine.
 *
 * Pure, so the screens and the database can be checked against each
 * other without a round trip. It mirrors has_app() and
 * bill_approval_cap() (migration 0034) — if these two ever disagree,
 * the database wins and this is the bug.
 *
 * The rule everywhere: a role is ADDITIVE. Personal grants are never
 * taken away by a role, and a role never removes anything — so a
 * screen can always answer "why does this person have this?" with
 * either "their role" or "it was given to them", never "it was taken".
 */

/** Where a granted app came from. Absent means not granted at all. */
export type GrantSource = "personal" | "role" | "both";

export type EffectiveGrant = {
  granted: boolean;
  source: GrantSource | null;
};

export function effectiveGrant(
  app: string,
  personalApps: ReadonlySet<string>,
  roleApps: ReadonlySet<string>,
): EffectiveGrant {
  const personal = personalApps.has(app);
  const fromRole = roleApps.has(app);
  if (personal && fromRole) return { granted: true, source: "both" };
  if (personal) return { granted: true, source: "personal" };
  if (fromRole) return { granted: true, source: "role" };
  return { granted: false, source: null };
}

/** The union, for a sidebar or a count. */
export function effectiveApps(
  personalApps: Iterable<string>,
  roleApps: Iterable<string>,
): string[] {
  return [...new Set([...personalApps, ...roleApps])].sort();
}

export type ApprovalRight = {
  /** Named personally (bill_approvers / indent_approvers). */
  personal: boolean;
  /** Whether the assigned role carries the right. */
  fromRole: boolean;
};

export function canApproveEffective(right: ApprovalRight): boolean {
  return right.personal || right.fromRole;
}

/**
 * The ceiling that actually applies, given both sources.
 *
 * null means unlimited, and unlimited from EITHER source wins — being
 * named personally must never leave someone able to approve less than
 * their role alone would have allowed, and vice versa. Otherwise the
 * larger number applies. A source that grants no right at all
 * contributes nothing.
 */
export function effectiveApprovalLimit(
  personal: { isApprover: boolean; limit: number | null },
  role: { canApprove: boolean; limit: number | null },
): number | null {
  const personalCounts = personal.isApprover;
  const roleCounts = role.canApprove;

  if (!personalCounts && !roleCounts) return null;
  if (personalCounts && personal.limit === null) return null;
  if (roleCounts && role.limit === null) return null;

  const limits: number[] = [];
  if (personalCounts && personal.limit !== null) limits.push(personal.limit);
  if (roleCounts && role.limit !== null) limits.push(role.limit);
  return limits.length ? Math.max(...limits) : null;
}
