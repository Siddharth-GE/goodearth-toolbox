/**
 * A second fence behind Google sign-in; the real gate is the project's "no signups"
 * setting, which no migration or CI pins. A user whose only identity is google, and
 * who is minutes old, can only be an OAuth signup: the callback deletes it. An
 * invited colleague holds email + google, so is never caught. Pure and tested.
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
