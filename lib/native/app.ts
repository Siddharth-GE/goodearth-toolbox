// The phone app (mobile/PLAN.md) shows the site in its own web view and says so only
// through this mark on the user agent. Pure: the server reads the header and asks here.
export const APP_USER_AGENT_MARK = "KaadalToolboxApp";

// Google refuses to sign in inside a web view, so the app signs in through a Chrome tab
// and Google returns here; the app then finishes on the site's /auth/callback, where its
// PKCE cookie lives. Must be on Supabase's redirect allow-list.
export const APP_AUTH_CALLBACK = "com.kaadalgroup.toolbox://auth/callback";

export function isPhoneApp(userAgent: string | null | undefined): boolean {
  return userAgent ? /(^|\s)KaadalToolboxApp(\s|\/|$)/.test(userAgent) : false;
}
