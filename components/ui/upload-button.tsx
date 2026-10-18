"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/lib/action-state";
import { shrinkDocumentForUpload } from "@/lib/uploads/shrink-in-browser";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * One button that uploads a document to a server action. A photo is shrunk in the browser first
 * (lib/uploads/shrink-in-browser.ts) so a phone picture clears the 4 MB cap.
 */
export function UploadButton({
  action,
  fields = {},
  label = "Upload",
  size = "sm",
}: {
  action: (formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string>;
  label?: string;
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const choose = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      let prepared: { blob: Blob; name: string; type: string };
      try {
        prepared = await shrinkDocumentForUpload(file);
      } catch {
        setError("That file could not be read. Upload a photo or a PDF.");
        return;
      }
      const formData = new FormData();
      formData.set("file", new File([prepared.blob], prepared.name, { type: prepared.type }));
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      const result = await action(formData);
      if (result?.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
        }}
      />
      <Button
        variant="secondary"
        size={size}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden />
        {busy ? "Uploading…" : label}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
