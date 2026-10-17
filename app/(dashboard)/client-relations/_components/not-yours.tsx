import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EyeOff } from "lucide-react";

/**
 * What a team member sees on a plot or a client that is not assigned to
 * them (0123) — instead of "not found", which would read like a bug. Also
 * what a plot's page turns into the moment its owner hands it to a
 * colleague, since the save refreshes the page they are on.
 */
export function NotYours({ kind }: { kind: "plot" | "client" }) {
  return (
    <EmptyState
      icon={EyeOff}
      title={kind === "plot" ? "This plot is not one of yours" : "This client is not one of yours"}
      description={
        kind === "plot"
          ? "A plot shows to its Sales and Kaadal owners, to whoever holds an open action on it, and to team leads. If you just handed it on, it is with your colleague now."
          : "A client shows to whoever looks after them, to the owners of their plots, and to team leads."
      }
      action={
        <LinkButton
          variant="secondary"
          href={kind === "plot" ? "/client-relations/plots" : "/client-relations/clients"}
        >
          {kind === "plot" ? "Back to your plots" : "Back to your clients"}
        </LinkButton>
      }
    />
  );
}
