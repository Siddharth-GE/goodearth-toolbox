"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCashRequest } from "@/lib/bills/payment-actions";
import { useState, useTransition } from "react";
import { todayInIndia } from "@/lib/format";

export function StartRequest() {
  const [day, setDay] = useState(() => todayInIndia());
  const [error, setError] = useState<string>();
  const [starting, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="request-week">For the week of</Label>
        <Input
          id="request-week"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className="w-44"
        />
      </div>
      <Button
        disabled={starting || !day}
        onClick={() =>
          startTransition(async () => {
            // A success lands on the new request; only a refusal comes back.
            const result = await createCashRequest(day);
            if (result?.error) setError(result.error);
          })
        }
      >
        {starting ? "Starting…" : "Start a cash request"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
