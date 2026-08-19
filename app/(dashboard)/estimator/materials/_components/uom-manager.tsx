"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { createUom, deleteUom } from "@/lib/estimator/actions";
import type { UomRow } from "@/lib/estimator/queries";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

/**
 * The units list, managed where the price list lives. Deliberately
 * small: add and remove. The saved uom columns are text, so removing a
 * unit never touches an existing row — it only leaves the pickers.
 */
export function UomManager({ uoms }: { uoms: UomRow[] }) {
  const [state, formAction, pending] = useActionState(createUom, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {uoms.map((uom) => (
          <UomChip key={uom.id} uom={uom} />
        ))}
      </div>
      <form ref={formRef} action={formAction} className="flex items-end gap-2">
        <div className="w-44">
          <Input
            name="name"
            aria-label="New unit"
            required
            autoComplete="off"
            placeholder="e.g. brass"
            maxLength={20}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add unit"}
        </Button>
      </form>
      <FormMessage error={state?.error} />
    </div>
  );
}

function UomChip({ uom }: { uom: UomRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="border-border bg-surface text-foreground inline-flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-3 text-sm">
      {uom.name}
      {uom.useCount > 0 ? (
        <span className="text-muted text-xs">{uom.useCount}</span>
      ) : (
        <button
          type="button"
          aria-label={`Remove ${uom.name}`}
          className="text-muted hover:text-danger px-1 text-xs disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteUom(uom.id);
              setError(result?.error);
            })
          }
        >
          ✕
        </button>
      )}
      {error && <span className="text-danger text-xs">{error}</span>}
    </span>
  );
}
