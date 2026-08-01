"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { issueSelection } from "@/lib/selections/actions";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * The confirmation before a revision becomes permanent.
 *
 * Its job is to make the handoff explicit *before* the click, not after:
 * how much work this is, what changed since the last issued revision, and
 * that there is no undo. The note goes straight to the budget team and is
 * the first thing they read.
 */
export function IssueDialog({
  selectionId,
  revisionNo,
  lineCount,
  spaceCount,
  previousRevisionNo,
  added,
  removed,
  changed,
  unchanged,
}: {
  selectionId: string;
  revisionNo: number;
  lineCount: number;
  spaceCount: number;
  previousRevisionNo: number | null;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const commit = () =>
    startSaving(async () => {
      const outcome = await issueSelection(selectionId, notes || null);
      if (outcome?.error) {
        setError(outcome.error);
        return;
      }
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button>Issue R{revisionNo}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue R{revisionNo} to budgeting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-border bg-surface rounded-xl border p-4">
            <p className="text-foreground text-sm">
              <span className="font-semibold">{lineCount}</span>{" "}
              {lineCount === 1 ? "line" : "lines"} across{" "}
              <span className="font-semibold">{spaceCount}</span>{" "}
              {spaceCount === 1 ? "space" : "spaces"}
            </p>

            {previousRevisionNo === null ? (
              <p className="text-muted mt-1 text-sm">
                This is the first revision — the budget team prices all of it.
              </p>
            ) : (
              <>
                <p className="text-muted mt-3 text-xs font-semibold tracking-widest uppercase">
                  Since R{previousRevisionNo}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <ChangeLine icon="added" count={added} label="added" />
                  <ChangeLine icon="removed" count={removed} label="removed" />
                  <ChangeLine icon="changed" count={changed} label="changed" />
                </ul>
                {/* The reassuring half of the message: the budget team is
                    not being asked to start over. */}
                <p className="text-muted mt-2 text-xs">
                  {unchanged} unchanged {unchanged === 1 ? "line keeps" : "lines keep"} the pricing
                  already given.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-notes">Note for the budget team (optional)</Label>
            <textarea
              id="issue-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                previousRevisionNo === null
                  ? "Anything they should know before pricing this."
                  : "Why this revision exists — what the client changed."
              }
              className="border-border bg-surface text-foreground placeholder:text-muted focus:ring-accent w-full rounded-xl border px-3.5 py-2.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          <p className="text-muted text-sm">
            Once issued, this revision can never be edited. A later change means a new revision.
          </p>

          {error && <p className="text-danger text-sm font-medium">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={commit} disabled={saving || lineCount === 0}>
              {saving ? "Issuing…" : `Issue R${revisionNo}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeLine({
  icon,
  count,
  label,
}: {
  icon: "added" | "removed" | "changed";
  count: number;
  label: string;
}) {
  const Icon = icon === "added" ? Plus : icon === "removed" ? Minus : RefreshCw;
  const tone =
    count === 0
      ? "text-muted"
      : icon === "added"
        ? "text-success"
        : icon === "removed"
          ? "text-danger"
          : "text-warning";
  return (
    <li className="flex items-center gap-2">
      <Icon className={`size-3.5 ${tone}`} />
      <span className={count === 0 ? "text-muted" : "text-foreground"}>
        <span className="font-semibold tabular-nums">{count}</span> {label}
      </span>
    </li>
  );
}
