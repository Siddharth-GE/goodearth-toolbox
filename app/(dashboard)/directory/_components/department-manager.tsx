"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import { createDepartment, renameDepartment, setDepartmentActive } from "@/lib/directory/actions";
import type { DepartmentRow } from "@/lib/directory/queries";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

/** Relay's SimpleMaster plus inline rename (an import typo must be fixable without a second row). Never deleted: leavers sit in departments on past records; 0060 has no delete policy. */
export function DepartmentManager({ departments }: { departments: DepartmentRow[] }) {
  const [state, formAction, pending] = useActionState(createDepartment, undefined);
  const { pending: busy, error: rowError, run: runAction } = useActionRunner();
  const [editing, setEditing] = useState<string>();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Clear the box only after a save that worked.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state, router]);

  const run = async (work: () => Promise<ActionState>) => {
    const result = await runAction(work);
    if (!result?.error) router.refresh();
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="new-department" className="text-muted text-xs font-semibold">
              Add a department
            </label>
            <Input
              id="new-department"
              name="name"
              className="mt-1 w-full"
              placeholder="e.g. Housekeeping"
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
        {departments.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 p-3.5">
            {editing === row.id ? (
              <Input
                autoFocus
                defaultValue={row.name}
                disabled={busy}
                className="h-9 max-w-56 min-w-0 flex-1"
                aria-label={`Rename ${row.name}`}
                onBlur={async (event) => {
                  const next = event.target.value;
                  if (next.trim() && next !== row.name) {
                    await run(() => renameDepartment(row.id, next));
                  }
                  setEditing(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setEditing(undefined);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(row.id)}
                className="text-foreground hover:text-accent min-w-0 flex-1 text-left text-sm font-medium"
              >
                {row.name}
              </button>
            )}

            <span className="text-muted text-xs">
              {row.people === 1 ? "1 person" : `${row.people} people`}
            </span>
            {!row.isActive && <Badge variant="neutral">Off</Badge>}

            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => setDepartmentActive(row.id, !row.isActive))}
            >
              {row.isActive ? "Switch off" : "Switch on"}
            </Button>
          </div>
        ))}
      </Card>

      <FormMessage error={rowError} />
    </div>
  );
}
