"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uploadReports } from "@/lib/saarang-collections/actions";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useFormSubmit } from "./use-form-submit";

/** Drop the Zoho exports, or pick them; they upload as soon as they are chosen. */
export function DropZone() {
  const form = useFormSubmit(uploadReports, { reset: true });
  const [over, setOver] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      onSubmit={form.onSubmit}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!inputRef.current || event.dataTransfer.files.length === 0) return;
        inputRef.current.files = event.dataTransfer.files;
        send();
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
        columns, so file names don&apos;t matter. Excel (.xlsx) or CSV.
      </p>
      <input
        ref={inputRef}
        type="file"
        name="files"
        multiple
        accept=".xlsx,.csv,.xls"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files?.length) send();
        }}
      />
      <Button type="button" disabled={form.pending} onClick={() => inputRef.current?.click()}>
        {form.pending ? "Reading the reports…" : "Choose files"}
      </Button>
      <div aria-live="polite" className="space-y-1 text-sm">
        {form.pending && (
          <div className="flex justify-center">
            <Spinner className="size-4 border-2" />
          </div>
        )}
        {form.error &&
          form.error.split("\n").map((line, i) => (
            <p key={i} role="alert" className="text-danger font-medium">
              {line}
            </p>
          ))}
        {form.saved && !form.error && (
          <p role="status" className="text-success font-medium">
            Saved. The reports below show what was loaded.
          </p>
        )}
      </div>
    </form>
  );
}
