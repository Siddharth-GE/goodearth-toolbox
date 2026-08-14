import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";
import { Suspense } from "react";

// Deliberately no `searchParams` prop: awaiting it makes this page
// dynamic, and /login is one of the three prerendered-static routes
// (BUGCATCHER #6 — the theme cookie cost them once already). The
// ?reset=done message is read client-side inside LoginForm instead,
// which is why the form sits in Suspense (useSearchParams needs it).
export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="mb-4 size-11" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Goodearth Toolbox</h1>
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
    </Card>
  );
}
