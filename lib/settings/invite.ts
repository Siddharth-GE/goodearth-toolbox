// Pure, so the button and the action agree. These are courtesies: profiles_guard() (0032) refuses the last-admin cases at the database.

export type InviteInput = {
  fullName: string;
  email: string;
  password: string;
};

/** Supabase's own minimum; stated here so the message arrives before the round trip. */
export const MIN_PASSWORD_LENGTH = 8;

// Deliberately loose: catches a typo like a missing "@"; Supabase rejects the rest.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvite(input: InviteInput): string | undefined {
  const name = input.fullName.trim();
  const email = input.email.trim();

  if (!name) return "Enter the person's name.";
  if (name.length > 80) return "Keep the name under 80 characters.";
  if (!email) return "Enter their email address.";
  if (!EMAIL_SHAPE.test(email)) return "That doesn't look like an email address.";
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `The starting password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export type AdminChange = {
  targetIsAdmin: boolean;
  targetIsActive: boolean;
  /** How many active admins exist right now, including the target. */
  activeAdminCount: number;
  isSelf: boolean;
};

/** Why a deactivation or demotion can't go ahead. Removing the last active admin locks everyone out of Settings for good. */
export function blockedReason(change: AdminChange): string | undefined {
  if (change.isSelf) {
    return "You can't change your own admin status or switch off your own account.";
  }
  if (change.targetIsAdmin && change.targetIsActive && change.activeAdminCount <= 1) {
    return "This is the last active admin — make someone else an admin first.";
  }
  return undefined;
}
