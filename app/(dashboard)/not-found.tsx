import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileQuestion } from "lucide-react";

/**
 * The dashboard's 404 — a selection, a budget, a revision diff. It CANNOT
 * serve /marathon (a route group boundary only covers its own group);
 * the kiosk has its own app/marathon/not-found.tsx.
 *
 * Deliberately says "or you don't have access to it": the most likely
 * reason a real staff member lands here is a link shared by a colleague
 * who holds a grant they don't.
 */
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
