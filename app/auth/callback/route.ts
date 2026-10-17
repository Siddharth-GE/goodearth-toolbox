import { isOauthSignupLeak } from "@/lib/auth/oauth-guard";
import { markSessionVerified, setTrustedDevice, setVerified } from "@/lib/auth/verified-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Where Google sends people back. Finishes the session, refuses switched-off
 * accounts, undoes an OAuth signup if the "no signups" setting ever regresses, and
 * marks the session verified: Google's login stands in for the emailed code.
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
    // Usually "signups are disabled": nothing was minted.
    return refuse("google");
  }
  const user = data.user;

  // A sanctioned admin-client use: deleting the user cascades the seeded rows.
  const providers = (user.identities ?? []).map((i) => i.provider);
  if (isOauthSignupLeak({ createdAt: user.created_at, identityProviders: providers }, new Date())) {
    console.error(`auth/callback: OAuth signup leak — deleting fresh user ${user.id}`);
    await supabase.auth.signOut();
    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) console.error("auth/callback: could not delete leaked user:", deleteError);
    return refuse("google");
  }

  // Switched off means refused, as on the password path.
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
