import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/page-title";
import { formatDate } from "@/lib/format";
import { getChecklist } from "@/lib/supervisors/checklist-queries";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { ChecklistForm } from "./_components/checklist-form";
import { ChecklistRunner } from "./_components/checklist-runner";

// One checklist on a phone. Open, it runs one check per screen; the list (?view=list) holds the details and every answer for review.
export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ plotId: string; checklistId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ plotId, checklistId }, { view }] = await Promise.all([params, searchParams]);
  const checklist = await getChecklist(checklistId);
  if (!checklist || checklist.plotId !== plotId) notFound();
  const here = `/supervisors/villas/${plotId}/checklists/${checklistId}`;

  return (
    <div className="space-y-4">
      <PageTitle
        title={checklist.templateName}
        description={`Plot ${checklist.plotName}${checklist.location ? ` · ${checklist.location}` : ""} · started ${formatDate(checklist.startedOn)}`}
        backHref={`/supervisors/villas/${plotId}?tab=checklists`}
        backLabel="The villa"
        actions={
          checklist.status === "signed_off" ? (
            <Badge variant="success">Signed off</Badge>
          ) : (
            <Badge variant="info">Open</Badge>
          )
        }
      />
      {checklist.status === "open" && view !== "list" ? (
        <ChecklistRunner checklist={checklist} listHref={`${here}?view=list`} />
      ) : (
        <>
          {checklist.status === "open" ? (
            <LinkButton href={here} variant="secondary" className="w-full sm:w-auto">
              One check at a time
            </LinkButton>
          ) : null}
          <ChecklistForm checklist={checklist} />
        </>
      )}
    </div>
  );
}
