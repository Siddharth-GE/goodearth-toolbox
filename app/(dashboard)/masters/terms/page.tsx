import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { TERMS_KIND_LABEL, TERMS_KINDS } from "@/lib/masters/constants";
import { listDocumentTerms } from "@/lib/masters/terms";
import { ScrollText } from "lucide-react";
import { TermsFormDialog } from "./_components/terms-form-dialog";

export default async function TermsPage() {
  const terms = await listDocumentTerms();

  return (
    <div className="space-y-8">
      <p className="text-muted max-w-2xl text-sm">
        Reusable terms and conditions. A new PO or work order starts with its kind&apos;s default
        and can be edited on the document itself.
      </p>

      {TERMS_KINDS.map((kind) => {
        const rows = terms.filter((row) => row.kind === kind);
        return (
          <section key={kind} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                {TERMS_KIND_LABEL[kind]}
              </p>
              <TermsFormDialog kind={kind} />
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="No terms yet"
                description={`Write the terms ${TERMS_KIND_LABEL[kind].toLowerCase()} should start with, and mark them as the default.`}
              />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Begins</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell></TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-foreground font-medium">{row.name}</TableCell>
                      <TableCell className="max-w-md">
                        <p className="line-clamp-2 text-xs">{row.body}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.is_default && <Badge variant="info">Default</Badge>}
                          <Badge variant={row.is_active ? "success" : "neutral"}>
                            {row.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <TermsFormDialog terms={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        );
      })}
    </div>
  );
}
