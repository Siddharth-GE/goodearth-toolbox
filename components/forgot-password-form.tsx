"use client";

import { FormMessage } from "@/components/ui/form-message";
import { sendPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(sendPasswordReset, undefined);
  // Client-side for the same reason as login-form: the page stays static.
  const expired = useSearchParams().get("error") === "expired";

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {/* The expired-link notice makes way as soon as the form talks. */}
      <FormMessage
        error={
          state?.error ??
          (!state && expired ? "That link has expired — request a new one." : undefined)
        }
        success={state?.success}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
