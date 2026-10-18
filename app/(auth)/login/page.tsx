import { LoginForm } from "@/components/login-form";
import Link from "next/link";
import { Suspense } from "react";

// No `searchParams` prop: awaiting it makes /login dynamic (BUGCATCHER #6). ?reset=done is read
// client-side in LoginForm, hence the Suspense.
export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-foreground font-display text-3xl font-medium">Sign in</h1>
        <p className="text-muted mt-2 text-sm">With your work email</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="mt-4 text-center">
        <Link
          href="/forgot-password"
          className="text-muted hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
