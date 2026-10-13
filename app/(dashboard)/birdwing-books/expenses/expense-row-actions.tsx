"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/ui/form-message";
import type { SearchOption } from "@/components/ui/search-select";
import { UploadButton } from "@/components/ui/upload-button";
import { deleteExpense, setExpenseStatus } from "@/lib/birdwing-books/actions";
import { deleteExpenseFile, uploadExpenseFile } from "@/lib/birdwing-books/files-actions";
import type { ExpenseRow, HeadRow } from "@/lib/birdwing-books/queries";
import { formatMoney } from "@/lib/format";
import { FileText, MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { ExpenseDialog } from "./expense-dialog";

/**
 * A line's bill and its controls. A salary line belongs to its confirmed
 * run and shows only that; a confirmed line must be marked recorded again
 * before it can be changed or removed (0116's guard says the same).
 */
export function ExpenseRowActions({
  row,
  heads,
  vendors,
}: {
  row: ExpenseRow;
  heads: HeadRow[];
  vendors: SearchOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<"line" | "bill" | null>(null);

  if (row.isSalary) return <Badge variant="neutral">Salary</Badge>;

  const run = (work: () => Promise<{ error?: string } | undefined>) => {
    setError(undefined);
    startTransition(async () => {
      const result = await work();
      if (result?.error) setError(result.error);
    });
  };
  const recorded = row.status === "recorded";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {row.files.length > 0 ? (
          <a
            href={`/birdwing-books/files/${row.files[0].id}`}
            target="_blank"
            rel="noopener"
            className="text-accent inline-flex items-center gap-1 px-2 text-xs font-medium whitespace-nowrap"
          >
            <FileText className="size-3.5" aria-hidden />
            Bill
          </a>
        ) : (
          <UploadButton action={uploadExpenseFile.bind(null, row.id)} label="Bill" />
        )}
        {recorded && (
          <ExpenseDialog
            heads={heads}
            vendors={vendors}
            month={row.month}
            expense={row}
            trigger={
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            }
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`More for ${row.description}`}
              disabled={pending}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                run(() => setExpenseStatus(row.id, recorded ? "confirmed" : "recorded"))
              }
            >
              {recorded ? "Confirm — checked against the bill" : "Mark recorded again"}
            </DropdownMenuItem>
            {row.files.length > 0 && (
              <DropdownMenuItem onSelect={() => setRemoving("bill")}>
                Remove the bill
              </DropdownMenuItem>
            )}
            {recorded && (
              <DropdownMenuItem onSelect={() => setRemoving("line")}>
                Remove the line
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <FormMessage error={error} size="xs" />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title={removing === "bill" ? "Remove the bill?" : "Remove this line?"}
        description={
          removing === "bill"
            ? `The bill on "${row.description}" is deleted for good; the line stays.`
            : `"${row.description}", ${formatMoney(row.amount)}, comes off ${row.headName}.`
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        onConfirm={() =>
          removing === "bill" ? deleteExpenseFile(row.files[0].id) : deleteExpense(row.id)
        }
      />
    </div>
  );
}
