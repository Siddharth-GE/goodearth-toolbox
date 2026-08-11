"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { assignPlot } from "@/lib/client-relations/actions";
import type { AssignableUnit } from "@/lib/client-relations/queries";
import { useState, useTransition } from "react";

/**
 * The founder's "once they are a client they can be added to the master".
 *
 * This is the one place Client Relations writes Masters' data, and it goes
 * through crm_assign_unit (0050 §3) rather than touching `units` — a
 * security-definer function that gates itself and touches two columns.
 *
 * Assigning also flips the person from prospect to client, because a
 * prospect holding a plot is a state nobody would ever mean.
 */
export function AssignPlotDialog({
  clientId,
  units,
}: {
  clientId: string;
  units: AssignableUnit[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Assign a plot</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a plot</DialogTitle>
        </DialogHeader>
        <AssignForm clientId={clientId} units={units} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({
  clientId,
  units,
  onSaved,
}: {
  clientId: string;
  units: AssignableUnit[];
  onSaved: () => void;
}) {
  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState<"reserved" | "sold">("reserved");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await assignPlot(clientId, unitId, status);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  };

  if (units.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-muted text-sm">
          Every plot already has a buyer. Add a new plot in Masters first, or release one from the
          client who holds it.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </div>
    );
  }

  return (
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="assign-unit">Plot</Label>
        <Select id="assign-unit" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
          <option value="">Pick a plot…</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.projectName} · {unit.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assign-status">Mark the plot as</Label>
        <Select
          id="assign-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as "reserved" | "sold")}
        >
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </Select>
      </div>

      <p className="text-muted text-xs">
        This also records them as a client rather than a prospect, and shows the plot against them
        in Masters.
      </p>

      <FormMessage error={error} />

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="button" onClick={submit} disabled={!unitId || pending}>
          {pending ? "Assigning…" : "Assign plot"}
        </Button>
      </DialogFooter>
    </fieldset>
  );
}
