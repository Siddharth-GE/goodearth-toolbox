"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideIndentLine } from "@/lib/estimator/indent-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

/** Approve or refuse one indent line outside the estimate (0113). A refusal asks why, because the indent's approver reads it. An answer can change while the indent waits. */
export function IndentLineAnswer({
  lineId,
  itemName,
  reference,
  decision,
}: {
  lineId: string;
  itemName: string;
  reference: string;
  decision: "approved" | "refused" | null;
}) {
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run, clearError } = useActionRunner();

  const answer = async (next: "approved" | "refused", text: string) => {
    const result = await run(() => decideIndentLine({ lineId, decision: next, note: text }));
    if (!result?.error) {
      setRefusing(false);
    }
  };

  return (
    <div className="space-y-1 text-right">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {decision !== "refused" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setNote("");
              clearError();
              setRefusing(true);
            }}
          >
            {decision === "approved" ? "Refuse instead" : "Refuse"}
          </Button>
        )}
        {decision !== "approved" && (
          <Button size="sm" disabled={pending} onClick={() => answer("approved", "")}>
            {pending ? "Saving…" : decision === "refused" ? "Approve instead" : "Approve"}
          </Button>
        )}
      </div>
      {!refusing && <FormMessage error={error} size="xs" />}

      <Dialog open={refusing} onOpenChange={setRefusing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refuse {itemName}?</DialogTitle>
            <DialogDescription>
              {reference} cannot be approved while this line is refused. Say why — the indent&apos;s
              approver reads it and sends the indent back to be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-left">
            <Label htmlFor={`refuse-${lineId}`}>Why is it refused?</Label>
            <Textarea
              id={`refuse-${lineId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Use the stock in Farm Store."
              rows={3}
              autoFocus
            />
          </div>
          <FormMessage error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending || !note.trim()} onClick={() => answer("refused", note)}>
              {pending ? "Refusing…" : "Refuse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
