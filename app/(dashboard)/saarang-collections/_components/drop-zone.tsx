"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uploadReports } from "@/lib/saarang-collections/actions";
import type { UploadState } from "@/lib/saarang-collections/upload";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

/** Drop the Zoho exports, or pick them; they upload as soon as they are chosen. */
export function DropZone() {
  const [result, setResult] = useState<UploadState>();
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    startTransition(async () => {
      setResult(await uploadReports(undefined, data));
      // So picking the same file again, after fixing it, still uploads.
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  // A file dropped beside the box would open in the browser instead of uploading.
  useEffect(() => {
    const stop = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
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
      <Button type="button" disabled={pending} onClick={() => inputRef.current?.click()}>
        {pending ? "Reading the reports…" : "Choose files"}
      </Button>
      <div aria-live="polite" className="space-y-1 text-sm">
        {pending && (
          <div className="flex justify-center">
            <Spinner className="size-4 border-2" />
          </div>
        )}
        {!pending &&
          result?.saved?.split("\n").map((line, i) => (
            <p key={`s${i}`} role="status" className="text-success font-medium">
              {line}
            </p>
          ))}
        {!pending &&
          result?.error?.split("\n").map((line, i) => (
            <p key={`e${i}`} role="alert" className="text-danger font-medium">
              {line}
            </p>
          ))}
      </div>
    </form>
  );
}
