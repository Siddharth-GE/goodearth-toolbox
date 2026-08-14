"use client";

import { FormMessage } from "@/components/ui/form-message";
import { resendLoginCode, verifyLoginCode } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState } from "react";

export function VerifyCodeForm() {
  const [state, action, pending] = useActionState(verifyLoginCode, undefined);
  const [resendState, resendAction, resendPending] = useActionState(resendLoginCode, undefined);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>
        <FormMessage error={state?.error ?? resendState?.error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Sign in"}
        </Button>
      </form>
      <form action={resendAction} className="text-center">
        <button
          type="submit"
          disabled={resendPending}
          className="text-muted hover:text-foreground text-sm underline-offset-4 hover:underline disabled:opacity-50"
        >
          {resendPending ? "Sending…" : "Send a new code"}
        </button>
      </form>
    </div>
  );
}
