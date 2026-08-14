import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Where the emailed password-reset link lands.
 *
 * The Recovery email template links here with ?token_hash=...&type=recovery
 * (the server-side pattern — a token_hash works in whichever browser the
 * link is opened in, unlike the PKCE code flow, which silently fails when
 * the email is read on a different device from the one that asked).
 *
 * verifyOtp consumes the token: single-use, and dead after the expiry
 * set on the project (10 minutes). Success mints a recovery session in
 * the cookies and moves on to /reset-password; anything wrong lands back
 * on /forgot-password with a plain message and no detail an attacker
 * could use.
 *
 * Only 'recovery' is accepted. Sign-in codes are typed into the verify
 * screen, never clicked, so any other type arriving here is a mistake.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const failed = new URL("/forgot-password?error=expired", url.origin);

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(failed);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(failed);
  }

  return NextResponse.redirect(new URL("/reset-password", url.origin));
}
