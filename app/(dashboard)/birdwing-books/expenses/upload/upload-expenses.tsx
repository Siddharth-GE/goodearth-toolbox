"use client";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  commitExpenseUpload,
  previewExpenseUpload,
  type PreviewLine,
} from "@/lib/birdwing-books/actions";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { useState, useTransition } from "react";

const SHOWN = 200;

export function UploadExpenses() {
  const [csv, setCsv] = useState("");
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  const preview = (text: string) => {
    setError(undefined);
    setDone(undefined);
    setLines(null);
    startTransition(async () => {
      const result = await previewExpenseUpload(text);
      if (result.error) setError(result.error);
      else setLines(result.lines ?? []);
    });
  };

  const commit = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await commitExpenseUpload(csv);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(
        `${formatCount(result.added ?? 0)} new, ${formatCount(result.skipped ?? 0)} already in` +
          (result.refused ? `, ${formatCount(result.refused)} left out with a problem` : "") +
          ".",
      );
      setLines(null);
      setCsv("");
    });
  };

  const counts = {
    new: lines?.filter((line) => line.state === "new").length ?? 0,
    already: lines?.filter((line) => line.state === "already").length ?? 0,
    problem: lines?.filter((line) => line.state === "problem").length ?? 0,
  };
  const newTotal = (lines ?? [])
    .filter((line) => line.state === "new")
    .reduce((sum, line) => sum + (line.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <p className="text-muted text-sm">
          Save the sheet as CSV (File → Save as → CSV), then choose it — or paste it below. The
          first row must name the columns:{" "}
          <strong>Month, Category, Description / Staff, Date, Amount (INR)</strong>, and Remarks,
          Invoice Link, Source Sheet, Source Cell, Review Note if the sheet has them.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="upload-file">The CSV file</Label>
          <input
            id="upload-file"
            type="file"
            accept=".csv,text/csv"
            className="text-muted file:border-border file:bg-surface-raised file:text-foreground block w-full text-sm file:mr-3 file:rounded-xl file:border file:px-3 file:py-2 file:text-sm"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              setCsv(text);
              preview(text);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="upload-paste">…or paste it</Label>
          <Textarea
            id="upload-paste"
            rows={5}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={pending || !csv.trim()}
            onClick={() => preview(csv)}
          >
            {pending && !lines ? "Reading…" : "Preview"}
          </Button>
          {lines && counts.new > 0 && (
            <Button disabled={pending} onClick={commit}>
              {pending ? "Adding…" : `Add ${formatCount(counts.new)} new lines`}
            </Button>
          )}
        </div>
        <FormMessage error={error} success={done} />
        {done && (
          <LinkButton href="/birdwing-books/expenses" variant="secondary" size="sm">
            See the expenses
          </LinkButton>
        )}
      </Card>

      {lines && (
        <>
          <p className="text-muted text-sm">
            {formatCount(counts.new)} new ({formatMoney(newTotal)}) · {formatCount(counts.already)}{" "}
            already in the books, skipped · {formatCount(counts.problem)} with a problem, left out
          </p>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Row</TableHeaderCell>
                <TableHeaderCell>Line</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                <TableHeaderCell />
              </tr>
            </TableHead>
            <TableBody>
              {lines.slice(0, SHOWN).map((line) => (
                <TableRow key={`${line.row}-${line.sourceKey}`}>
                  <TableCell className="text-muted font-mono text-xs">{line.row}</TableCell>
                  <TableCell>
                    <span className="font-medium">{line.description || "—"}</span>
                    <div className="text-muted text-xs">
                      {[
                        line.head,
                        line.month &&
                          new Date(`${line.month}T00:00:00Z`).toLocaleDateString("en-IN", {
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          }),
                        line.spentOn && `paid ${formatDate(line.spentOn)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {line.problems.length > 0 && (
                      <div className="text-danger text-xs">{line.problems.join(" · ")}</div>
                    )}
                    {line.reviewNote && line.problems.length === 0 && (
                      <div className="text-warning text-xs">{line.reviewNote}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(line.amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        line.state === "new"
                          ? "success"
                          : line.state === "already"
                            ? "neutral"
                            : "danger"
                      }
                    >
                      {line.state === "new"
                        ? "New"
                        : line.state === "already"
                          ? "Already in"
                          : "Problem"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {lines.length > SHOWN && (
            <p className="text-muted text-xs">
              Showing the first {SHOWN} of {formatCount(lines.length)} lines; the counts above are
              for all of them.
            </p>
          )}
        </>
      )}
    </div>
  );
}
