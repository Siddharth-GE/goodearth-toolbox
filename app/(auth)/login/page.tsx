import { Logo } from "@/components/ui/logo";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";
import { Suspense } from "react";

// No `searchParams` prop: awaiting it makes /login dynamic (BUGCATCHER #6). ?reset=done is read
// client-side in LoginForm, hence the Suspense.
export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="mb-4 size-12" />
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Toolbox <span className="text-muted">by Kaadal</span>
        </h1>
        <p className="text-muted mt-1 text-sm">Sign in with your work email</p>
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
