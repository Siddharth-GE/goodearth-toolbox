"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

/** A name and an on/off switch. Nothing is ever deleted: finished trails stay readable and prefill history makes repeats quick. */
export function SimpleMaster({
  title,
  hint,
  addLabel,
  placeholder,
  rows,
  createAction,
  setActiveAction,
}: {
  title: string;
  hint: string;
  addLabel: string;
  placeholder: string;
  rows: { id: string; name: string; is_active: boolean }[];
  createAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
  setActiveAction: (id: string, isActive: boolean) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(createAction, undefined);
  // See schedule-editor.tsx: a refresh in a transition keeps the control disabled.
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const inputId = `new-${title.toLowerCase().replace(/\s+/g, "-")}`;

  // Clear the box only after a save that worked (the RecordFormDialog convention).
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state, router]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
        <p className="text-muted mt-0.5 text-sm">{hint}</p>
      </div>

      <Card className="p-4">
        <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor={inputId} className="text-muted text-xs font-semibold">
              {addLabel}
            </label>
            <Input
              id={inputId}
              name="name"
              className="mt-1 w-full"
              placeholder={placeholder}
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
        <FormMessage error={state?.error} className="mt-2" />
      </Card>

      <Card className="divide-border divide-y">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 p-3.5">
            <span className="text-foreground min-w-0 flex-1 text-sm font-medium">{row.name}</span>
            {!row.is_active && <Badge variant="neutral">Off</Badge>}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await setActiveAction(row.id, !row.is_active);
                  router.refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {row.is_active ? "Switch off" : "Switch on"}
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
