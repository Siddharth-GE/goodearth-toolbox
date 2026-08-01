import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileQuestion } from "lucide-react";

/**
 * The kiosk's own 404. The dashboard's not-found boundary lives inside
 * the (dashboard) route group and cannot serve /marathon, so without
 * this the PIN page's notFound() (a stale or mistyped agent link)
 * dropped to Next's default unstyled screen, outside the kiosk shell.
 */
export default function MarathonNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Page not found"
      description="This link doesn't work any more. Go back to the start and tap your name."
      action={
        <LinkButton href="/marathon" variant="secondary">
          Back to start
        </LinkButton>
      }
    />
  );
}
