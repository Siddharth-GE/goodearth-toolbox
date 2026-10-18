"use client";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Large enough to read off a screen and copy in one press; it selects whole, so a phone that refuses the clipboard can copy by hand. */
export function BatchId({ label, size = "lg" }: { label: string; size?: "lg" | "md" }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(label);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <span className="inline-flex items-center gap-1">
        <span
          className={cn(
            "text-foreground font-mono font-semibold tracking-tight whitespace-nowrap select-all",
            size === "lg" ? "text-lg" : "text-sm",
          )}
        >
          {label}
        </span>
        <IconButton
          size="sm"
          onClick={copy}
          aria-label={copied ? `Copied ${label}` : `Copy batch ID ${label}`}
          title={copied ? "Copied" : "Copy batch ID"}
        >
          {copied ? <Check className="text-success size-4" /> : <Copy className="size-4" />}
        </IconButton>
      </span>
      {failed && (
        <span className="text-muted text-xs">
          Copy didn&apos;t work here — press and hold the ID to copy it.
        </span>
      )}
    </span>
  );
}
