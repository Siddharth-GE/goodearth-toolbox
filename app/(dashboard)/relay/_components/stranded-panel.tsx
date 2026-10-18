"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { handBaton } from "@/lib/relay/actions";
import type { ChainRow } from "@/lib/relay/queries";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

/** Batons held by deactivated accounts; nothing else would say they cannot move. Admins only, like the hand-over. */
export function StrandedPanel({
  rows,
  people,
}: {
  rows: ChainRow[];
  people: { id: string; name: string }[];
}) {
  const [target, setTarget] = useState<ChainRow | null>(null);
  const [toUser, setToUser] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, run, clearError } = useActionRunner();
  const router = useRouter();

  const close = () => {
    setTarget(null);
    setToUser("");
    setNote("");
    clearError();
  };

  return (
    <>
      <Card className="border-warning/40 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-semibold">
              {rows.length} baton{rows.length === 1 ? " is" : "s are"} stranded
            </p>
            <p className="text-muted mt-0.5 text-sm">
              Held by someone whose account is switched off, so nothing can move until you hand it
              to somebody else.
            </p>
            <ul className="mt-3 space-y-2">
              {rows.map((row) => (
                <li key={row.chainId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground font-medium">
                    {row.activityName}
                    {row.title ? ` · ${row.title}` : ""}
                  </span>
                  <span className="text-muted text-xs">
                    {row.projectName}
                    {row.unitName ? ` · ${row.unitName}` : ""} · {row.daysInLeg}d on leg{" "}
                    {row.currentLeg}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setTarget(row)}
                  >
                    Hand over
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {target && (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hand the baton over</DialogTitle>
              <DialogDescription>
                {target.activityName}
                {target.title ? ` · ${target.title}` : ""} — the leg&apos;s clock keeps running, so
                handing it over cannot make a cold trail look warm.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label htmlFor="stranded-to">Hand to</Label>
                <Select
                  id="stranded-to"
                  className="mt-1 w-full"
                  value={toUser}
                  onChange={(e) => setToUser(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="stranded-note">
                  Note <span className="text-muted font-normal">(required)</span>
                </Label>
                <Textarea
                  id="stranded-note"
                  className="mt-1 min-h-20 w-full"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why is the baton changing hands?"
                />
              </div>
              <FormMessage error={error} />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                disabled={pending}
                onClick={async () => {
                  const result = await run(() => handBaton(target.chainId, toUser, note));
                  if (result?.error) return;
                  router.refresh();
                  close();
                }}
              >
                {pending ? "Working…" : "Hand over"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
