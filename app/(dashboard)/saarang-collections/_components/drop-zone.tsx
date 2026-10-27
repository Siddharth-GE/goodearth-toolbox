"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { checkUploads, uploadReports } from "@/lib/saarang-collections/actions";
import type { CheckState, ReportCheck, UploadState } from "@/lib/saarang-collections/upload";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

const lines = (text: string | undefined) => (text ? text.split("\n") : []);
const plural = (n: number, one: string) => `${formatCount(n)} ${n === 1 ? one : `${one}s`}`;

const totalText = (total: ReportCheck["total"]) =>
  "units" in total ? plural(total.units, "unit") : formatMoney(total.amount);

const NOT_SENT = "Those files changed or could not be sent. Drop them again.";

/** One dropped file before it is saved: what it was read as, beside what is loaded now. */
function CheckCard({ check }: { check: ReportCheck }) {
  return (
    <li>
      <Card className="bg-surface-raised space-y-1 p-4 text-left text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-foreground font-medium">{check.label}</span>
          {check.warnings.length > 0 ? (
            <Badge variant="warning">Check this</Badge>
          ) : (
            <Badge variant="success">Looks right</Badge>
          )}
        </div>
        <p className="text-muted text-xs [overflow-wrap:anywhere]">{check.file}</p>
        <p className="text-foreground tabular-nums">
          {plural(check.rows, "row")} · {totalText(check.total)}
          {check.asOf ? ` · as of ${formatDate(check.asOf)}` : ""}
        </p>
        <p className="text-muted text-xs tabular-nums">
          {check.now
            ? `Loaded now: ${plural(check.now.rowCount, "row")}${check.now.asOf ? `, as of ${formatDate(check.now.asOf)}` : ""}`
            : "Nothing loaded for this report yet."}
        </p>
        {check.warnings.map((warning) => (
          <p key={warning} className="text-warning font-medium">
            {warning}
          </p>
        ))}
      </Card>
    </li>
  );
}

/**
 * Drop the Zoho exports, or pick them. Each is read and shown beside what is loaded now;
 * nothing is saved until Save these reports, which sends the same files again.
 */
export function DropZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [check, setCheck] = useState<CheckState>();
  const [result, setResult] = useState<UploadState>();
  const [doing, setDoing] = useState<"reading" | "saving">("reading");
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formOf = (chosen: File[]) => {
    const data = new FormData();
    for (const file of chosen) data.append("files", file);
    return data;
  };

  const read = (chosen: File[]) => {
    if (pending || chosen.length === 0) return;
    setFiles(chosen);
    setResult(undefined);
    setDoing("reading");
    startTransition(async () => {
      try {
        setCheck(await checkUploads(undefined, formOf(chosen)));
      } catch {
        setCheck({ error: NOT_SENT });
      }
      // So picking the same file again, after fixing it, still reads it.
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const save = () => {
    setDoing("saving");
    startTransition(async () => {
      let saved: UploadState;
      try {
        saved = await uploadReports(undefined, formOf(files));
      } catch {
        saved = { error: NOT_SENT };
      }
      setResult(saved);
      // A save that failed outright keeps the cards, so Save can be pressed again.
      if (saved?.saved || !saved?.error) {
        setCheck(undefined);
        setFiles([]);
      }
    });
  };

  const cancel = () => {
    setCheck(undefined);
    setFiles([]);
  };

  // A file dropped beside the box would open in the browser instead of being read.
  useEffect(() => {
    const stop = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  const checks = check?.checks ?? [];
  const errors = lines(result?.error ?? check?.error);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!pending) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        read([...event.dataTransfer.files]);
      }}
      className={cn(
        "bg-surface flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center transition-colors",
        over ? "border-foreground bg-foreground/[0.04]" : "border-border",
      )}
    >
      <div className="bg-foreground/[0.04] flex size-10 items-center justify-center rounded-full">
        <Upload className="text-muted size-5" aria-hidden />
      </div>
      <p className="text-foreground text-sm font-medium">Drop the Zoho exports here</p>
      <p className="text-muted max-w-prose text-sm">
        Add all eight at once or just the ones that changed. Each file is recognised from its
        columns, so file names don&apos;t matter. Excel (.xlsx) or CSV. You check them before
        anything is saved.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.csv,.xls"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => read([...(event.target.files ?? [])])}
      />
      {checks.length === 0 && (
        <Button type="button" disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending ? "Reading the reports…" : "Choose files"}
        </Button>
      )}

      {checks.length > 0 && (
        <div className="w-full max-w-2xl space-y-3">
          <ul className="space-y-2">
            {checks.map((one) => (
              <CheckCard key={one.slot} check={one} />
            ))}
          </ul>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" disabled={pending} onClick={save}>
              {pending
                ? doing === "saving"
                  ? "Saving…"
                  : "Reading…"
                : checks.length === 1
                  ? "Save this report"
                  : `Save these ${checks.length} reports`}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="space-y-1 text-sm">
        {pending && checks.length === 0 && (
          <div className="flex justify-center">
            <Spinner className="size-4 border-2" />
          </div>
        )}
        {!pending &&
          lines(check?.notice).map((line, i) => (
            <p key={`n${i}`} role="status" className="text-muted">
              {line}
            </p>
          ))}
        {!pending &&
          lines(result?.saved).map((line, i) => (
            <p key={`s${i}`} role="status" className="text-success font-medium">
              {line}
            </p>
          ))}
        {!pending &&
          errors.map((line, i) => (
            <p key={`e${i}`} role="alert" className="text-danger font-medium">
              {line}
            </p>
          ))}
      </div>
    </div>
  );
}
