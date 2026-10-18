import { Badge } from "@/components/ui/badge";
import { CLIENT_STAGES, optionFor } from "@/lib/client-relations/stages";

export function ClientStageBadge({ stage }: { stage: string }) {
  const option = optionFor(CLIENT_STAGES, stage);
  if (!option) return <span className="text-muted">—</span>;
  return <Badge variant={option.tone}>{option.label}</Badge>;
}
