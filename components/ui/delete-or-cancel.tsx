"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ActionState } from "@/lib/action-state";

/** What a record allows: deleted while nothing uses it, cancelled with a reason once something does, or neither yet. */
export type Removal = { kind: "delete" } | { kind: "cancel" } | { kind: "blocked"; why: string };

/**
 * The one way a record goes (plan.md, Piece 4). Each tool decides the Removal from its own rules; the database guard
 * refuses anything the button offers wrongly, and that refusal shows inside the dialog.
 */
export function DeleteOrCancel({
  noun,
  removal,
  onDelete,
  onCancel,
  deleteNote = "Nothing uses it yet, so it goes for good.",
  verb = "Cancel",
  cancelNote = "It leaves every list and total, and stays on record with your reason. This can't be undone.",
}: {
  /** As it reads after "this": "indent", "draft revision". */
  noun: string;
  removal: Removal | null;
  onDelete?: () => Promise<ActionState>;
  onCancel?: (reason: string) => Promise<ActionState>;
  deleteNote?: string;
  /** What going is called once something depends on it: an official estimate is withdrawn. */
  /** "Delete" asks a reason too: a stock record that already moved stock (0146). */
  verb?: "Cancel" | "Withdraw" | "Delete";
  cancelNote?: string;
}) {
  const doing = { Cancel: "Cancelling…", Withdraw: "Withdrawing…", Delete: "Deleting…" }[verb];
  const done = { Cancel: "cancelled", Withdraw: "withdrawn", Delete: "deleted" }[verb];
  if (!removal) return null;

  if (removal.kind === "delete" && onDelete) {
    return (
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" className="text-danger">
            Delete
          </Button>
        }
        title={`Delete this ${noun}?`}
        description={deleteNote}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => onDelete()}
      />
    );
  }

  if (removal.kind === "cancel" && onCancel) {
    return (
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" className="text-danger">
            {verb} {noun}
          </Button>
        }
        title={`${verb} this ${noun}?`}
        description={cancelNote}
        confirmLabel={`${verb} ${noun}`}
        pendingLabel={doing}
        reason={{ label: `Why is it ${done}?`, placeholder: "Raised twice by mistake" }}
        onConfirm={(reason) => onCancel(reason)}
      />
    );
  }

  if (removal.kind === "blocked") {
    return (
      <div className="space-y-1 text-right">
        <Button variant="ghost" size="sm" disabled>
          Cancel {noun}
        </Button>
        <p className="text-muted max-w-xs text-xs">{removal.why}</p>
      </div>
    );
  }

  return null;
}
