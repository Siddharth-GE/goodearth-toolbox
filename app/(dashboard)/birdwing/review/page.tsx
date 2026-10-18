import { EmptyState } from "@/components/ui/empty-state";
import { listCostCentres, listReviewQueue } from "@/lib/birdwing/queries";
import { CircleCheck } from "lucide-react";
import { ReviewBoard } from "./review-board";

export default async function ReviewPage() {
  const [rows, centres] = await Promise.all([listReviewQueue(), listCostCentres()]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Nothing to review"
        description="Every imported stay has been checked, and every Goodearth stay is closed."
      />
    );
  }

  return (
    <ReviewBoard
      rows={rows}
      costCentres={centres
        .filter((centre) => centre.isActive)
        .map((centre) => ({ id: centre.id, name: centre.name }))}
    />
  );
}
