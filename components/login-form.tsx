"use client";

import { FormMessage } from "@/components/ui/form-message";
import { login, signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

// Messages for the flows that end in a redirect back here (the Google
// callback and the reset flow), where there is no form state to carry
// them. The URL says only a keyword; the words live here.
const PARAM_ERRORS: Record<string, string> = {
  google: "That Google account isn't part of the team. Use your work login, or ask an admin.",
  deactivated: "This account has been deactivated. Ask an admin to switch it back on.",
  auth: "Sign-in didn't complete. Try again.",
};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  // Read client-side so the page itself stays prerendered static — an
  // awaited searchParams prop would make /login dynamic (BUGCATCHER #6).
  const params = useSearchParams();
  const resetDone = params.get("reset") === "done";
  const paramError = PARAM_ERRORS[params.get("error") ?? ""];

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {!state && resetDone && (
          <FormMessage success="Password changed — sign in with the new one." />
        )}
        {!state && paramError && <FormMessage error={paramError} />}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormMessage error={state?.error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted text-xs">or</span>
        <div className="bg-border h-px flex-1" />
      </div>
      <form action={signInWithGoogle}>
        <Button type="submit" variant="secondary" className="w-full">
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
    </div>
  );
}

/** Google's own "G", inline so no external request is needed. Brand
 * colours, not palette tokens — it is a logo, not UI. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.26-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
