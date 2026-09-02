/**
 * The whole "who typed this?" decision table, as pure rules — the five
 * refusals and the one yes, with nothing in the file that can touch a
 * database, a network or an environment variable.
 *
 * Kept apart from identity.ts (the two reads) for the reason
 * pull-rules.ts and carry-forward.ts are kept apart from their queries:
 * every branch below — including the ones nobody should ever trip — is
 * then pinned by tests, rather than proven by deactivating a real
 * colleague to watch the bot refuse them.
 *
 * This file may import nothing.
 */

/** The Relay grant this door exists to check. Admins hold everything. */
export const RELAY_APP = "/relay";

export type Identity =
  | {
      kind: "ok";
      userId: string;
      fullName: string | null;
      firstName: string;
      isAdmin: boolean;
      grantedApps: string[];
    }
  | { kind: "no-email" | "unknown" | "inactive" | "no-relay" | "failed" };

/** What the two reads found, flattened — the only input the decision needs. */
export type IdentityProfile = {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  /** The union of personal grants and the role bundle's, already merged. */
  apps: string[];
};

/**
 * The decision table, as one pure function.
 *
 * Order matters: "we don't know who you are" comes before "you're
 * switched off", which comes before "you don't have the tool", so the
 * person is always told the first thing that is actually in their way.
 */
export function decideIdentity(
  email: string | null,
  authUser: { id: string } | null,
  profile: IdentityProfile | null,
): Identity {
  if (!email) return { kind: "no-email" };
  if (!authUser) return { kind: "unknown" };
  if (!profile) return { kind: "unknown" };

  // A profile that belongs to somebody else is not a refusal, it's a
  // bug — the two reads disagreed about who this is. Say "I couldn't
  // check" rather than acting on the wrong person's grants.
  if (profile.id !== authUser.id) return { kind: "failed" };

  if (!profile.is_active) return { kind: "inactive" };

  const isAdmin = profile.role === "admin";
  const grantedApps = profile.apps;
  if (!isAdmin && !grantedApps.includes(RELAY_APP)) return { kind: "no-relay" };

  // "Hi there" is a better greeting than "Hi ." — a blank full_name is
  // rare but not impossible.
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "there";

  return {
    kind: "ok",
    userId: profile.id,
    fullName: profile.full_name,
    firstName,
    isAdmin,
    grantedApps,
  };
}
