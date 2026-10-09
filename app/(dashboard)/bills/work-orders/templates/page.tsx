import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { listWorkOrderTemplates } from "@/lib/bills/work-order-queries";
import { formatCount } from "@/lib/format";
import { ClipboardList } from "lucide-react";
import { TemplateSwitch } from "../_components/work-order-buttons";

/**
 * Work-order templates (0105): a name, terms and a list of works with no
 * quantities or rates. Made with "Save as template" on any work order;
 * offered by "Start from a template" on a new one. Never deleted —
 * switched off, a template stops being offered.
 */
export default async function WorkOrderTemplatesPage() {
  const templates = await listWorkOrderTemplates();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Work order templates"
        backHref="/bills/work-orders"
        backLabel="Work orders"
        description="Standard sets of works and terms. Make one with Save as template on any work order; a new order starts from it."
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No templates yet"
          description="Open a work order with the works and terms you use often, and press Save as template."
        />
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id} className="space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-foreground text-[15px] font-semibold tracking-tight">
                    {template.name}
                  </p>
                  {!template.is_active && <Badge variant="neutral">Switched off</Badge>}
                </div>
                <TemplateSwitch templateId={template.id} isActive={template.is_active} />
              </div>
              <p className="text-muted text-xs">
                {`${formatCount(template.lines.length)} ${template.lines.length === 1 ? "work" : "works"}${template.terms ? " · with terms" : ""}`}
              </p>
              <ul className="text-foreground list-disc space-y-0.5 pl-5 text-sm">
                {template.lines.map((line, index) => (
                  <li key={index}>
                    {line.description}
                    <span className="text-muted">
                      {line.is_lump_sum ? " · lump sum" : line.uom ? ` · per ${line.uom}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
