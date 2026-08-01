"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
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
        className="border-border bg-surface text-foreground focus:ring-accent w-full rounded-2xl border px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:ring-2 focus:outline-none"
      />
      {/* The wrapper reserves the line's height so the Continue button
          doesn't hop down when an error appears; FormMessage inside it
          brings the role="alert" a raw <p> never announced. */}
      <div className="mt-3 min-h-[1.25rem]">
        <FormMessage error={state?.error} />
      </div>
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
