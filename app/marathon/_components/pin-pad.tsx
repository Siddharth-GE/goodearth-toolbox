"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { PinState } from "@/lib/marathon/actions";
import { useActionState } from "react";

export function PinPad({
  action,
}: {
  action: (state: PinState, formData: FormData) => Promise<PinState>;
}) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(action, undefined);

  return (
    // max-w-[220px]: a deliberate narrow PIN column (DESIGN.md).
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
      {/* Reserves the line's height so Continue doesn't hop; FormMessage brings the role="alert". */}
      <div className="mt-3 min-h-[1.25rem]">
        <FormMessage error={state?.error} />
      </div>
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
