import { Badge } from "@/components/ui/badge";
import { CLIENT_STAGES, optionFor } from "@/lib/client-relations/stages";

/**
 * A client's stage as a badge, from the one lookup in
 * lib/client-relations/stages.ts. The plot-side badges went when the
 * Plots table became lot cards and a plot's choices became chips (root
 * plan.md, seventh piece).
 */
export function ClientStageBadge({ stage }: { stage: string }) {
  const option = optionFor(CLIENT_STAGES, stage);
  if (!option) return <span className="text-muted">—</span>;
  return <Badge variant={option.tone}>{option.label}</Badge>;
}
