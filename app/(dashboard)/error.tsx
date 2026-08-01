"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

/**
 * What a signed-in user sees when a page throws.
 *
 * Until this existed there was no error boundary anywhere in the app, so
 * any failed query showed Next's default grey error screen — no
 * navigation, no sidebar, nothing to click, and no indication whether the
 * problem was theirs or ours.
 *
 * Must be a Client Component and must accept `error` and `reset`; that's
 * the contract Next expects of an error boundary.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel's function logs are the only place this is visible today.
    // The digest is what ties this screen to the server-side stack trace.
    console.error("dashboard error:", error);
  }, [error]);

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
