import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQuantity } from "@/lib/format";
import { getStockIssue } from "@/lib/inventory/issues-queries";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { RetagWork } from "../../_components/retag-work";
import { notFound } from "next/navigation";

export default async function IssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const [issue, workItems, workCategories] = await Promise.all([
    getStockIssue(issueId),
    listWorkItems(),
    listWorkCategories(),
  ]);
  if (!issue) notFound();
  const categoryNameById = new Map(workCategories.map((c) => [c.id, c.name]));
  const works = workItems
    .filter((work) => work.is_active)
    .map((work) => ({
      id: work.id,
      code: work.code,
      name: work.name,
      category: categoryNameById.get(work.category_id) ?? "Other",
    }));

  return (
    <div className="space-y-4">
      <PageTitle
        title={issue.reference}
        description={`Out of ${issue.store_name} → ${issue.destination}`}
        backHref="/inventory/issues"
        backLabel="Issues"
        actions={
          <Badge variant={issue.is_transfer ? "info" : "warning"}>
            {issue.is_transfer ? "Transfer" : "To site"}
          </Badge>
        }
      />

      <section className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-4">
        <Field label="Out of" value={issue.store_name} />
        <Field label="To" value={issue.destination} />
        {!issue.is_transfer && (
          <div className="min-w-0 sm:col-span-2">
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">
              For the work{issue.work_category ? ` · ${issue.work_category}` : ""}
            </p>
            <div className="mt-1">
              <RetagWork issueId={issue.id} workItemId={issue.work_item_id} works={works} />
            </div>
          </div>
        )}
        <Field label="Issued on" value={formatDate(issue.issued_at)} />
        <div className="min-w-0">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Issued by</p>
          <div className="mt-1 flex items-center gap-2">
            <Attribution name={issue.issued_by_name} label="Issued by" />
            <span className="text-foreground truncate text-sm">{issue.issued_by_name ?? "—"}</span>
          </div>
        </div>
        {issue.note && (
          <div className="sm:col-span-4">
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">Note</p>
            <p className="text-foreground mt-1 text-sm">{issue.note}</p>
          </div>
        )}
      </section>

      {issue.is_transfer && (
        <p className="text-muted text-sm">
          A transfer: this quantity left {issue.store_name} and arrived at {issue.destination}. The
          total held across the company did not change.
        </p>
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-14"></TableHeaderCell>
            <TableHeaderCell>Item</TableHeaderCell>
            <TableHeaderCell className="w-32">Quantity</TableHeaderCell>
            <TableHeaderCell>Note</TableHeaderCell>
            <TableHeaderCell className="w-16">By</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {issue.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                <ItemThumb
                  code={line.item_code}
                  name={line.item_name}
                  thumbUrl={line.item_thumb_url}
                  sizes="48px"
                  className="w-10"
                />
              </TableCell>
              <TableCell>
                <span className="text-foreground font-medium">{line.item_name}</span>
                <div className="text-muted text-xs">
                  {line.item_code ?? "—"}
                  {line.item_brand && <span className="ml-2">{line.item_brand}</span>}
                </div>
              </TableCell>
              <TableCell className="text-foreground">
                {formatQuantity(line.quantity)} {line.uom}
              </TableCell>
              <TableCell className="text-muted">{line.note ?? "—"}</TableCell>
              <TableCell>
                <Attribution name={line.recorded_by_name} label="Recorded by" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-muted text-xs">
        An issue note records something that already happened, so it cannot be deleted. If a
        quantity was wrong, correct it with a stock adjustment — that keeps the reason visible.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground mt-1 truncate text-sm">{value}</p>
    </div>
  );
}
