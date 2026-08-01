"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetAgentPin, type PinChangeState } from "@/lib/marathon/actions";
import { useActionState, useState } from "react";

/**
 * Resets one agent's PIN, inline on the members list.
 *
 * Collapsed until asked for: the common reason to open this screen is to
 * add somebody, not to reset a PIN, and a row of open PIN boxes next to
 * every name invites the wrong one being filled in.
 */
export function ResetAgentPin({ agentId, name }: { agentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PinChangeState, FormData>(
    resetAgentPin.bind(null, agentId),
    undefined,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-white/[0.06]"
      >
        Reset PIN
      </button>
    );
  }

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-1.5">
      <Input
        name="newPin"
        inputMode="numeric"
        type="password"
        maxLength={6}
        required
        autoComplete="off"
        placeholder="New PIN"
        aria-label={`New PIN for ${name}`}
        className="h-9 w-24"
      />
      <Button type="submit" size="md" disabled={pending} className="h-9 px-3 text-xs">
        {pending ? "…" : "Save"}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Cancel
      </button>
      {state?.error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {state.error}
        </span>
      )}
      {state?.done && (
        <span role="status" className="text-xs font-medium text-success">
          {state.done}
        </span>
      )}
    </form>
  );
}
