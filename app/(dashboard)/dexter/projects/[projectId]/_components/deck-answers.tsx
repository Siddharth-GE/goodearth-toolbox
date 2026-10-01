"use client";

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { clearDeckAnswers } from "@/lib/dexter/actions";
import { formatAnswer } from "@/lib/dexter/answers";
import type { DexterDeckRow } from "@/lib/dexter/queries";
import { formatDate, formatTime } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * A deck's saved answers: a badge in the row that opens the answers,
 * field by field, with a Clear button. Plain useState booleans, not
 * useTransition — see the note at the top of deck-actions.tsx.
 */
export function DeckAnswers({
  deck,
}: {
  deck: { id: string; title: string; answers: NonNullable<DexterDeckRow["answers"]> };
}) {
  const router = useRouter();
  const { fields, updatedAt, submittedAt } = deck.answers;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onClear() {
    if (
      !window.confirm(
        "Clear every saved answer for this deck? The client's page will open blank. This can't be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await clearDeckAnswers(deck.id);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const label = submittedAt
    ? `Sent · ${formatDate(submittedAt)}`
    : `In progress · ${formatDate(updatedAt)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Show answers for ${deck.title}`}
          className="cursor-pointer whitespace-nowrap"
        >
          <Badge variant={submittedAt ? "success" : "info"}>{label}</Badge>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Answers — {deck.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Table containerClassName="overflow-x-auto">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Field</TableHeaderCell>
                <TableHeaderCell>Answer</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(fields).map(([name, value]) => (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="break-words whitespace-pre-wrap">
                    {formatAnswer(value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted text-xs">
            Last saved {formatDate(updatedAt)} {formatTime(updatedAt)}
            {submittedAt ? ` · Sent ${formatDate(submittedAt)}` : ""}
          </p>
          <FormMessage error={error} />
        </div>
        <DialogFooter>
          <Button variant="secondary" className="text-danger" disabled={busy} onClick={onClear}>
            {busy ? "Clearing…" : "Clear answers"}
          </Button>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
