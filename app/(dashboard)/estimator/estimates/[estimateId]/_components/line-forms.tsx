"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  addEstimateLine,
  removeEstimateLine,
  updateEstimateLineQty,
} from "@/lib/estimator/actions";
import type { WorkStatusRow } from "@/lib/estimator/queries";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

/**
 * Add a work to the estimate. The picker is a native select with an
 * optgroup per category — it gets the phone's own wheel picker, and the
 * works vocabulary is already ordered the way the site team reads it.
 */
export function AddLineForm({
  estimateId,
  works,
}: {
  estimateId: string;
  /** Only works that are set up: a work with no unit has nothing to measure. */
  works: WorkStatusRow[];
}) {
  const [state, formAction, pending] = useActionState(
    addEstimateLine.bind(null, estimateId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const [workItemId, setWorkItemId] = useState("");

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      setWorkItemId("");
    }
    wasPending.current = pending;
  }, [pending, state]);

  const categories = [...new Set(works.map((work) => work.categoryCode))];
  const chosen = works.find((work) => work.workItemId === workItemId);

  if (works.length === 0) {
    return (
      <p className="text-muted text-sm">
        No works are set up yet — give a work a unit on the Works tab before adding it here.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="work_item_id">Work</Label>
          <Select
            id="work_item_id"
            name="work_item_id"
            value={workItemId}
            onChange={(event) => setWorkItemId(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose a work
            </option>
            {categories.map((code) => (
              <optgroup
                key={code}
                label={`${code} — ${works.find((w) => w.categoryCode === code)?.categoryName ?? ""}`}
              >
                {works
                  .filter((work) => work.categoryCode === code)
                  .map((work) => (
                    <option key={work.workItemId} value={work.workItemId}>
                      {work.code} — {work.name} ({work.uom})
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            name="qty"
            required
            autoComplete="off"
            inputMode="decimal"
            placeholder={chosen ? `in ${chosen.uom}` : "e.g. 40"}
          />
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" name="note" autoComplete="off" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {chosen && (
        <p className="text-muted text-xs">
          How many {chosen.uom} of {chosen.name} this villa needs.
        </p>
      )}
      <FormMessage error={state?.error} />
    </form>
  );
}

export function LineQtyField({ id, qty, label }: { id: string; qty: number; label: string }) {
  const [value, setValue] = useState(String(qty));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0 || next === qty) {
      setValue(String(qty));
      return;
    }
    startTransition(async () => {
      const result = await updateEstimateLineQty(id, next);
      if (result?.error) {
        setError(result.error);
        setValue(String(qty));
      } else {
        setError(undefined);
      }
    });
  };

  return (
    <div className="space-y-1">
      <Input
        aria-label={`Quantity of ${label}`}
        value={value}
        inputMode="decimal"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setValue(String(qty));
        }}
        disabled={pending}
        className="h-9 max-w-28 text-sm"
      />
      <FormMessage error={error} size="xs" />
    </div>
  );
}

export function RemoveLineButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Remove ${label}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeEstimateLine(id);
            setError(result?.error);
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
    </div>
  );
}
