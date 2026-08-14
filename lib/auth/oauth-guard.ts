/**
 * The belt-and-braces check behind Google sign-in — pure, so the exact
 * boundary is pinned by tests. This file may import nothing.
 *
 * The real gate is the project setting "allow new users to sign up =
 * off": an unknown Google account cannot create a user at all, while a
 * known email links to its existing account (Supabase links verified
 * same-email identities automatically). This predicate exists for the
 * day that setting silently regresses — a dashboard toggle no migration
 * or CI pins. If a brand-new user materialises out of an OAuth
 * callback, the callback deletes it again rather than seating a
 * stranger.
 *
 * "Brand-new out of OAuth" must NOT catch a real colleague invited
 * minutes ago who signs straight in with Google: an invited person is
 * created with an email identity, so by the time they arrive here they
 * hold email + google. A user whose ONLY identity is google can only
 * have been created by the OAuth signup path itself; the age window is
 * a second fence so a config regression discovered late still fails
 * closed for new arrivals without deleting long-standing accounts —
 * those are for a human to look at.
 */

export const FRESH_SIGNUP_WINDOW_MS = 10 * 60 * 1000;

export type OAuthUserShape = {
  /** ISO timestamp the auth user row was created. */
  createdAt: string;
  /** The providers of every identity on the user, e.g. ["email","google"]. */
  identityProviders: string[];
};

/** True when this user should not exist: minted by an OAuth signup that
 * the project settings are supposed to forbid. */
export function isOauthSignupLeak(user: OAuthUserShape, now: Date): boolean {
  const onlyGoogle =
    user.identityProviders.length > 0 && user.identityProviders.every((p) => p === "google");
  if (!onlyGoogle) return false;

  const createdAt = new Date(user.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return now.getTime() - createdAt < FRESH_SIGNUP_WINDOW_MS;
}
