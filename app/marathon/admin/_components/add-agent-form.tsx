"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAgent, type CreateAgentState } from "@/lib/marathon/actions";
import { useActionState } from "react";

export function AddAgentForm() {
  const [state, formAction, pending] = useActionState<CreateAgentState, FormData>(
    createAgent,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface space-y-3 rounded-2xl border p-3.5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="agent-name">Name</Label>
        <Input id="agent-name" name="name" required maxLength={80} autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agent-pin">PIN (4–6 digits)</Label>
        <Input
          id="agent-pin"
          name="pin"
          inputMode="numeric"
          type="password"
          maxLength={6}
          required
          autoComplete="off"
        />
      </div>
      <FormMessage error={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add Member"}
      </Button>
    </form>
  );
}
