"use client";

import { Button } from "@/components/ui/button";
import { verifyAgentPin, type PinState } from "@/lib/marathon/actions";
import { useActionState } from "react";

export function PinPad({ agentId }: { agentId: string }) {
  const action = verifyAgentPin.bind(null, agentId);
  const [state, formAction, pending] = useActionState<PinState, FormData>(action, undefined);

  return (
    <form action={formAction} className="mx-auto mt-6 max-w-[220px]">
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        placeholder="••••"
        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {state?.error && <p className="mt-3 text-sm font-medium text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
