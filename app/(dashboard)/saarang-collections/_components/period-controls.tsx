"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePeriod, setPreviousMonth } from "@/lib/saarang-collections/actions";
import { useState, useTransition } from "react";
import { useFormSubmit } from "./use-form-submit";

/** The collection period: any two days, or the whole month before the report date. */
export function PeriodControls({ from, to }: { from: string | null; to: string | null }) {
  const form = useFormSubmit(savePeriod);
  const [error, setError] = useState<string>();
  const [moving, startTransition] = useTransition();

  const previous = () =>
    startTransition(async () => {
      const result = await setPreviousMonth();
      setError(result?.error);
    });

  return (
    <div className="space-y-2">
      <form onSubmit={form.onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="period_from">Collection period from</Label>
          <Input
            id="period_from"
            name="period_from"
            type="date"
            defaultValue={from ?? ""}
            key={`from-${from}`}
            required
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="period_to">to</Label>
          <Input
            id="period_to"
            name="period_to"
            type="date"
            defaultValue={to ?? ""}
            key={`to-${to}`}
            required
            className="w-44"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={form.pending}>
          {form.pending ? "Saving…" : "Set period"}
        </Button>
        <Button type="button" variant="secondary" onClick={previous} disabled={moving}>
          {moving ? "Setting…" : "Previous month"}
        </Button>
      </form>
      <FormMessage error={form.error ?? error} />
    </div>
  );
}
