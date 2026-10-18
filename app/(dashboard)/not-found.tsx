import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileQuestion } from "lucide-react";

/** The dashboard's 404. Says "or you don't have access": a shared link to a tool you lack is the likeliest cause. */
export default function DashboardNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Not found"
      description="This page doesn't exist, or you don't have access to it. If a colleague sent you the link, they may have a tool granted that you don't."
      action={
        <LinkButton href="/" variant="secondary">
          Go to Overview
        </LinkButton>
      }
    />
  );
}
