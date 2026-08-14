import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import Link from "next/link";
import { Suspense } from "react";

// No `searchParams` prop, same reasoning as /login: the ?error=expired
// notice is read client-side in the form so this page prerenders static.
export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="mb-4 size-11" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Forgot password</h1>
        <p className="text-muted mt-1 text-sm">
          Enter your work email and we&rsquo;ll send a link to set a new one.
        </p>
      </div>
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
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
