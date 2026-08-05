import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { hasApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";
import { getClientDetail } from "@/lib/masters/client-detail";
import type { UnitStatus } from "@/lib/masters/units";
import { Boxes } from "lucide-react";
import { notFound } from "next/navigation";
import { ClientFormDialog } from "../_components/client-form-dialog";

const STATUS_VARIANT: Record<UnitStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const [user, { clientId }] = await Promise.all([requireUser(), params]);
  // approved_budgets is RLS-gated to /budgets|/indents — without one of
  // those grants the budget column is omitted, not shown misleadingly empty.
  const includeBudgets = (await hasApp(user, "/budgets")) || (await hasApp(user, "/indents"));
  const detail = await getClientDetail(clientId, { includeBudgets });
  if (!detail) notFound();
  const { client, updatedByName, units } = detail;

  return (
    <div className="space-y-4">
      <PageTitle
        title={client.name}
        backHref="/masters/clients"
        backLabel="All clients"
        description={[client.mobile, client.email].filter(Boolean).join(" · ")}
        actions={
          <>
            <Badge variant={client.is_active ? "success" : "neutral"}>
              {client.is_active ? "Active" : "Inactive"}
            </Badge>
            <ClientFormDialog client={client} />
          </>
        }
      />

      <Card className="space-y-2 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Details</p>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Mobile</dt>
            <dd className="text-foreground">{client.mobile || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="text-foreground">{client.email || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Notes</dt>
            <dd className="text-foreground">{client.notes || "—"}</dd>
          </div>
        </dl>
        <p className="text-muted text-xs">
          Added {formatDate(client.created_at)}
          {client.updated_at && (
            <>
              {" · last edited "}
              {formatDate(client.updated_at)}
              {updatedByName ? ` by ${updatedByName}` : ""}
            </>
          )}
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Units{units.length > 0 && ` — ${units.length}`}
        </p>
        {units.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No units yet"
            description="Assign this client to a unit from the Units tab."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Selection</TableHeaderCell>
                {includeBudgets && <TableHeaderCell>Budget</TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="text-foreground font-medium">
                    {unit.name}
                    {unit.code && (
                      <span className="text-muted ml-2 font-mono text-xs">{unit.code}</span>
                    )}
                  </TableCell>
                  <TableCell>{unit.projectName}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[unit.status]} className="capitalize">
                      {unit.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {unit.issuedRevision != null ? (
                      <>
                        R{unit.issuedRevision}
                        {unit.issuedAt && (
                          <span className="text-muted"> · issued {formatDate(unit.issuedAt)}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">none issued</span>
                    )}
                  </TableCell>
                  {includeBudgets && (
                    <TableCell>
                      {unit.budgetApproved ? (
                        <Badge variant="success">Approved</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
