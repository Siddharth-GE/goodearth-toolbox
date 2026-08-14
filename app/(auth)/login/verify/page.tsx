import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { VerifyCodeForm } from "@/components/verify-code-form";
import { getChallenge, maskEmail } from "@/lib/auth/verified-session";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * The code screen — step two of signing in. Only meaningful behind the
 * challenge cookie the login action sets after a correct password;
 * arriving without one (bookmarked, expired, or never signed in) goes
 * back to the start.
 */
export default async function VerifyLoginPage() {
  const challenge = await getChallenge();
  if (!challenge) redirect("/login");

  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="mb-4 size-11" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="text-muted mt-1 text-sm">
          We sent a 6-digit code to {maskEmail(challenge.subject)}. It works for 10 minutes.
        </p>
      </div>
      <VerifyCodeForm />
      <p className="mt-4 text-center">
        <Link
          href="/login"
          className="text-muted hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
