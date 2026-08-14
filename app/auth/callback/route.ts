import { isOauthSignupLeak } from "@/lib/auth/oauth-guard";
import { markSessionVerified, setTrustedDevice, setVerified } from "@/lib/auth/verified-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Where Google sends people back.
 *
 * By the time this runs, the project's "no signups" setting has already
 * refused any Google account whose email isn't a team account — that
 * refusal arrives here as an error param and leaves as a plain message
 * on /login. What remains is: finish the session, re-check the things
 * the login action checks for password sign-ins (deactivation), stand
 * guard against the signup setting having silently regressed, and mark
 * the session verified — Google's own login stands in for the emailed
 * code, so this path skips the code screen by design (founder call,
 * 2026-08-14: the code email would go to the same Google inbox).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");

  const refuse = (reason: "google" | "deactivated" | "auth") =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));

  if (!code) return refuse("google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    // The usual shape of "signups are disabled and this account is not
    // on the team". Whatever the wording, nothing was minted.
    return refuse("google");
  }
  const user = data.user;

  // The signup gate is a dashboard setting nobody's CI pins. If it ever
  // regresses, an outside Google account arrives HERE as a brand-new
  // user — google-only identities, seconds old. Undo it entirely: the
  // FK cascade removes the profiles and staff_details rows the triggers
  // just seeded. (A sanctioned admin-client use — CLAUDE.md.)
  const providers = (user.identities ?? []).map((i) => i.provider);
  if (isOauthSignupLeak({ createdAt: user.created_at, identityProviders: providers }, new Date())) {
    console.error(`auth/callback: OAuth signup leak — deleting fresh user ${user.id}`);
    await supabase.auth.signOut();
    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) console.error("auth/callback: could not delete leaked user:", deleteError);
    return refuse("google");
  }

  // Same rule as the password path: deactivated means refused, not
  // seated in a dashboard where every screen redirects.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    return refuse("auth");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return refuse("deactivated");
  }

  await markSessionVerified("oauth");
  await setVerified(user.id);
  await setTrustedDevice(user.id);

  return NextResponse.redirect(new URL("/", url.origin));
}
