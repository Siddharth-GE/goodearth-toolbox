import { VerifyCodeForm } from "@/components/verify-code-form";
import { getChallenge, maskEmail } from "@/lib/auth/verified-session";
import Link from "next/link";
import { redirect } from "next/navigation";

/** Step two of signing in; only meaningful behind the challenge cookie the login action sets, else back to the start. */
export default async function VerifyLoginPage() {
  const challenge = await getChallenge();
  if (!challenge) redirect("/login");

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <h1 className="text-foreground font-display text-3xl font-medium">Check your email</h1>
        <p className="text-muted mt-2 text-sm">
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
    </div>
  );
}
