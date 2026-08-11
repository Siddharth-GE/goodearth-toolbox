/**
 * Which colours a person sees, and how that choice survives a reload.
 *
 * There are three states, not two. "Light" and "dark" are explicit
 * choices made with the switch in the user menu; the third is having
 * never touched it, which means "follow whatever this phone or laptop is
 * set to" and is expressed here as `null` — no attribute on <html>, so
 * app/globals.css falls through to its prefers-color-scheme rule.
 *
 * Nothing about the choice is stored on the person's account: it is a
 * cookie on that browser and nothing more. It is read by a blocking
 * inline script in app/layout.tsx, before the page paints — see the note
 * there for why that rather than reading it in the layout itself.
 *
 * Deliberately pure and import-free so it can be tested (see CLAUDE.md:
 * tests are logic only, no browser), and so the layout's script and the
 * client switch share one definition of what a valid value is.
 */

export type Theme = "light" | "dark";

/** Cookie name. Not a secret and not a session — just a preference. */
export const THEME_COOKIE = "ge-theme";

/** A year. Long enough that the switch feels permanent to the person. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * A cookie value as read off the request, narrowed to a theme.
 *
 * Anything unrecognised — absent, empty, stale, or hand-edited in
 * devtools — means "follow the device". A bad cookie must never leave
 * someone stuck on a colour they did not choose and cannot see a way out
 * of, so the fallback is the same as never having chosen.
 */
export function resolveTheme(raw: string | undefined | null): Theme | null {
  return raw === "light" || raw === "dark" ? raw : null;
}

/** The value written back when the switch is flipped. */
export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/**
 * What a person is actually looking at right now.
 *
 * Mirrors the cascade in app/globals.css exactly: an explicit choice on
 * <html> wins, and with no choice the device decides. The switch needs
 * this to know which way to flip — it is the only reason the two sources
 * ever have to be collapsed into one answer.
 *
 * Split out from the click handler so the branch can be tested without a
 * browser; the caller supplies both readings from the DOM.
 */
export function effectiveTheme(attribute: string | undefined, deviceIsDark: boolean): Theme {
  return resolveTheme(attribute) ?? (deviceIsDark ? "dark" : "light");
}

/**
 * The `document.cookie` string the switch assigns.
 *
 * `SameSite=Lax` because nothing here is worth sending cross-site, and
 * no `Secure` flag so the switch also works over plain http on the local
 * dev server. There is nothing sensitive in it either way.
 */
export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
