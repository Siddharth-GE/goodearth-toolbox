import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The emailed reset link lands here with a token_hash, which works in any browser
 * (the PKCE flow fails on another device). Single-use, 10 minutes; failures say
 * nothing an attacker could use. Only 'recovery': sign-in codes are typed, never clicked.
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
