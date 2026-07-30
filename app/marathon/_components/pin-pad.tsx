"use client";

import { Button } from "@/components/ui/button";
import type { PinState } from "@/lib/marathon/actions";
import { useActionState } from "react";

// Shared by both the agent PIN screen and the admin PIN screen — same
// look, same behavior, only the bound action differs.
export function PinPad({
  action,
}: {
  action: (state: PinState, formData: FormData) => Promise<PinState>;
}) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(action, undefined);

  return (
    // max-w-[220px]: a deliberate narrow column for a centered PIN
    // field, not an arbitrary number — see DESIGN.md.
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
      <p
        className={`mt-3 min-h-[1.25rem] text-sm font-medium text-danger transition-opacity ${state?.error ? "opacity-100" : "opacity-0"}`}
      >
        {state?.error ?? " "}
      </p>
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
