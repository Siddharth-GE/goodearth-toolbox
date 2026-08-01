"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

/**
 * The kiosk's own error screen.
 *
 * Separate from the dashboard's because the audience is: a field agent on
 * a phone at a registration desk, mid-queue, who may have basic literacy
 * and no way to reach anyone. So: very few words, one big button, and no
 * technical reference number they'd have no use for.
 */
export default function MarathonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("marathon error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-5 text-center">
      <div>
        <p className="text-foreground text-lg font-bold">Something went wrong</p>
        <p className="text-muted mt-1 text-sm">Please try again.</p>
      </div>
      <Button size="lg" onClick={reset} className="w-full max-w-[280px]">
        Try again
      </Button>
    </div>
  );
}
