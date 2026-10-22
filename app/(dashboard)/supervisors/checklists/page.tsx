import { PageTitle } from "@/components/ui/page-title";
import { listChecklistTemplates } from "@/lib/supervisors/checklist-queries";
import { TemplateDialog, TemplateList } from "./_components/template-editor";

// The site's checklists, kept by supervisors. A check is never reworded once in use — switch it off and add the new one.
export default async function ChecklistTemplatesPage() {
  const templates = await listChecklistTemplates();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Checklists"
        description="The checks a supervisor answers on site, per villa."
        backHref="/supervisors"
        backLabel="Supervisors"
        actions={<TemplateDialog />}
      />
      {templates.length === 0 ? (
        <p className="text-muted text-sm">
          No checklists yet. New checklist adds the first; the operations team&apos;s workbook is
          loaded by an import.
        </p>
      ) : (
        <TemplateList templates={templates} />
      )}
    </div>
  );
}
