"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { createActivity, setActivityActive } from "@/lib/pusher/actions";
import { useActionState, useEffect, useRef, useTransition } from "react";

/**
 * The activity master. Deliberately the plainest screen in the tool:
 * a name, and an on/off switch.
 *
 * Activities are switched off, never deleted — every finished trail
 * behind one has to stay readable, and the prefill history is what makes
 * opening a repeat quick.
 */
export function ActivityList({
  activities,
}: {
  activities: { id: string; name: string; is_active: boolean }[];
}) {
  const [state, formAction, pending] = useActionState(createActivity, undefined);
  const [busy, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Clear the box only after a save that actually worked, so a rejected
  // name is still there to fix (the RecordFormDialog convention).
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="new-activity" className="text-muted text-xs font-semibold">
              Add an activity
            </label>
            <Input
              id="new-activity"
              name="name"
              className="mt-1 w-full"
              placeholder="e.g. Drawing approval"
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
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-center gap-3 p-3.5">
            <span className="text-foreground min-w-0 flex-1 text-sm font-medium">
              {activity.name}
            </span>
            {!activity.is_active && <Badge variant="neutral">Off</Badge>}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                startTransition(() => {
                  void setActivityActive(activity.id, !activity.is_active);
                })
              }
            >
              {activity.is_active ? "Switch off" : "Switch on"}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
