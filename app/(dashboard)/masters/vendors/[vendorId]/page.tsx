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
import { getVendorDetail } from "@/lib/masters/vendor-detail";
import { FileText, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VendorFormDialog } from "../_components/vendor-form-dialog";

// Everything here is money-free (po_facts / bill_facts): what exists
// and where it stands, never what it costs — see lib/masters/vendor-detail.ts.
export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const [user, { vendorId }] = await Promise.all([requireUser(), params]);
  const detail = await getVendorDetail(vendorId);
  if (!detail) notFound();
  const { vendor, updatedByName, pos, poTotal, bills, billTotal, projectNames } = detail;

  const [canSeePos, canSeeBills] = await Promise.all([
    hasApp(user, "/purchase-orders"),
    hasApp(user, "/bills"),
  ]);
  const projectName = (id: string) => projectNames.get(id) ?? "—";

  return (
    <div className="space-y-4">
      <PageTitle
        title={vendor.name}
        backHref="/masters/vendors"
        backLabel="All vendors"
        description={[vendor.contact_name, vendor.mobile, vendor.gst_no]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Badge variant={vendor.is_active ? "success" : "neutral"}>
              {vendor.is_active ? "Active" : "Inactive"}
            </Badge>
            <VendorFormDialog vendor={vendor} />
          </>
        }
      />

      <Card className="space-y-2 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Details</p>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Contact person</dt>
            <dd className="text-foreground">{vendor.contact_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Mobile</dt>
            <dd className="text-foreground">{vendor.mobile || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">GST number</dt>
            <dd className="text-foreground">{vendor.gst_no || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Address</dt>
            <dd className="text-foreground">{vendor.address || "—"}</dd>
          </div>
        </dl>
        <p className="text-muted text-xs">
          Added {formatDate(vendor.created_at)}
          {vendor.updated_at && (
            <>
              {" · last edited "}
              {formatDate(vendor.updated_at)}
              {updatedByName ? ` by ${updatedByName}` : ""}
            </>
          )}
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Purchase orders{poTotal > 0 && ` — ${pos.length} of ${poTotal}`}
        </p>
        {pos.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No purchase orders"
            description="Nothing has been ordered from this vendor yet."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Issued</TableHeaderCell>
                <TableHeaderCell>Expected by</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pos.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="text-foreground font-medium">
                    {canSeePos ? (
                      <Link href={`/purchase-orders/${po.id}`} className="hover:underline">
                        {po.reference}
                      </Link>
                    ) : (
                      po.reference
                    )}
                  </TableCell>
                  <TableCell>{projectName(po.project_id)}</TableCell>
                  <TableCell>
                    <Badge variant={po.status === "issued" ? "success" : "neutral"}>
                      {po.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{po.issued_at ? formatDate(po.issued_at) : "—"}</TableCell>
                  <TableCell>{po.expected_by ? formatDate(po.expected_by) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Bills{billTotal > 0 && ` — ${bills.length} of ${billTotal}`}
        </p>
        {bills.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No bills"
            description="No bills have been recorded against this vendor yet."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Invoice date</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="text-foreground font-medium">
                    {canSeeBills ? (
                      <Link href={`/bills/${bill.id}`} className="hover:underline">
                        {bill.reference}
                      </Link>
                    ) : (
                      bill.reference
                    )}
                  </TableCell>
                  <TableCell>{projectName(bill.project_id)}</TableCell>
                  <TableCell className="capitalize">{bill.kind.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        bill.status === "paid"
                          ? "success"
                          : bill.status === "approved"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {bill.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{bill.invoice_date ? formatDate(bill.invoice_date) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
