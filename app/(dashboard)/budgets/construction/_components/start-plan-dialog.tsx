"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { startConstructionPlan } from "@/lib/budgets/construction-actions";
import type { StartableUnit } from "@/lib/budgets/construction";
import { useMemo, useState, useTransition } from "react";

export function StartPlanDialog({ units }: { units: StartableUnit[] }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string>();
  const [starting, startTransition] = useTransition();

  // Units grouped by project so the select stays readable past a handful.
  const groups = useMemo(() => {
    const byProject = new Map<string, StartableUnit[]>();
    for (const unit of units) {
      const group = byProject.get(unit.project_name) ?? [];
      group.push(unit);
      byProject.set(unit.project_name, group);
    }
    return [...byProject.entries()];
  }, [units]);

  const start = () =>
    startTransition(async () => {
      // A success redirects to the new plan, so only errors come back.
      const result = await startConstructionPlan(unitId);
      if (result?.error) setError(result.error);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUnitId("");
          setError(undefined);
        }
      }}
    >
      <Button onClick={() => setOpen(true)}>Start plan</Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start a construction plan</DialogTitle>
          <DialogDescription>
            One living plan per unit. Units that already have one aren&apos;t listed — open theirs
            from the table instead.
          </DialogDescription>
        </DialogHeader>
        {units.length === 0 ? (
          <p className="text-muted text-sm">
            Every unit already has a plan. Add units in Masters first if one is missing.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="plan-unit">Unit</Label>
            <Select
              id="plan-unit"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              <option value="" disabled>
                Choose a unit
              </option>
              {groups.map(([projectName, groupUnits]) => (
                <optgroup key={projectName} label={projectName}>
                  {groupUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        )}
        <FormMessage error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={starting}>
            Cancel
          </Button>
          <Button onClick={start} disabled={starting || !unitId}>
            {starting ? "Starting…" : "Start plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
