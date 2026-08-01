"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

/**
 * The login shell's error boundary. The (dashboard) one can't serve this
 * route group, and a person who can't even reach the login form has no
 * sidebar to fall back on — so this offers the only action that makes
 * sense here: try again.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("auth error:", error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description="The sign-in page couldn't load. Trying again usually fixes it."
      action={
        <div className="space-y-3">
          <Button onClick={reset}>Try again</Button>
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
