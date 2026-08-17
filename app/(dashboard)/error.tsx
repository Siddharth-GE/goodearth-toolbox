"use client";

import { recordAppError } from "@/app/actions/record-error";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();

  useEffect(() => {
    console.error("dashboard error:", error);
    // Filed to app_errors (0066) so this screen is still answerable
    // tomorrow — Vercel's logs and Supabase's age out within the day,
    // which is what made the 16 Aug 2026 failures so hard to trace. Not
    // awaited, and it swallows its own failures: recording an error must
    // never get in the way of showing one.
    // The .catch() is not decoration: the action swallows its own
    // failures, but the CALL can still reject if the network is what
    // broke — and an unhandled rejection thrown from the error screen is
    // the one place it must never happen.
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
