import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getChecklist } from "@/lib/supervisors/checklist-queries";
import { notFound } from "next/navigation";
import { ChecklistForm } from "./_components/checklist-form";

// One checklist on a phone: the details once, then each check answered Pass, Fail or N/A with a remark, then sign-off.
export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ plotId: string; checklistId: string }>;
}) {
  const { plotId, checklistId } = await params;
  const checklist = await getChecklist(checklistId);
  if (!checklist || checklist.plotId !== plotId) notFound();

  return (
    <div className="space-y-4">
      <PageTitle
        title={checklist.templateName}
        description={`Plot ${checklist.plotName}${checklist.location ? ` · ${checklist.location}` : ""} · started ${formatDate(checklist.startedOn)}`}
        backHref={`/supervisors/villas/${plotId}`}
        backLabel="The villa"
        actions={
          checklist.status === "signed_off" ? (
            <Badge variant="success">Signed off</Badge>
          ) : (
            <Badge variant="info">Open</Badge>
          )
        }
      />
      <ChecklistForm checklist={checklist} />
    </div>
  );
}
