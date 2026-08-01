"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addSpace } from "@/lib/selections/actions";
import { useActionState, useEffect, useRef, useState } from "react";

type SpaceType = { id: string; code: string; name: string };

export function AddSpaceDialog({ unitId, spaceTypes }: { unitId: string; spaceTypes: SpaceType[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addSpace.bind(null, unitId), undefined);
  const wasPending = useRef(false);
  // Mirrors the chosen type into the label so "Bedroom" arrives pre-filled
  // and the designer only types the number. Editable, never overwritten
  // once they've touched it.
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setOpen(false);
      setLabel("");
      setLabelTouched(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add space
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a space</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="space_type_id">Type</Label>
            <Select
              id="space_type_id"
              name="space_type_id"
              required
              defaultValue=""
              onChange={(event) => {
                if (labelTouched) return;
                const chosen = spaceTypes.find((t) => t.id === event.target.value);
                if (chosen) setLabel(chosen.name);
              }}
            >
              <option value="" disabled>
                Choose a space type
              </option>
              {spaceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label">Name in this unit</Label>
            <Input
              id="label"
              name="label"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setLabelTouched(true);
              }}
              placeholder="Bedroom 1"
              autoComplete="off"
              required
            />
            <p className="text-xs text-muted">
              Three bedrooms are three spaces — name them so they can be told apart.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Notes for the client document" />
          </div>
          {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add space"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
