"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGstRate, setGstRateActive } from "@/lib/masters/gst-rates-actions";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

export function GstRateForm() {
  const [state, formAction, pending] = useActionState(addGstRate, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="gst-rate">GST rate (%)</Label>
          <Input
            id="gst-rate"
            name="rate"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            autoComplete="off"
            placeholder="e.g. 18"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

export function GstRateToggle({ rate, isActive }: { rate: number; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setGstRateActive(rate, !isActive);
            setError(result?.error);
          })
        }
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
