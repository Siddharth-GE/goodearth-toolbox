/**
 * The colour choice: "light", "dark", or `null` for no choice yet, which shows light (no attribute on <html>).
 * Stored only in a cookie, read by the blocking script in app/layout.tsx. Pure and import-free.
 */

export type Theme = "light" | "dark";

export const THEME_COOKIE = "ge-theme";

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A cookie value narrowed to a theme; anything unrecognised means no choice, so a bad cookie never strands someone. */
export function resolveTheme(raw: string | undefined | null): Theme | null {
  return raw === "light" || raw === "dark" ? raw : null;
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/** What the person is looking at now: light unless they chose dark; the device's setting is ignored. Mirrors app/globals.css. */
export function effectiveTheme(attribute: string | undefined): Theme {
  return resolveTheme(attribute) ?? "light";
}

/** The `document.cookie` string for the switch: SameSite=Lax, no Secure so it also works on plain-http dev. */
export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
