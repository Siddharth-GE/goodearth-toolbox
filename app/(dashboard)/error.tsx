"use client";

import { recordAppError } from "@/app/actions/record-error";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** The screen when a page throws. Must be a Client Component taking `error` and `reset`. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    console.error("dashboard error:", error);
    // Filed to app_errors (0066), not awaited: platform logs age out within the day. The .catch() is needed
    // because the CALL can reject if the network broke, and recording must never hide the error screen.
    recordAppError({
      digest: error.digest,
      path: pathname,
      message: error.message,
    }).catch(() => {});
  }, [error, pathname]);

  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description="This page couldn't load. Trying again usually fixes it — if it doesn't, send the reference below to whoever looks after the Toolbox."
      action={
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <LinkButton href="/" variant="secondary">
              Go to Overview
            </LinkButton>
          </div>
          {error.digest && (
            <p className="text-muted text-xs">
              Reference: <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </div>
      }
    />
  );
}
