"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeAdminPin, type PinChangeState } from "@/lib/marathon/actions";
import { useActionState } from "react";

export function ChangeAdminPinForm() {
  const [state, formAction, pending] = useActionState<PinChangeState, FormData>(
    changeAdminPin,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-surface p-3.5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Admin PIN</h2>
        <p className="text-xs text-muted">
          Opens every admin screen. Everyone who needs it shares it, so change it whenever someone
          leaves the team.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="current-pin">Current PIN</Label>
        <Input
          id="current-pin"
          name="currentPin"
          inputMode="numeric"
          type="password"
          maxLength={6}
          required
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-pin">New PIN (4–6 digits)</Label>
        <Input
          id="new-pin"
          name="newPin"
          inputMode="numeric"
          type="password"
          maxLength={6}
          required
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-pin">Repeat new PIN</Label>
        <Input
          id="confirm-pin"
          name="confirmPin"
          inputMode="numeric"
          type="password"
          maxLength={6}
          required
          autoComplete="off"
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state?.done && (
        <p role="status" className="text-sm font-medium text-success">
          {state.done}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Changing…" : "Change admin PIN"}
      </Button>
    </form>
  );
}
