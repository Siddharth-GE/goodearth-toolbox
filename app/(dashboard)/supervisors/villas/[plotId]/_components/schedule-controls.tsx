"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { setFirstPlan, setVillaStart } from "@/lib/supervisors/programme-actions";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** The one typed date of the schedule: the day the villa's first stage starts. */
export function VillaStartControl({ plotId, startOn }: { plotId: string; startOn: string | null }) {
  const [value, setValue] = useState(startOn ?? "");
  const { pending, error, run } = useActionRunner();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="villa-start">Villa starts on</Label>
      <div className="flex gap-2">
        <Input
          id="villa-start"
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="flex-1"
        />
        <Button
          variant="secondary"
          disabled={pending || value === (startOn ?? "")}
          onClick={() => run(() => setVillaStart({ plotId, startOn: value }))}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormMessage error={error} />
    </div>
  );
}

/** Copies today's forecast into the first plan; setting it again asks why, and the history keeps the answer. */
export function FirstPlanControl({
  plotId,
  baselinedAt,
  handover,
  blocker,
}: {
  plotId: string;
  baselinedAt: string | null;
  handover: string | null;
  blocker: string | null;
}) {
  if (blocker) {
    return (
      <p className="text-muted text-sm">
        {baselinedAt ? `First plan set ${formatDate(baselinedAt)}. ` : null}
        {`To ${baselinedAt ? "set it again" : "set the first plan"}: ${blocker.charAt(0).toLowerCase()}${blocker.slice(1)}`}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-muted text-sm">
        {baselinedAt
          ? `First plan set ${formatDate(baselinedAt)}. Each stage's slip is measured against it.`
          : "No first plan yet. Set it once the dates look right, and every stage's slip is measured against it."}
      </p>
      <ConfirmDialog
        trigger={
          <Button variant={baselinedAt ? "ghost" : "primary"} size="sm">
            {baselinedAt ? "Set it again" : "Set the first plan"}
          </Button>
        }
        title={baselinedAt ? "Set the first plan again?" : "Set the first plan?"}
        description={`Today's dates become the plan this villa is measured against, handover ${formatDate(handover)}.${baselinedAt ? " The old first plan is replaced." : ""}`}
        confirmLabel={baselinedAt ? "Set it again" : "Set the first plan"}
        pendingLabel="Setting…"
        tone="primary"
        reason={
          baselinedAt
            ? { label: "Why set it again?", placeholder: "e.g. The client changed the layout" }
            : undefined
        }
        onConfirm={(note) => setFirstPlan({ plotId, note })}
      />
    </div>
  );
}

/** The date strip's sideways scroll, opened on today rather than on the villa's first day. */
export function ScrollToToday({
  left,
  className,
  children,
}: {
  left: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = Math.max(left - 40, 0);
  }, [left]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
