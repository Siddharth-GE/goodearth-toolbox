import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileQuestion } from "lucide-react";

/** The kiosk's own 404: the dashboard's boundary lives in its route group and can't serve /marathon. */
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
