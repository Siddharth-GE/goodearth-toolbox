import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { getDrawingSetDetail } from "@/lib/design-management/queries";
import { getWorksTree } from "@/lib/masters/works";
import { notFound } from "next/navigation";

import {
  DrawingSetDeleteButton,
  DrawingSetFormDialog,
  DrawingSetToggle,
} from "../_components/set-forms";
import { WorksLinkEditor } from "../_components/works-link-editor";

export default async function DrawingSetDetailPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  const [set, tree] = await Promise.all([getDrawingSetDetail(setId), getWorksTree()]);
  if (!set) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={set.code ? `${set.code} — ${set.name}` : set.name}
        description={set.description ?? undefined}
        backHref="/design-management/sets"
        backLabel="All sets"
        actions={
          <>
            <Badge variant={set.isActive ? "success" : "neutral"}>
              {set.isActive ? "Active" : "Inactive"}
            </Badge>
            <DrawingSetFormDialog
              set={set}
              trigger={<Button variant="secondary">Edit details</Button>}
            />
            <DrawingSetToggle id={set.id} isActive={set.isActive} />
            <DrawingSetDeleteButton id={set.id} />
          </>
        }
      />

      <WorksLinkEditor setId={set.id} tree={tree} linkedWorkItemIds={set.workItemIds} />
    </div>
  );
}
