"use client";

import { Button } from "@/components/ui/button";
import { useUndoBar } from "@/components/ui/undo-bar";
import { Copy } from "lucide-react";

/** Copies a vendor's bank details as typed, for pasting into the bank's own site. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const show = useUndoBar();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          show("Bank details copied");
        } catch {
          show("Couldn't copy here. Select the details and copy them by hand.");
        }
      }}
    >
      <Copy className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}

export function BankBlock({ bank }: { bank: string }) {
  if (!bank.trim()) {
    return (
      <p className="border-border bg-background text-muted rounded-xl border p-3 text-sm italic">
        No bank details saved. Payments go through QR or are not set up yet.
      </p>
    );
  }
  return (
    <div className="border-border bg-background relative rounded-xl border p-3 pr-24">
      <pre className="text-foreground/90 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {bank}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={bank} />
      </div>
    </div>
  );
}
