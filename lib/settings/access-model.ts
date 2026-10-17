// Pure mirror of has_app() and bill_approval_cap() (0034); if they disagree the database wins and this is the bug.
// A role is ADDITIVE: it never removes a personal grant, so a screen can always say "their role" or "given to them".

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

export function effectiveApps(
  personalApps: Iterable<string>,
  roleApps: Iterable<string>,
): string[] {
  return [...new Set([...personalApps, ...roleApps])].sort();
}

/** null means unlimited, and unlimited from EITHER source wins; otherwise the larger number applies. A source granting no right adds nothing. */
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
