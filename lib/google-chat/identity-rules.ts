// The "who typed this?" decision table as pure rules, so every branch is pinned by tests. Imports nothing.

export const RELAY_APP = "/relay";

export type Identity =
  | {
      kind: "ok";
      userId: string;
      // Carried forward so act-as.ts mints a session for exactly the email that was proven.
      email: string;
      fullName: string | null;
      firstName: string;
      isAdmin: boolean;
      grantedApps: string[];
    }
  | { kind: "no-email" | "unknown" | "inactive" | "no-relay" | "failed" };

export type IdentityProfile = {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  apps: string[];
};

// Order matters: the person hears the first thing actually in their way.
export function decideIdentity(
  email: string | null,
  authUser: { id: string } | null,
  profile: IdentityProfile | null,
): Identity {
  if (!email) return { kind: "no-email" };
  if (!authUser) return { kind: "unknown" };
  if (!profile) return { kind: "unknown" };

  // A profile of somebody else is a bug (the reads disagreed), not a refusal: don't act on it.
  if (profile.id !== authUser.id) return { kind: "failed" };

  if (!profile.is_active) return { kind: "inactive" };

  const isAdmin = profile.role === "admin";
  const grantedApps = profile.apps;
  if (!isAdmin && !grantedApps.includes(RELAY_APP)) return { kind: "no-relay" };

  // A blank full_name is rare but possible.
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "there";

  return {
    kind: "ok",
    userId: profile.id,
    email,
    fullName: profile.full_name,
    firstName,
    isAdmin,
    grantedApps,
  };
}
